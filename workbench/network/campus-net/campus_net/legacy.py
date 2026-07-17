from __future__ import annotations

import json
from collections.abc import Callable
from typing import Any
from urllib.parse import urlparse

import aiohttp

from .config import build_legacy_runtime_from_config


def is_network_available(
    status: int,
    response_text: str,
    redirect_location: str,
    portal_host: str,
) -> bool:
    if portal_host in response_text or portal_host in redirect_location:
        return False
    return 200 <= status < 400


async def check_network_status(
    session: aiohttp.ClientSession,
    connectivity_check_url: str,
    portal_host: str,
    *,
    status_callback: Callable[[str], None] = print,
) -> bool:
    try:
        timeout = aiohttp.ClientTimeout(total=8)
        async with session.get(
            connectivity_check_url,
            allow_redirects=False,
            timeout=timeout,
        ) as response:
            status = response.status
            response_text = await response.text(errors="ignore")
            redirect_location = response.headers.get("Location", "")

        if not is_network_available(status, response_text, redirect_location, portal_host):
            status_callback("未连接校园网，需要登录")
            return False
        status_callback("已连接校园网，无需登录")
        return True
    except (aiohttp.ClientError, TimeoutError) as error:
        status_callback(f"网络状态检查失败：{error}")
        return False


async def get_query_string(
    session: aiohttp.ClientSession,
    portal_url: str,
    *,
    status_callback: Callable[[str], None] = print,
) -> str:
    timeout = aiohttp.ClientTimeout(total=8)
    async with session.get(portal_url, timeout=timeout) as response:
        html = await response.text(errors="ignore")

    start = html.find("index.jsp?")
    if start == -1:
        status_callback("未在门户页面中找到 query_string 入口，请检查 login_url。")
        return ""
    start += len("index.jsp?")
    end = html.find("'</script>", start)
    return html[start:] if end == -1 else html[start:end]


async def do_login(
    session: aiohttp.ClientSession,
    login_url: str,
    portal_url: str,
    headers: dict[str, str],
    cookies: dict[str, Any],
    service: str,
    *,
    status_callback: Callable[[str], None] = print,
) -> bool:
    username = str(cookies.get("EPORTAL_COOKIE_USERNAME", ""))
    password = str(cookies.get("EPORTAL_COOKIE_PASSWORD", ""))
    if not username or not password:
        status_callback("登录失败：配置缺少校园网账号或加密密码。")
        return False

    query_string = await get_query_string(
        session,
        portal_url,
        status_callback=status_callback,
    )
    if not query_string:
        return False

    post_data = {
        "userId": username,
        "password": password,
        "service": service,
        "queryString": query_string,
        "operatorPwd": "",
        "operatorUserId": "",
        "validcode": "",
        "passwordEncrypt": "true",
    }

    try:
        timeout = aiohttp.ClientTimeout(total=10)
        async with session.post(
            login_url,
            headers=headers,
            data=post_data,
            allow_redirects=False,
            timeout=timeout,
        ) as response:
            try:
                data = await response.json(content_type=None)
            except (aiohttp.ContentTypeError, json.JSONDecodeError):
                status_callback(f"登录失败：门户返回非 JSON 内容，状态码 {response.status}。")
                return False
    except (aiohttp.ClientError, TimeoutError) as error:
        status_callback(f"登录请求失败：{error}")
        return False

    if not isinstance(data, dict):
        status_callback("登录失败：门户返回的 JSON 不是对象。")
        return False

    if data.get("result") == "success":
        status_callback("登录成功！")
        return True
    message = _sanitize_portal_message(
        data.get("message", "未知错误"),
        username,
        password,
        str(cookies.get("JSESSIONID", "")),
    )
    status_callback(f"登录失败，原因：{message}")
    return False


async def run_legacy(
    cfg: dict[str, Any],
    *,
    status_callback: Callable[[str], None] = print,
) -> int:
    login_url, portal_url, check_url, headers, cookies, service = build_legacy_runtime_from_config(
        cfg
    )
    portal_host = urlparse(portal_url).hostname or ""

    async with aiohttp.ClientSession() as connectivity_session:
        if await check_network_status(
            connectivity_session,
            check_url,
            portal_host,
            status_callback=status_callback,
        ):
            status_callback("跳过登录")
            return 0

    user_agent = headers.get("User-Agent", "")
    session_headers = {"User-Agent": user_agent} if user_agent else None
    cookie_jar = aiohttp.CookieJar(unsafe=True)
    async with aiohttp.ClientSession(
        headers=session_headers,
        cookies=cookies,
        cookie_jar=cookie_jar,
    ) as portal_session:
        succeeded = await do_login(
            portal_session,
            login_url,
            portal_url,
            headers,
            cookies,
            service,
            status_callback=status_callback,
        )
    return 0 if succeeded else 3


def _sanitize_portal_message(message: object, *secrets: str) -> str:
    sanitized = " ".join(str(message).split())
    for secret in secrets:
        if secret:
            sanitized = sanitized.replace(secret, "[已隐藏]")
    return sanitized[:240] or "未知错误"
