from __future__ import annotations

from collections.abc import Callable

import aiohttp

from .aggregate import (
    AggregatePortalClient,
    AuthenticationUncertain,
    CaptchaProvider,
    PortalProtocolError,
)
from .captive import NetworkState, create_bound_connector
from .config import CaptiveHttpConfig
from .interactive import prompt_captcha


async def run_captive_http(
    config: CaptiveHttpConfig,
    *,
    probe_only: bool = False,
    captcha_provider: CaptchaProvider = prompt_captcha,
    status_callback: Callable[[str], None] = print,
) -> int:
    connector = create_bound_connector(config.interface_index)
    cookie_jar = aiohttp.CookieJar(unsafe=True)
    timeout = aiohttp.ClientTimeout(total=15, connect=8)
    headers = {
        "Accept-Language": "zh-CN,zh;q=0.9",
        "User-Agent": config.user_agent,
    }

    async with aiohttp.ClientSession(
        connector=connector,
        cookie_jar=cookie_jar,
        headers=headers,
        timeout=timeout,
    ) as session:
        client = AggregatePortalClient(session, config)
        status_callback("正在通过配置的 IPv4 接口探测校园网状态…")
        initialization = await client.initialize()
        if initialization.probe.state is NetworkState.ONLINE:
            status_callback("配置接口已经通过独立连通性探测，无需登录。")
            return 0
        if initialization.probe.state is NetworkState.UNKNOWN:
            status_callback(f"无法确认配置接口的网络状态：{initialization.probe.reason}")
            return 2
        if probe_only:
            status_callback("已识别当前接口的 captive 门户入口；未提交任何认证信息。")
            return 0
        if initialization.context is None:
            raise PortalProtocolError("captive 初始化没有生成门户会话")

        context = initialization.context
        current_node = context.current_node_path
        if current_node == "authenticate":
            status_callback("已进入身份认证节点，正在准备 SSO 登录。")
            try:
                await client.authenticate(
                    context,
                    username=config.username,
                    password=config.password,
                    captcha_provider=captcha_provider,
                )
            except AuthenticationUncertain as auth_error:
                current_node = await client.get_current_node(context.session_id)
                if current_node == "authenticate":
                    raise auth_error
                status_callback("登录响应不完整，但门户工作流已前进；没有重放登录请求。")
            else:
                current_node = await client.wait_for_node(
                    context.session_id,
                    {"serviceSelection", "finish"},
                )

        if current_node == "serviceSelection":
            status_callback(f"身份认证已通过，正在选择运营商：{config.service_display_name}。")
            try:
                await client.select_service(
                    context.session_id,
                    config.service_display_name,
                )
            except AuthenticationUncertain as service_error:
                current_node = await client.get_current_node(context.session_id)
                if current_node != "finish":
                    raise service_error
                status_callback("运营商认证响应不完整，但工作流已完成；没有重放请求。")
            else:
                current_node = await client.wait_for_node(context.session_id, "finish")

        if current_node != "finish":
            raise PortalProtocolError(f"不支持的门户工作流节点：{current_node}")

        status_callback("门户工作流已完成，正在确认终端真实在线状态。")
        try:
            await client.trigger_online_check(context.session_id)
        except AuthenticationUncertain:
            status_callback("门户在线检查响应不完整；没有重放请求，改用只读状态核对。")
        if await client.verify_online(context.session_id):
            status_callback("校园网登录完成，门户状态与独立连通性探测均已确认在线。")
            return 0

        status_callback("门户未能与独立连通性探测同时确认在线。")
        return 4
