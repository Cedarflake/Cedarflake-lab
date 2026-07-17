from __future__ import annotations

import asyncio
import base64
import hashlib
import json
import secrets
import time
from collections.abc import Awaitable, Callable, Collection, Mapping
from dataclasses import dataclass
from urllib.parse import ParseResult, parse_qsl, quote, urlencode, urljoin, urlparse

import aiohttp

from .captive import NetworkState, ProbeResult, probe_connectivity
from .config import CaptiveHttpConfig
from .sso import (
    MAX_CAPTCHA_BYTES,
    CaptchaRequirement,
    LoginResultType,
    SsoPage,
    SsoProtocolError,
    build_login_form,
    ensure_supported_challenge,
    parse_captcha_requirement,
    parse_login_response,
    parse_sso_page,
    resolve_captcha_url,
)

PORTAL_MAIN_PATH = "/portal/portal-main"
PORTAL_HEADERS = {"isPortal": "true"}
CAPTCHA_POLICY_PATH = "/sam-sso/api/protected/user/findCaptchaCount/"
DEFAULT_CAPTCHA_SWITCH = "DEFAULT_CAPTCHA_SWITCH"
CSRF_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"

CaptchaProvider = Callable[[bytes, str], Awaitable[str]]


class PortalProtocolError(RuntimeError):
    pass


class PortalTransientError(PortalProtocolError):
    pass


class AuthenticationRejected(RuntimeError):
    pass


class AuthenticationUncertain(RuntimeError):
    pass


@dataclass(frozen=True)
class PortalContext:
    session_id: str
    custom_page_id: str
    nas_ip: str
    user_ip: str
    user_mac: str
    current_node_path: str


@dataclass(frozen=True)
class InitializationResult:
    probe: ProbeResult
    context: PortalContext | None = None


class AggregatePortalClient:
    def __init__(
        self,
        session: aiohttp.ClientSession,
        config: CaptiveHttpConfig,
    ) -> None:
        self.session = session
        self.config = config

    async def initialize(self) -> InitializationResult:
        probe = await probe_connectivity(self.session, self.config)
        if probe.state is not NetworkState.CAPTIVE:
            return InitializationResult(probe=probe)
        if probe.captive_url is None:
            raise PortalProtocolError("captive 探测没有返回入口 URL")

        async with self.session.get(
            probe.captive_url,
            allow_redirects=False,
        ) as response:
            location = response.headers.get("Location", "")
            if response.status != 302 or not location:
                raise PortalProtocolError("captive 入口没有返回预期的 302")

        portal_main_url = urljoin(probe.captive_url, location)
        self._require_portal_url(portal_main_url, expected_path=PORTAL_MAIN_PATH)
        parameters = _unique_query_parameters(portal_main_url)
        required = ("sessionId", "customPageId", "nasIp", "userIp", "userMac")
        missing = [key for key in required if not parameters.get(key)]
        if missing:
            raise PortalProtocolError("门户初始化重定向缺少参数：" + ", ".join(sorted(missing)))

        async with self.session.get(portal_main_url, allow_redirects=False) as response:
            if response.status != 200:
                raise PortalProtocolError(f"portal-main 返回意外状态码 {response.status}")
            await response.content.read(64 * 1024)

        session_id = parameters["sessionId"]
        await self._query_terminal(session_id)
        await self._get_identity_config(session_id)
        current_node = await self.get_current_node(session_id)
        return InitializationResult(
            probe=probe,
            context=PortalContext(
                session_id=session_id,
                custom_page_id=parameters["customPageId"],
                nas_ip=parameters["nasIp"],
                user_ip=parameters["userIp"],
                user_mac=parameters["userMac"],
                current_node_path=current_node,
            ),
        )

    async def authenticate(
        self,
        context: PortalContext,
        *,
        username: str,
        password: str,
        captcha_provider: CaptchaProvider,
    ) -> None:
        page = await self._load_sso_page(context)
        captcha_error_count = 0
        captcha_required_by_previous_error = False
        is_first_submission = True
        while True:
            ensure_supported_challenge(page)
            if is_first_submission:
                requirement = await self._get_captcha_requirement(DEFAULT_CAPTCHA_SWITCH)
            else:
                requirement = await self._get_captcha_requirement(username)
            if is_first_submission and not requirement.required:
                requirement = await self._get_captcha_requirement(username)
            if captcha_required_by_previous_error and not requirement.required:
                raise PortalProtocolError(
                    "服务端刚拒绝了验证码，但新策略没有返回可用图片；未继续提交"
                )
            captcha_code = ""
            if requirement.required:
                image, content_type = await self._load_captcha(page, requirement)
                captcha_code = (await captcha_provider(image, content_type)).strip()
                if not captcha_code:
                    raise AuthenticationRejected("未提供验证码")

            form = build_login_form(
                page,
                username=username,
                password=password,
                captcha_code=captcha_code,
                captcha_required=requirement.required,
            )
            try:
                async with self.session.post(
                    page.action_url,
                    data=form,
                    headers={
                        "Origin": self.config.portal_origin,
                        "Referer": page.page_url,
                    },
                    allow_redirects=False,
                ) as response:
                    body = await _read_limited_body(
                        response,
                        512 * 1024,
                        operation="SSO 登录响应",
                    )
                    try:
                        result = parse_login_response(
                            status=response.status,
                            headers=response.headers,
                            body=body,
                            page_url=page.page_url,
                        )
                    except SsoProtocolError as error:
                        raise AuthenticationUncertain(
                            "SSO POST 已返回但响应无法确认；未自动重放请求"
                        ) from error
            except (aiohttp.ClientError, TimeoutError) as error:
                raise AuthenticationUncertain("SSO POST 结果未知；未自动重放请求") from error

            if result.result_type is LoginResultType.SUCCESS:
                if result.redirect_url is not None:
                    try:
                        async with self.session.get(
                            result.redirect_url,
                            headers={"Referer": page.action_url},
                            allow_redirects=False,
                        ) as response:
                            await response.content.read(64 * 1024)
                            if response.status != 200:
                                raise AuthenticationUncertain(
                                    "SSO 成功回调状态未知；未自动重放登录请求"
                                )
                    except (aiohttp.ClientError, TimeoutError) as error:
                        raise AuthenticationUncertain(
                            "SSO 成功回调失败；未自动重放登录请求"
                        ) from error
                return
            if result.result_type is LoginResultType.CAPTCHA_ERROR:
                if requirement.required:
                    captcha_error_count += 1
                if (
                    self.config.captcha_attempts > 0
                    and captcha_error_count >= self.config.captcha_attempts
                ):
                    break
                page = result.next_page or await self._load_sso_page(context)
                captcha_required_by_previous_error = True
                is_first_submission = False
                continue
            if result.result_type is LoginResultType.FAILURE:
                error_message = result.error_message.strip()
                for secret, replacement in (
                    (username, "[账号]"),
                    (password, "[密码]"),
                    (captcha_code, "[验证码]"),
                ):
                    if secret:
                        error_message = error_message.replace(secret, replacement)
                if len(error_message) > 200:
                    error_message = error_message[:200] + "…"
                if result.error_code and error_message:
                    detail = f"{result.error_code}：{error_message}"
                else:
                    detail = result.error_code or error_message or "未提供错误详情"
                raise AuthenticationRejected(f"SSO 拒绝登录：{detail}")
            raise AuthenticationUncertain("无法确认 SSO POST 的结果；未自动重放请求")

        raise AuthenticationRejected("验证码尝试次数已用完")

    async def wait_for_node(
        self,
        session_id: str,
        expected_paths: str | Collection[str],
        *,
        timeout_seconds: float = 8,
    ) -> str:
        paths = (
            frozenset({expected_paths})
            if isinstance(expected_paths, str)
            else frozenset(expected_paths)
        )
        if not paths:
            raise ValueError("expected_paths 不能为空")
        loop = asyncio.get_running_loop()
        deadline = loop.time() + timeout_seconds
        while loop.time() < deadline:
            try:
                current_path = await self.get_current_node(session_id)
            except (PortalTransientError, aiohttp.ClientError, TimeoutError):
                await asyncio.sleep(0.5)
                continue
            if current_path in paths:
                return current_path
            await asyncio.sleep(0.5)
        expected = ", ".join(sorted(paths))
        raise PortalProtocolError(f"门户工作流没有进入以下节点之一：{expected}")

    async def select_service(self, session_id: str, display_name: str) -> None:
        response = await self._portal_json(
            "POST",
            "/eportal/network/serviceSelection",
            json={"sessionId": session_id},
        )
        data = _require_success_data(response, "运营商列表")
        if not isinstance(data, list):
            raise PortalProtocolError("运营商列表 data 不是数组")

        matches = [
            item
            for item in data
            if isinstance(item, dict)
            and isinstance(item.get("key"), str)
            and item["key"].strip() == display_name
            and isinstance(item.get("value"), str)
            and item["value"]
        ]
        if len(matches) != 1:
            raise PortalProtocolError(f"运营商显示名 {display_name!r} 的匹配数量不是 1")

        try:
            result = await self._portal_json(
                "POST",
                "/eportal/network/serviceLogin",
                json={"sessionId": session_id, "service": matches[0]["value"]},
            )
        except (PortalProtocolError, aiohttp.ClientError, TimeoutError) as error:
            raise AuthenticationUncertain("运营商认证 POST 结果未知；未自动重放请求") from error
        try:
            result_data = _require_success_data(result, "运营商认证")
        except PortalProtocolError as error:
            raise AuthenticationRejected("运营商认证被门户明确拒绝") from error
        if not isinstance(result_data, dict) or result_data.get("authResult") != "success":
            raise AuthenticationRejected("运营商认证没有返回 success")

    async def trigger_online_check(self, session_id: str) -> None:
        try:
            response = await self._portal_json(
                "POST",
                "/eportal/network/userOnline",
                json={"sessionId": session_id},
            )
        except (PortalProtocolError, aiohttp.ClientError, TimeoutError) as error:
            raise AuthenticationUncertain("门户在线检查 POST 结果未知；未自动重放请求") from error
        if not isinstance(response, Mapping):
            raise AuthenticationUncertain("门户在线检查响应无法确认；未自动重放请求")
        if response.get("code") != 200:
            raise AuthenticationRejected("门户在线检查被明确拒绝")
        data = response.get("data")
        if not isinstance(data, dict) or data.get("online") is not True:
            raise AuthenticationRejected("门户在线检查明确返回离线")

    async def verify_online(self, session_id: str) -> bool:
        loop = asyncio.get_running_loop()
        deadline = loop.time() + self.config.verification_timeout_seconds
        while loop.time() < deadline:
            try:
                portal_online = await self._is_portal_online(session_id)
            except (PortalTransientError, aiohttp.ClientError, TimeoutError):
                portal_online = False
            probe = await probe_connectivity(self.session, self.config)
            if portal_online and probe.state is NetworkState.ONLINE:
                return True
            await asyncio.sleep(self.config.verification_interval_seconds)
        return False

    async def get_current_node(self, session_id: str) -> str:
        response = await self._portal_json(
            "POST",
            "/eportal/workFlow/getCurrentNode",
            json={"sessionId": session_id, "flowKey": "portal_auth"},
        )
        data = _require_success_data(response, "当前工作流节点")
        if not isinstance(data, dict) or not isinstance(data.get("currentNodePath"), str):
            raise PortalProtocolError("当前工作流节点缺少 currentNodePath")
        return data["currentNodePath"]

    async def _load_sso_page(self, context: PortalContext) -> SsoPage:
        query = urlencode(
            {
                "flowSessionId": context.session_id,
                "customPageId": context.custom_page_id,
                "preview": "false",
                "appType": "normal",
                "language": "zh-CN",
                "nasIp": context.nas_ip,
                "userIp": context.user_ip,
                "userMac": context.user_mac,
            }
        )
        page_url = urljoin(self.config.portal_origin, "/sam-sso/login") + "?" + query
        async with self.session.get(page_url, allow_redirects=False) as response:
            if response.status != 200:
                raise PortalProtocolError(f"SSO 登录页返回状态码 {response.status}")
            body = await _read_limited_body(
                response,
                512 * 1024,
                operation="SSO 登录页",
            )
        return parse_sso_page(body, page_url)

    async def _get_captcha_requirement(self, username: str) -> CaptchaRequirement:
        path = CAPTCHA_POLICY_PATH + quote(username, safe="")
        policy_url = _append_get_timestamp(urljoin(self.config.portal_origin, path))
        async with self.session.get(
            policy_url,
            headers=_protected_sso_headers(),
            allow_redirects=False,
        ) as response:
            if response.status != 200:
                raise PortalProtocolError(f"验证码策略返回状态码 {response.status}")
            body = await _read_limited_body(
                response,
                256 * 1024,
                operation="验证码策略",
            )
            try:
                payload = json.loads(body)
            except (UnicodeDecodeError, json.JSONDecodeError) as error:
                raise PortalProtocolError("验证码策略返回非 JSON 内容") from error
        if not isinstance(payload, Mapping) or payload.get("code") != 200:
            code = payload.get("code") if isinstance(payload, Mapping) else None
            raise PortalProtocolError(f"验证码策略业务状态不是 200：{code}")
        return parse_captcha_requirement(payload)

    async def _load_captcha(
        self,
        page: SsoPage,
        requirement: CaptchaRequirement,
    ) -> tuple[bytes, str]:
        if requirement.image_path is None:
            raise PortalProtocolError("验证码策略没有图片路径")
        image_url = _append_get_timestamp(
            resolve_captcha_url(page.page_url, requirement.image_path)
        )
        headers = _protected_sso_headers() if "protected" in image_url else _sso_headers()
        async with self.session.get(
            image_url,
            headers=headers,
            allow_redirects=False,
        ) as response:
            content_type = response.headers.get("Content-Type", "").split(";", 1)[0]
            if response.status != 200 or not content_type.startswith("image/"):
                raise PortalProtocolError("验证码图片响应无效")
            image = await _read_limited_body(
                response,
                MAX_CAPTCHA_BYTES,
                operation="验证码图片",
            )
        return image, content_type

    async def _query_terminal(self, session_id: str) -> None:
        response = await self._portal_json(
            "GET",
            "/eportal/adaptor/queryTerminalInfo",
            params={
                "sessionId": session_id,
                "macAddr": "",
                "_": str(int(time.time() * 1000)),
                "version": "this is a git-commit",
            },
        )
        data = _require_success_data(response, "终端信息")
        if not isinstance(data, dict) or not data.get("ipAddr"):
            raise PortalProtocolError("终端信息缺少 IP 地址")

    async def _get_identity_config(self, session_id: str) -> None:
        response = await self._portal_json(
            "POST",
            "/eportal/network/getIdentityConfig",
            json={"sessionId": session_id},
        )
        _require_success_data(response, "身份配置")

    async def _is_portal_online(self, session_id: str) -> bool:
        response = await self._portal_json(
            "GET",
            "/eportal/adaptor/getOnlineUserInfo",
            params={
                "sessionId": session_id,
                "_": str(int(time.time() * 1000)),
                "version": "this is a git-commit",
            },
        )
        if not isinstance(response, dict) or response.get("code") != 200:
            return False
        data = response.get("data")
        if not isinstance(data, dict) or not data.get("onlineUser"):
            return False
        online_info = data.get("portalOnlineUserInfo")
        return isinstance(online_info, dict) and online_info.get("result") == "success"

    async def _portal_json(
        self,
        method: str,
        path: str,
        **kwargs: object,
    ) -> object:
        async with self.session.request(
            method,
            urljoin(self.config.portal_origin, path),
            headers=PORTAL_HEADERS,
            allow_redirects=False,
            **kwargs,
        ) as response:
            if response.status != 200:
                if response.status >= 500:
                    raise PortalTransientError(f"门户请求 {path} 暂时返回状态码 {response.status}")
                raise PortalProtocolError(f"门户请求 {path} 返回状态码 {response.status}")
            try:
                return await response.json(content_type=None)
            except (aiohttp.ContentTypeError, ValueError) as error:
                raise PortalProtocolError(f"门户请求 {path} 返回非 JSON 内容") from error

    def _require_portal_url(self, url: str, *, expected_path: str) -> None:
        target = urlparse(url)
        origin = urlparse(self.config.portal_origin)
        if (
            _normalized_origin(target) != _normalized_origin(origin)
            or target.path != expected_path
            or target.params
            or target.username is not None
            or target.password is not None
            or target.fragment
        ):
            raise PortalProtocolError("门户重定向越出配置的 origin 或路径")


def _unique_query_parameters(url: str) -> dict[str, str]:
    parameters: dict[str, list[str]] = {}
    for key, value in parse_qsl(urlparse(url).query, keep_blank_values=True):
        parameters.setdefault(key, []).append(value)
    duplicates = sorted(key for key, values in parameters.items() if len(values) != 1)
    if duplicates:
        raise PortalProtocolError("门户重定向包含重复参数：" + ", ".join(duplicates))
    return {key: values[0] for key, values in parameters.items()}


def _require_success_data(response: object, operation: str) -> object:
    if not isinstance(response, Mapping):
        raise PortalProtocolError(f"{operation}响应不是 JSON 对象")
    if response.get("code") != 200:
        raise PortalProtocolError(f"{operation}响应 code 不是 200")
    return response.get("data")


async def _read_limited_body(
    response: aiohttp.ClientResponse,
    limit: int,
    *,
    operation: str,
) -> bytes:
    body = bytearray()
    while True:
        remaining = limit + 1 - len(body)
        chunk = await response.content.read(min(64 * 1024, remaining))
        if not chunk:
            break
        body.extend(chunk)
        if len(body) > limit:
            raise PortalProtocolError(f"{operation}响应过大")
    return bytes(body)


def _append_get_timestamp(url: str) -> str:
    separator = "&" if "?" in url else "?"
    return f"{url}{separator}{int(time.time() * 1000)}"


def _sso_headers() -> dict[str, str]:
    return {
        "Accept-Language": "zh-CN",
        "sid-language": "zh-CN",
    }


def _protected_sso_headers() -> dict[str, str]:
    csrf_key = "".join(secrets.choice(CSRF_ALPHABET) for _ in range(32))
    encoded_key = base64.b64encode(csrf_key.encode("ascii")).decode("ascii")
    midpoint = len(encoded_key) // 2
    csrf_source = encoded_key[:midpoint] + encoded_key + encoded_key[midpoint:]
    csrf_value = hashlib.md5(
        csrf_source.encode("ascii"),
        usedforsecurity=False,
    ).hexdigest()
    return {
        **_sso_headers(),
        "Csrf-Key": csrf_key,
        "Csrf-Value": csrf_value,
    }


def _normalized_origin(parsed_url: ParseResult) -> tuple[str, str, int]:
    if not parsed_url.hostname:
        raise PortalProtocolError("门户 URL 缺少 host")
    try:
        port = parsed_url.port
    except ValueError as error:
        raise PortalProtocolError("门户 URL 端口无效") from error
    if port is None:
        port = 80 if parsed_url.scheme.casefold() == "http" else 443
    return parsed_url.scheme.casefold(), parsed_url.hostname.casefold(), port
