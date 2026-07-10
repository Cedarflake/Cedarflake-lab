import asyncio
import json
import os
import sys
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import aiohttp

CONFIG_ENV = "CAMPUSNET_CONFIG"
DEFAULT_CONNECTIVITY_CHECK_URL = "http://www.baidu.com"


def config_candidates():
    configured_path = os.getenv(CONFIG_ENV)
    if configured_path:
        yield Path(configured_path).expanduser()

    yield Path.cwd() / "config.json"

    if getattr(sys, "frozen", False):
        yield Path(sys.executable).resolve().parent / "config.json"

    yield Path(__file__).resolve().parent / "config.json"

    bundled_directory = getattr(sys, "_MEIPASS", None)
    if bundled_directory:
        yield Path(bundled_directory) / "config.json"


def load_config():
    candidates = list(dict.fromkeys(path.resolve() for path in config_candidates()))
    config_path = next((path for path in candidates if path.is_file()), None)
    if config_path is None:
        searched_paths = "\n".join(f"- {path}" for path in candidates)
        raise FileNotFoundError(
            "未找到 config.json。请创建本地配置或设置 CAMPUSNET_CONFIG。\n"
            f"已检查：\n{searched_paths}"
        )

    with config_path.open("r", encoding="utf-8") as config_file:
        return json.load(config_file)


def portal_base_url(login_url):
    parsed_url = urlparse(login_url)
    if parsed_url.scheme not in {"http", "https"} or not parsed_url.netloc:
        raise ValueError("login_url 必须是完整的 HTTP 或 HTTPS 地址")
    return f"{parsed_url.scheme}://{parsed_url.netloc}/"


def build_runtime_from_config(cfg: dict[str, Any]):
    login_url = str(cfg.get("login_url", "")).strip()
    if not login_url:
        raise ValueError("config.json 缺少 login_url")

    parsed_login_url = urlparse(login_url)
    portal_url = portal_base_url(login_url)
    connectivity_check_url = str(
        cfg.get("connectivity_check_url", DEFAULT_CONNECTIVITY_CHECK_URL)
    ).strip()
    portal_base_url(connectivity_check_url)

    default_cookies = {
        "EPORTAL_COOKIE_DOMAIN": "false",
        "EPORTAL_COOKIE_SAVEPASSWORD": "true",
        "EPORTAL_COOKIE_OPERATORPWD": "",
        "EPORTAL_COOKIE_NEWV": "true",
    }
    user_cookies = cfg.get("cookies", {})
    if not isinstance(user_cookies, dict):
        raise TypeError("cookies 必须是 JSON 对象")
    cookies = {**default_cookies, **user_cookies}

    configured_headers = cfg.get("headers", {})
    if not isinstance(configured_headers, dict):
        raise TypeError("headers 必须是 JSON 对象")
    user_agent = configured_headers.get(
        "User-Agent",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    )
    headers = {
        "Host": parsed_login_url.hostname or "",
        "User-Agent": str(user_agent),
    }
    jsessionid = cookies.get("JSESSIONID")
    if jsessionid:
        headers["JSESSIONID"] = str(jsessionid)

    service = str(cfg.get("service", cookies.get("EPORTAL_COOKIE_SERVER", "")))
    return login_url, portal_url, connectivity_check_url, headers, cookies, service


async def check_network_status(session, connectivity_check_url, portal_host):
    try:
        timeout = aiohttp.ClientTimeout(total=8)
        async with session.get(
            connectivity_check_url,
            allow_redirects=False,
            timeout=timeout,
        ) as response:
            response_text = await response.text(errors="ignore")
            redirect_location = response.headers.get("Location", "")

        if portal_host in response_text or portal_host in redirect_location:
            print("未连接校园网，需要登录")
            return False
        print("已连接校园网，无需登录")
        return True
    except (aiohttp.ClientError, TimeoutError) as error:
        print(f"网络状态检查失败：{error}")
        return False


async def get_query_string(session, portal_url):
    timeout = aiohttp.ClientTimeout(total=8)
    async with session.get(portal_url, timeout=timeout) as response:
        html = await response.text(errors="ignore")

    start = html.find("index.jsp?")
    if start == -1:
        print("未在门户页面中找到 query_string 入口，请检查 login_url。")
        return ""
    start += len("index.jsp?")
    end = html.find("'</script>", start)
    return html[start:] if end == -1 else html[start:end]


async def do_login(session, login_url, portal_url, headers, cookies, service):
    username = str(cookies.get("EPORTAL_COOKIE_USERNAME", ""))
    password = str(cookies.get("EPORTAL_COOKIE_PASSWORD", ""))
    if not username or not password:
        print("登录失败：配置缺少校园网账号或加密密码。")
        return

    query_string = await get_query_string(session, portal_url)
    if not query_string:
        return

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
            cookies=cookies,
            allow_redirects=False,
            timeout=timeout,
        ) as response:
            try:
                data = await response.json(content_type=None)
            except (aiohttp.ContentTypeError, json.JSONDecodeError):
                print(f"登录失败：门户返回非 JSON 内容，状态码 {response.status}。")
                return
    except (aiohttp.ClientError, TimeoutError) as error:
        print(f"登录请求失败：{error}")
        return

    if data.get("result") == "success":
        print("登录成功！")
    else:
        print("登录失败，原因:", data.get("message", "未知错误"))


async def main():
    cfg = load_config()
    login_url, portal_url, check_url, headers, cookies, service = build_runtime_from_config(cfg)
    portal_host = urlparse(portal_url).hostname or ""

    async with aiohttp.ClientSession(headers=headers, cookies=cookies) as session:
        if await check_network_status(session, check_url, portal_host):
            print("跳过登录")
            return
        await do_login(session, login_url, portal_url, headers, cookies, service)


if __name__ == "__main__":
    if os.name == "nt":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(main())
