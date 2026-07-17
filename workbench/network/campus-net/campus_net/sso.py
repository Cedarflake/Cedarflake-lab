from __future__ import annotations

import base64
import binascii
import json
from collections.abc import Mapping
from dataclasses import dataclass
from enum import Enum
from html.parser import HTMLParser
from urllib.parse import ParseResult, parse_qsl, urlencode, urljoin, urlparse, urlsplit, urlunsplit

from Crypto.Cipher import AES

SSO_LOGIN_PATH = "/sam-sso/login"
AUTH_SUCCESS_PATH = "/portal/assets/auth-success.html"
CAPTCHA_ERROR_CODE = "1320007"
MAX_CAPTCHA_BYTES = 2 * 1024 * 1024


class SsoProtocolError(RuntimeError):
    pass


class UnsupportedSsoChallenge(SsoProtocolError):
    pass


class LoginResultType(Enum):
    SUCCESS = "success"
    CAPTCHA_ERROR = "captcha_error"
    FAILURE = "failure"
    UNKNOWN = "unknown"


@dataclass(frozen=True)
class SsoPage:
    page_url: str
    action_url: str
    crypto_key: str
    execution: str
    recaptcha_vendor: str
    risk_system_switch: str
    error_code: str
    error_message: str


@dataclass(frozen=True)
class CaptchaRequirement:
    required: bool
    image_path: str | None


@dataclass(frozen=True)
class LoginResult:
    result_type: LoginResultType
    next_page: SsoPage | None = None
    error_code: str = ""
    error_message: str = ""
    redirect_url: str | None = None


class _PageMetadataParser(HTMLParser):
    METADATA_IDS = frozenset(
        {
            "login-croypto",
            "login-page-flowkey",
            "recaptchaVendor",
            "riskSystemSwitch",
            "login-error-code",
            "login-error-msg",
        }
    )

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.values: dict[str, str] = {}
        self.duplicate_ids: set[str] = set()
        self._current_id: str | None = None
        self._depth = 0
        self._parts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if self._current_id is not None:
            self._depth += 1
            return
        element_id = dict(attrs).get("id")
        if element_id in self.METADATA_IDS:
            if element_id in self.values:
                self.duplicate_ids.add(element_id)
            self._current_id = element_id
            self._depth = 1
            self._parts = []

    def handle_data(self, data: str) -> None:
        if self._current_id is not None:
            self._parts.append(data)

    def handle_endtag(self, tag: str) -> None:
        if self._current_id is not None:
            self._depth -= 1
            if self._depth == 0:
                self.values[self._current_id] = "".join(self._parts).strip()
                self._current_id = None
                self._parts = []


def parse_sso_page(page_body: bytes, page_url: str, *, language: str = "zh-CN") -> SsoPage:
    values = _parse_page_metadata(page_body)
    crypto_key = values.get("login-croypto", "")
    execution = values.get("login-page-flowkey", "")
    if not crypto_key or not execution:
        raise SsoProtocolError("SSO 页面缺少动态加密密钥或 execution")
    try:
        decoded_key = base64.b64decode(crypto_key, validate=True)
    except (binascii.Error, ValueError) as error:
        raise SsoProtocolError("SSO 页面加密密钥不是有效 Base64") from error
    if len(decoded_key) != 16:
        raise SsoProtocolError("SSO 页面加密密钥不是 128 位")

    return SsoPage(
        page_url=page_url,
        action_url=build_sso_action_url(page_url, language=language),
        crypto_key=crypto_key,
        execution=execution,
        recaptcha_vendor=values.get("recaptchaVendor", "").casefold(),
        risk_system_switch=values.get("riskSystemSwitch", ""),
        error_code=values.get("login-error-code", ""),
        error_message=values.get("login-error-msg", ""),
    )


def _parse_page_metadata(page_body: bytes) -> dict[str, str]:
    parser = _PageMetadataParser()
    parser.feed(page_body.decode("utf-8", errors="replace"))
    if parser.duplicate_ids:
        duplicate_ids = ", ".join(sorted(parser.duplicate_ids))
        raise SsoProtocolError(f"SSO 页面包含重复的关键元素：{duplicate_ids}")
    return parser.values


def ensure_supported_challenge(page: SsoPage) -> None:
    if page.recaptcha_vendor not in {"", "system"}:
        raise UnsupportedSsoChallenge(f"纯 HTTP 模式不支持 {page.recaptcha_vendor} 验证码")
    if page.risk_system_switch == "USTC":
        raise UnsupportedSsoChallenge("纯 HTTP 模式不支持 USTC 指纹风控")


def build_sso_action_url(page_url: str, *, language: str) -> str:
    parsed = urlsplit(page_url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise SsoProtocolError("SSO 页面 URL 无效")
    if parsed.username is not None or parsed.password is not None or parsed.fragment:
        raise SsoProtocolError("SSO 页面 URL 包含不允许的用户信息或片段")
    query = [
        (key, value)
        for key, value in parse_qsl(parsed.query, keep_blank_values=True)
        if key != "accept-language"
    ]
    query.append(("accept-language", language))
    return urlunsplit((parsed.scheme, parsed.netloc, SSO_LOGIN_PATH, urlencode(query), ""))


def parse_captcha_requirement(payload: object) -> CaptchaRequirement:
    if not isinstance(payload, dict):
        raise SsoProtocolError("验证码策略响应不是 JSON 对象")
    data = payload.get("data")
    if data is None:
        return CaptchaRequirement(required=False, image_path=None)
    if not isinstance(data, dict):
        raise SsoProtocolError("验证码策略响应缺少 data")
    if "captchaInvisible" not in data:
        return CaptchaRequirement(required=False, image_path=None)
    required = data.get("captchaInvisible")
    if not isinstance(required, bool):
        raise SsoProtocolError("验证码策略响应缺少 captchaInvisible")
    image_path = data.get("captchaUrl")
    if required and (not isinstance(image_path, str) or not image_path.strip()):
        raise SsoProtocolError("验证码策略要求图形码但没有图片路径")
    return CaptchaRequirement(
        required=required,
        image_path=image_path.strip() if isinstance(image_path, str) and image_path else None,
    )


def resolve_captcha_url(page_url: str, image_path: str) -> str:
    page = urlparse(page_url)
    image_reference = urlparse(image_path)
    if (
        image_reference.scheme
        or image_reference.netloc
        or image_reference.username is not None
        or image_reference.password is not None
        or image_reference.fragment
    ):
        raise SsoProtocolError("验证码图片路径必须是当前 SSO 下的相对路径")
    allowed_roots = ("/sam-sso/", "/sso/")
    if image_path.startswith("/") and not image_path.startswith(allowed_roots):
        raise SsoProtocolError("验证码图片路径不属于允许的 SSO 根路径")
    if image_path.startswith(allowed_roots):
        candidate = urljoin(page_url, image_path)
    else:
        candidate = urljoin(page_url, "/sam-sso/" + image_path.lstrip("/"))
    parsed = urlparse(candidate)
    if (
        _normalized_origin(parsed) != _normalized_origin(page)
        or parsed.username is not None
        or parsed.password is not None
        or parsed.fragment
        or parsed.params
        or not parsed.path.startswith(allowed_roots)
    ):
        raise SsoProtocolError("验证码图片 URL 越出当前 SSO origin")
    return candidate


def aes_encrypt(crypto_key: str, plaintext: str) -> str:
    try:
        key = base64.b64decode(crypto_key, validate=True)
    except (binascii.Error, ValueError) as error:
        raise SsoProtocolError("SSO 加密密钥不是有效 Base64") from error
    if len(key) != 16:
        raise SsoProtocolError("SSO 加密密钥不是 128 位")
    encoded = plaintext.encode("utf-8")
    padding_length = AES.block_size - len(encoded) % AES.block_size
    padded = encoded + bytes([padding_length]) * padding_length
    encrypted = AES.new(key, AES.MODE_ECB).encrypt(padded)
    return base64.b64encode(encrypted).decode("ascii")


def build_login_form(
    page: SsoPage,
    *,
    username: str,
    password: str,
    captcha_code: str,
    captcha_required: bool,
) -> list[tuple[str, str]]:
    ensure_supported_challenge(page)
    code = captcha_code.strip()
    if captcha_required and not code:
        raise ValueError("验证码不能为空")

    fields = [
        ("username", username),
        ("type", "UsernamePassword"),
        ("_eventId", "submit"),
        ("geolocation", ""),
        ("execution", page.execution),
        ("captcha_code", code),
        ("croypto", page.crypto_key),
        ("password", aes_encrypt(page.crypto_key, password)),
        ("captcha_payload", aes_encrypt(page.crypto_key, json.dumps({}, separators=(",", ":")))),
    ]
    if captcha_required:
        fields.append(("captcha_code", code))
    return fields


def parse_login_response(
    *,
    status: int,
    headers: Mapping[str, str],
    body: bytes,
    page_url: str,
) -> LoginResult:
    location = next(
        (value for key, value in headers.items() if key.casefold() == "location"),
        "",
    )
    if status in {302, 303} and location:
        target = urlparse(urljoin(page_url, location))
        source = urlparse(page_url)
        query_parameters = parse_qsl(target.query, keep_blank_values=True)
        tickets = [value for key, value in query_parameters if key == "ticket"]
        if (
            _normalized_origin(target) == _normalized_origin(source)
            and target.path == AUTH_SUCCESS_PATH
            and not target.params
            and len(tickets) == 1
            and tickets[0]
            and target.username is None
            and target.password is None
            and not target.fragment
        ):
            return LoginResult(
                LoginResultType.SUCCESS,
                redirect_url=urljoin(page_url, location),
            )
        return LoginResult(LoginResultType.UNKNOWN)

    if status == 200:
        values = _parse_page_metadata(body)
        error_code = values.get("login-error-code", "")
        error_message = values.get("login-error-msg", "")
        has_error = bool(error_code or error_message)
        next_page = None
        if has_error:
            try:
                next_page = parse_sso_page(body, page_url)
            except SsoProtocolError:
                next_page = None
        else:
            next_page = parse_sso_page(body, page_url)
        if CAPTCHA_ERROR_CODE in {error_code, error_message}:
            return LoginResult(
                LoginResultType.CAPTCHA_ERROR,
                next_page=next_page,
                error_code=error_code,
                error_message=error_message,
            )
        if has_error:
            return LoginResult(
                LoginResultType.FAILURE,
                next_page=next_page,
                error_code=error_code,
                error_message=error_message,
            )
    return LoginResult(LoginResultType.UNKNOWN)


def _normalized_origin(parsed_url: ParseResult) -> tuple[str, str, int]:
    if not parsed_url.hostname:
        raise SsoProtocolError("SSO URL 缺少 host")
    try:
        port = parsed_url.port
    except ValueError as error:
        raise SsoProtocolError("SSO URL 端口无效") from error
    if port is None:
        port = 80 if parsed_url.scheme.casefold() == "http" else 443
    return parsed_url.scheme.casefold(), parsed_url.hostname.casefold(), port
