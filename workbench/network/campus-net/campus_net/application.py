from __future__ import annotations

import json
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

import aiohttp

from .aggregate import (
    AuthenticationRejected,
    AuthenticationUncertain,
    CaptchaProvider,
    PortalProtocolError,
)
from .config import (
    ADAPTER_CAPTIVE_SSO_HTTP,
    ADAPTER_LEGACY_EPORTAL,
    build_captive_http_config,
    get_adapter,
)
from .interactive import CaptchaPromptError, prompt_captcha
from .legacy import run_legacy
from .runner import InterfaceSelector, run_captive_http
from .sso import SsoProtocolError

StatusReporter = Callable[[str], None]


@dataclass(frozen=True)
class RunErrorInfo:
    exit_code: int
    title: str
    message: str


async def execute_config(
    cfg: dict[str, Any],
    *,
    probe_only: bool = False,
    captcha_provider: CaptchaProvider = prompt_captcha,
    status_callback: StatusReporter = print,
    interface_selector: InterfaceSelector | None = None,
) -> int:
    adapter = get_adapter(cfg)
    if adapter == ADAPTER_CAPTIVE_SSO_HTTP:
        config = build_captive_http_config(cfg)
        return await run_captive_http(
            config,
            probe_only=probe_only,
            captcha_provider=captcha_provider,
            status_callback=status_callback,
            interface_selector=interface_selector,
        )
    if adapter == ADAPTER_LEGACY_EPORTAL:
        if probe_only:
            status_callback("legacy-eportal 暂不支持 --probe-only。")
            return 2
        return await run_legacy(cfg, status_callback=status_callback)
    raise ValueError(f"不支持的 adapter：{adapter}")


def classify_run_error(error: BaseException) -> RunErrorInfo | None:
    if isinstance(error, (FileNotFoundError, json.JSONDecodeError, TypeError, ValueError)):
        return RunErrorInfo(1, "配置错误", str(error))
    if isinstance(error, TimeoutError):
        return RunErrorInfo(
            3,
            "连接失败",
            "校园网请求超时，请检查配置的 IPv4 接口和校园网连接。",
        )
    if isinstance(error, aiohttp.ClientError):
        return RunErrorInfo(
            3,
            "连接失败",
            "校园网请求失败，请检查配置的 IPv4 接口和校园网连接。",
        )
    if isinstance(
        error,
        (
            AuthenticationRejected,
            AuthenticationUncertain,
            CaptchaPromptError,
            PortalProtocolError,
            SsoProtocolError,
        ),
    ):
        return RunErrorInfo(3, "连接失败", str(error))
    return None
