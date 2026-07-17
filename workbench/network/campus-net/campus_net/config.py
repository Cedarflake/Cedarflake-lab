from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any
from urllib.parse import ParseResult, parse_qsl, urlparse

ADAPTER_CAPTIVE_SSO_HTTP = "captive-sso-http"
ADAPTER_LEGACY_EPORTAL = "legacy-eportal"
CONFIG_VERSION_LEGACY_EPORTAL = 1
CONFIG_VERSION_CAPTIVE_SSO = 2
DEFAULT_CAPTIVE_PROBE_URL = "http://www.msftconnecttest.com/connecttest.txt"
DEFAULT_CAPTIVE_PROBE_STATUS = 200
DEFAULT_CAPTIVE_PROBE_BODY = "Microsoft Connect Test"
DEFAULT_CAPTIVE_PROBE_TIMEOUT_SECONDS = 8
DEFAULT_PORTAL_ENTRY_PATH = "/eportal/index.jsp"
DEFAULT_AUTH_MODE = "interactive-system-captcha"
DEFAULT_CAPTCHA_ATTEMPTS = 0
DEFAULT_VERIFICATION_INTERVAL_SECONDS = 2
DEFAULT_VERIFICATION_TIMEOUT_SECONDS = 30
DEFAULT_CONNECTIVITY_CHECK_URL = "http://www.baidu.com"
DEFAULT_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/131.0.0.0 Safari/537.36"
)


@dataclass(frozen=True)
class ProbeConfig:
    url: str
    online_status: int
    online_body: str | None
    online_location: str | None
    timeout_seconds: float


@dataclass(frozen=True)
class CaptiveHttpConfig:
    adapter: str
    interface_index: int
    user_agent: str
    probe: ProbeConfig
    portal_origin: str
    portal_entry_path: str
    auth_mode: str
    username: str
    password: str = field(repr=False)
    service_display_name: str
    captcha_attempts: int
    verification_interval_seconds: float
    verification_timeout_seconds: float


def portal_base_url(login_url: str) -> str:
    parsed_url = urlparse(login_url)
    if parsed_url.scheme not in {"http", "https"} or not parsed_url.netloc:
        raise ValueError("login_url 必须是完整的 HTTP 或 HTTPS 地址")
    return f"{parsed_url.scheme}://{parsed_url.netloc}/"


def build_legacy_runtime_from_config(cfg: dict[str, Any]):
    if _config_version(cfg) is not None:
        adapter = get_adapter(cfg)
        if adapter != ADAPTER_LEGACY_EPORTAL:
            raise ValueError(
                f"legacy-eportal 配置的 version 必须是 {CONFIG_VERSION_LEGACY_EPORTAL}"
            )
        return _build_legacy_runtime_v1(cfg)

    return _build_legacy_runtime_compat(cfg)


def _build_legacy_runtime_compat(cfg: dict[str, Any]):
    login_url = str(cfg.get("login_url", "")).strip()
    if not login_url:
        raise ValueError("config.json 缺少 login_url")

    parsed_login_url = urlparse(login_url)
    portal_url = portal_base_url(login_url)
    connectivity_check_url = str(
        cfg.get("connectivity_check_url", DEFAULT_CONNECTIVITY_CHECK_URL)
    ).strip()
    portal_base_url(connectivity_check_url)

    user_cookies = cfg.get("cookies", {})
    if not isinstance(user_cookies, dict):
        raise TypeError("cookies 必须是 JSON 对象")
    cookies = {**_legacy_default_cookies(), **user_cookies}
    user_group = str(cfg.get("user_group", "")).strip()
    if user_group and "EPORTAL_USER_GROUP" not in user_cookies:
        cookies["EPORTAL_USER_GROUP"] = user_group

    configured_headers = cfg.get("headers", {})
    if not isinstance(configured_headers, dict):
        raise TypeError("headers 必须是 JSON 对象")
    user_agent = configured_headers.get("User-Agent", DEFAULT_USER_AGENT)
    headers = {
        "Host": parsed_login_url.hostname or "",
        "User-Agent": str(user_agent),
    }
    jsessionid = cookies.get("JSESSIONID")
    if jsessionid:
        headers["JSESSIONID"] = str(jsessionid)

    service = str(cfg.get("service", cookies.get("EPORTAL_COOKIE_SERVER", "")))
    return login_url, portal_url, connectivity_check_url, headers, cookies, service


def _build_legacy_runtime_v1(cfg: dict[str, Any]):
    if "password" in cfg:
        raise ValueError("legacy-eportal 使用 encrypted_password，不接受 password")
    _reject_unknown_fields(
        cfg,
        {
            "version",
            "login_url",
            "username",
            "encrypted_password",
            "carrier",
            "user_group",
            "session_id",
        },
        "legacy-eportal version 1",
    )

    login_url = _require_legacy_login_url(cfg, "login_url")
    portal_url = portal_base_url(login_url)
    parsed_login_url = urlparse(login_url)
    username = _require_nonempty_string(cfg, "username")
    encrypted_password = _require_secret_string(cfg, "encrypted_password")
    carrier = _require_nonempty_string(cfg, "carrier")
    user_group = _optional_trimmed_string(cfg, "user_group")
    session_id = _optional_session_id(cfg, "session_id")

    cookies: dict[str, Any] = {
        **_legacy_default_cookies(),
        "EPORTAL_COOKIE_USERNAME": username,
        "EPORTAL_COOKIE_PASSWORD": encrypted_password,
        "EPORTAL_COOKIE_SERVER": carrier,
        "EPORTAL_COOKIE_SERVER_NAME": carrier,
    }
    if user_group is not None:
        cookies["EPORTAL_USER_GROUP"] = user_group
    if session_id is not None:
        cookies["JSESSIONID"] = session_id

    headers = {
        "Host": parsed_login_url.hostname or "",
        "User-Agent": DEFAULT_USER_AGENT,
    }
    if session_id is not None:
        headers["JSESSIONID"] = session_id

    return (
        login_url,
        portal_url,
        DEFAULT_CONNECTIVITY_CHECK_URL,
        headers,
        cookies,
        carrier,
    )


def _legacy_default_cookies() -> dict[str, str]:
    return {
        "EPORTAL_COOKIE_DOMAIN": "false",
        "EPORTAL_COOKIE_SAVEPASSWORD": "true",
        "EPORTAL_COOKIE_OPERATORPWD": "",
        "EPORTAL_COOKIE_NEWV": "true",
    }


def get_adapter(cfg: dict[str, Any]) -> str:
    version = _config_version(cfg)
    if version is not None:
        adapters_by_version = {
            CONFIG_VERSION_LEGACY_EPORTAL: ADAPTER_LEGACY_EPORTAL,
            CONFIG_VERSION_CAPTIVE_SSO: ADAPTER_CAPTIVE_SSO_HTTP,
        }
        adapter = adapters_by_version.get(version)
        if adapter is None:
            supported_versions = ", ".join(
                str(supported_version) for supported_version in sorted(adapters_by_version)
            )
            raise ValueError(f"不支持的 version：{version}；可选值：{supported_versions}")
        return adapter

    adapter = str(cfg.get("adapter", ADAPTER_LEGACY_EPORTAL)).strip()
    if adapter not in {ADAPTER_CAPTIVE_SSO_HTTP, ADAPTER_LEGACY_EPORTAL}:
        raise ValueError(f"不支持的 adapter：{adapter}")
    return adapter


def build_captive_http_config(cfg: dict[str, Any]) -> CaptiveHttpConfig:
    adapter = get_adapter(cfg)
    if adapter != ADAPTER_CAPTIVE_SSO_HTTP:
        if _config_version(cfg) is None:
            raise ValueError(f"adapter 必须是 {ADAPTER_CAPTIVE_SSO_HTTP}")
        raise ValueError(f"captive SSO 配置的 version 必须是 {CONFIG_VERSION_CAPTIVE_SSO}")

    if _config_version(cfg) is not None:
        return _build_captive_http_config_v2(cfg)

    return _build_captive_http_config_compat(cfg)


def _build_captive_http_config_v2(cfg: dict[str, Any]) -> CaptiveHttpConfig:
    if "encrypted_password" in cfg:
        raise ValueError("captive-sso 使用 password，不接受 encrypted_password")
    _reject_unknown_fields(
        cfg,
        {
            "version",
            "interface_index",
            "portal_url",
            "username",
            "password",
            "carrier",
        },
        "captive SSO version 2",
    )

    interface_index = _require_interface_index(cfg, "interface_index")
    portal_origin = _require_origin(cfg, "portal_url")
    username = _require_nonempty_string(cfg, "username")
    password = _require_secret_string(cfg, "password")
    carrier = _require_nonempty_string(cfg, "carrier")

    return CaptiveHttpConfig(
        adapter=ADAPTER_CAPTIVE_SSO_HTTP,
        interface_index=interface_index,
        user_agent=DEFAULT_USER_AGENT,
        probe=ProbeConfig(
            url=DEFAULT_CAPTIVE_PROBE_URL,
            online_status=DEFAULT_CAPTIVE_PROBE_STATUS,
            online_body=DEFAULT_CAPTIVE_PROBE_BODY,
            online_location=None,
            timeout_seconds=DEFAULT_CAPTIVE_PROBE_TIMEOUT_SECONDS,
        ),
        portal_origin=portal_origin,
        portal_entry_path=DEFAULT_PORTAL_ENTRY_PATH,
        auth_mode=DEFAULT_AUTH_MODE,
        username=username,
        password=password,
        service_display_name=carrier,
        captcha_attempts=DEFAULT_CAPTCHA_ATTEMPTS,
        verification_interval_seconds=DEFAULT_VERIFICATION_INTERVAL_SECONDS,
        verification_timeout_seconds=DEFAULT_VERIFICATION_TIMEOUT_SECONDS,
    )


def _build_captive_http_config_compat(cfg: dict[str, Any]) -> CaptiveHttpConfig:
    adapter = ADAPTER_CAPTIVE_SSO_HTTP

    legacy_fields = {
        "cookies",
        "headers",
        "login_url",
        "service",
        "user_group",
    }
    mixed_fields = sorted(legacy_fields.intersection(cfg))
    if mixed_fields:
        raise ValueError("captive-sso-http 不接受旧版登录字段：" + ", ".join(mixed_fields))

    network = _require_object(cfg, "network")
    portal = _require_object(cfg, "portal")
    auth = _require_object(cfg, "auth")
    probe = _require_object(network, "probe")

    interface_index = _require_interface_index(network, "interface_index")

    user_agent = str(network.get("user_agent", DEFAULT_USER_AGENT)).strip()
    if not user_agent:
        raise ValueError("network.user_agent 不能为空")

    probe_url = _require_url(probe, "url", allowed_schemes={"http"})
    online_status = _require_integer(
        probe,
        "online_status",
        minimum=100,
        maximum=599,
    )
    online_body = _optional_nonempty_string(probe, "online_body")
    online_location = _optional_nonempty_string(probe, "online_location")
    if online_location is not None:
        _validate_absolute_url(online_location, "network.probe.online_location")
    if online_body is None and online_location is None:
        raise ValueError("network.probe 至少需要 online_body 或 online_location 作为精确在线指纹")
    probe_timeout = _optional_number(
        probe,
        "timeout_seconds",
        default=8,
        minimum=0.1,
        maximum=60,
    )

    portal_origin = _require_origin(portal, "origin")
    portal_entry_path = str(portal.get("entry_path", DEFAULT_PORTAL_ENTRY_PATH)).strip()
    if not portal_entry_path.startswith("/"):
        raise ValueError("portal.entry_path 必须是以 / 开头的绝对路径")
    if "?" in portal_entry_path or "#" in portal_entry_path:
        raise ValueError("portal.entry_path 不能包含查询参数或片段")

    auth_mode = str(auth.get("mode", "")).strip()
    if auth_mode != DEFAULT_AUTH_MODE:
        raise ValueError("当前仅支持 auth.mode=interactive-system-captcha")
    username = _require_nonempty_string(auth, "username")
    if "password_env" in auth:
        raise ValueError("auth.password_env 已移除，请改用 auth.password")
    password = _require_secret_string(auth, "password")
    service_display_name = _require_nonempty_string(auth, "service_display_name")
    captcha_attempts = _require_integer(
        auth,
        "captcha_attempts",
        minimum=0,
        maximum=100,
        default=DEFAULT_CAPTCHA_ATTEMPTS,
    )
    verification_interval = _optional_number(
        auth,
        "verification_interval_seconds",
        default=DEFAULT_VERIFICATION_INTERVAL_SECONDS,
        minimum=0.1,
        maximum=60,
    )
    verification_timeout = _optional_number(
        auth,
        "verification_timeout_seconds",
        default=DEFAULT_VERIFICATION_TIMEOUT_SECONDS,
        minimum=verification_interval,
        maximum=600,
    )

    return CaptiveHttpConfig(
        adapter=adapter,
        interface_index=interface_index,
        user_agent=user_agent,
        probe=ProbeConfig(
            url=probe_url,
            online_status=online_status,
            online_body=online_body,
            online_location=online_location,
            timeout_seconds=probe_timeout,
        ),
        portal_origin=portal_origin,
        portal_entry_path=portal_entry_path,
        auth_mode=auth_mode,
        username=username,
        password=password,
        service_display_name=service_display_name,
        captcha_attempts=captcha_attempts,
        verification_interval_seconds=verification_interval,
        verification_timeout_seconds=verification_timeout,
    )


def _config_version(cfg: dict[str, Any]) -> int | None:
    removed_fields = sorted({"schema_version", "mode"}.intersection(cfg))
    if removed_fields:
        raise ValueError(
            "已移除字段：" + ", ".join(removed_fields) + "；请只使用 version=1 或 version=2"
        )
    if "version" not in cfg:
        flat_fields = {
            "interface_index",
            "portal_url",
            "username",
            "password",
            "carrier",
            "encrypted_password",
            "session_id",
        }
        if flat_fields.intersection(cfg):
            raise ValueError("扁平配置必须提供 version=1 或 version=2")
        return None

    version = cfg["version"]
    if isinstance(version, bool) or not isinstance(version, int):
        raise TypeError("version 必须是整数")
    return version


def _reject_unknown_fields(
    container: dict[str, Any],
    allowed_fields: set[str],
    context: str,
) -> None:
    unknown_fields = sorted(set(container).difference(allowed_fields))
    if unknown_fields:
        raise ValueError(f"{context} 不支持以下字段：" + ", ".join(unknown_fields))


def _require_object(container: dict[str, Any], key: str) -> dict[str, Any]:
    value = container.get(key)
    if not isinstance(value, dict):
        raise TypeError(f"{key} 必须是 JSON 对象")
    return value


def _require_integer(
    container: dict[str, Any],
    key: str,
    *,
    minimum: int,
    maximum: int | None = None,
    default: int | None = None,
) -> int:
    value = container.get(key, default)
    if isinstance(value, bool) or not isinstance(value, int):
        raise TypeError(f"{key} 必须是整数")
    if value < minimum or (maximum is not None and value > maximum):
        bounds = f"{minimum}..{maximum}" if maximum is not None else f">={minimum}"
        raise ValueError(f"{key} 必须在 {bounds} 范围内")
    return value


def _require_nonempty_string(container: dict[str, Any], key: str) -> str:
    value = container.get(key)
    if not isinstance(value, str) or not value.strip():
        raise TypeError(f"{key} 必须是非空字符串")
    return value.strip()


def _require_secret_string(container: dict[str, Any], key: str) -> str:
    value = container.get(key)
    if not isinstance(value, str) or not value:
        raise TypeError(f"{key} 必须是非空字符串")
    return value


def _optional_trimmed_string(container: dict[str, Any], key: str) -> str | None:
    value = container.get(key)
    if value is None:
        return None
    if not isinstance(value, str) or not value.strip():
        raise TypeError(f"{key} 必须是非空字符串")
    return value.strip()


def _optional_session_id(container: dict[str, Any], key: str) -> str | None:
    value = container.get(key)
    if value is None:
        return None
    if not isinstance(value, str) or not value.strip():
        raise TypeError(f"{key} 必须是非空字符串")
    if any(ord(character) < 0x20 or ord(character) == 0x7F for character in value):
        raise ValueError(f"{key} 不能包含控制字符")
    return value.strip()


def _require_interface_index(container: dict[str, Any], key: str) -> int:
    interface_index = _require_integer(container, key, minimum=1)
    if interface_index > 0xFFFFFFFF:
        raise ValueError(f"{key} 超出 Windows 接口索引范围")
    return interface_index


def _optional_number(
    container: dict[str, Any],
    key: str,
    *,
    default: float,
    minimum: float,
    maximum: float,
) -> float:
    value = container.get(key, default)
    if isinstance(value, bool) or not isinstance(value, int | float):
        raise TypeError(f"{key} 必须是数字")
    number = float(value)
    if not minimum <= number <= maximum:
        raise ValueError(f"{key} 必须在 {minimum}..{maximum} 范围内")
    return number


def _optional_nonempty_string(container: dict[str, Any], key: str) -> str | None:
    value = container.get(key)
    if value is None:
        return None
    if not isinstance(value, str) or not value:
        raise TypeError(f"{key} 必须是非空字符串")
    return value


def _require_url(
    container: dict[str, Any],
    key: str,
    *,
    allowed_schemes: set[str],
) -> str:
    value = _require_nonempty_string(container, key)
    parsed = _validate_absolute_url(value, key)
    if parsed.scheme not in allowed_schemes:
        schemes = ", ".join(sorted(allowed_schemes))
        raise ValueError(f"{key} 仅允许以下协议：{schemes}")
    return value


def _require_legacy_login_url(container: dict[str, Any], key: str) -> str:
    value = _require_url(container, key, allowed_schemes={"http", "https"})
    parsed = urlparse(value)
    method_values = [
        parameter_value
        for parameter_name, parameter_value in parse_qsl(
            parsed.query,
            keep_blank_values=True,
        )
        if parameter_name == "method"
    ]
    if parsed.path != "/eportal/InterFace.do" or method_values != ["login"]:
        raise ValueError(f"{key} 必须指向 /eportal/InterFace.do?method=login")
    return value


def _require_origin(container: dict[str, Any], key: str) -> str:
    value = _require_nonempty_string(container, key)
    parsed = _validate_absolute_url(value, key)
    if parsed.path not in {"", "/"} or parsed.query or parsed.fragment:
        raise ValueError(f"{key} 必须只包含 scheme、host 和可选端口")
    return f"{parsed.scheme}://{parsed.netloc}"


def _validate_absolute_url(value: str, field_name: str) -> ParseResult:
    parsed = urlparse(value)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ValueError(f"{field_name} 必须是完整的 HTTP 或 HTTPS 地址")
    if parsed.username is not None or parsed.password is not None:
        raise ValueError(f"{field_name} 不能包含用户信息")
    if parsed.fragment:
        raise ValueError(f"{field_name} 不能包含片段")
    try:
        parsed.port
    except ValueError as error:
        raise ValueError(f"{field_name} 端口无效") from error
    return parsed
