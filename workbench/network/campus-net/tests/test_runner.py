import unittest
from unittest.mock import AsyncMock, Mock, call, patch, sentinel

from campus_net.aggregate import InitializationResult
from campus_net.captive import NetworkState, ProbeResult
from campus_net.config import CaptiveHttpConfig, ProbeConfig
from campus_net.runner import run_captive_http


def http_config() -> CaptiveHttpConfig:
    return CaptiveHttpConfig(
        adapter="captive-sso-http",
        interface_index=24,
        user_agent="test-agent",
        probe=ProbeConfig(
            url="http://connectivity.example/connecttest.txt",
            online_status=200,
            online_body="Microsoft Connect Test",
            online_location=None,
            timeout_seconds=8,
        ),
        portal_origin="http://10.71.29.181",
        portal_entry_path="/eportal/index.jsp",
        auth_mode="interactive-system-captcha",
        username="example-student",
        password="example-password",
        service_display_name="中国电信",
        captcha_attempts=0,
        verification_interval_seconds=2,
        verification_timeout_seconds=30,
    )


class FakeSessionContext:
    async def __aenter__(self):
        return sentinel.session

    async def __aexit__(self, _error_type, _error, _traceback):
        return False


class TrackingSessionContext:
    def __init__(self, session):
        self.session = session
        self.exited = False

    async def __aenter__(self):
        return self.session

    async def __aexit__(self, _error_type, _error, _traceback):
        self.exited = True
        return False


class TestCaptiveRunner(unittest.IsolatedAsyncioTestCase):
    async def test_online_selected_interface_does_not_claim_campus_identity(self):
        config = http_config()
        status_messages: list[str] = []

        with (
            patch(
                "campus_net.runner.create_bound_connector",
                return_value=sentinel.connector,
            ),
            patch("campus_net.runner.aiohttp.CookieJar", return_value=sentinel.cookie_jar),
            patch(
                "campus_net.runner.aiohttp.ClientSession",
                return_value=FakeSessionContext(),
            ),
            patch("campus_net.runner.AggregatePortalClient") as client_type,
        ):
            client = client_type.return_value
            client.initialize = AsyncMock(
                return_value=InitializationResult(
                    probe=ProbeResult(NetworkState.ONLINE),
                )
            )
            client.authenticate = AsyncMock()

            exit_code = await run_captive_http(
                config,
                status_callback=status_messages.append,
            )

        self.assertEqual(exit_code, 0)
        self.assertEqual(
            status_messages,
            [
                "正在通过 IPv4 接口 24 探测校园网状态…",
                "IPv4 接口 24 已通过独立连通性探测，无需登录；"
                "如果校园网实际位于另一接口，请重新选择对应的 IPv4 接口。",
            ],
        )
        client.authenticate.assert_not_awaited()

    async def test_unreachable_interface_stops_without_falling_back_to_other_networks(self):
        config = http_config()
        for probe_only in (False, True):
            with self.subTest(probe_only=probe_only):
                status_messages: list[str] = []

                with (
                    patch(
                        "campus_net.runner.create_bound_connector",
                        return_value=sentinel.connector,
                    ) as create_connector,
                    patch(
                        "campus_net.runner.aiohttp.CookieJar",
                        return_value=sentinel.cookie_jar,
                    ),
                    patch(
                        "campus_net.runner.aiohttp.ClientSession",
                        return_value=FakeSessionContext(),
                    ) as session_type,
                    patch("campus_net.runner.AggregatePortalClient") as client_type,
                ):
                    client = client_type.return_value
                    client.initialize = AsyncMock(
                        return_value=InitializationResult(
                            probe=ProbeResult(
                                NetworkState.UNKNOWN,
                                reason="配置接口未连接，或该接口当前没有可用路由",
                            )
                        )
                    )
                    client.authenticate = AsyncMock()
                    client.select_service = AsyncMock()
                    client.trigger_online_check = AsyncMock()
                    client.verify_online = AsyncMock()

                    exit_code = await run_captive_http(
                        config,
                        probe_only=probe_only,
                        status_callback=status_messages.append,
                    )

                self.assertEqual(exit_code, 2)
                self.assertEqual(
                    status_messages,
                    [
                        "正在通过 IPv4 接口 24 探测校园网状态…",
                        "无法确认 IPv4 接口 24 的网络状态：配置接口未连接，或该接口当前没有可用路由。"
                        "请确认该接口已接入校园网，或重新选择实际承载校园网的 IPv4 接口；"
                        "已停止，未改用其他网络接口。",
                    ],
                )
                for private_detail in ("host", "ssl", "WinError", "Cannot connect"):
                    self.assertNotIn(private_detail, "\n".join(status_messages))
                create_connector.assert_called_once_with(24)
                session_type.assert_called_once()
                self.assertIs(
                    session_type.call_args.kwargs["connector"],
                    sentinel.connector,
                )
                client.initialize.assert_awaited_once_with()
                client.authenticate.assert_not_awaited()
                client.select_service.assert_not_awaited()
                client.trigger_online_check.assert_not_awaited()
                client.verify_online.assert_not_awaited()

    async def test_closes_old_session_before_retrying_with_fresh_network_state(self):
        config = http_config()
        first_context = TrackingSessionContext(sentinel.first_session)
        second_context = TrackingSessionContext(sentinel.second_session)
        first_client = Mock()
        first_client.initialize = AsyncMock(
            return_value=InitializationResult(
                probe=ProbeResult(
                    NetworkState.UNKNOWN,
                    reason="配置接口未连接，或该接口当前没有可用路由",
                )
            )
        )
        second_client = Mock()
        second_client.initialize = AsyncMock(
            return_value=InitializationResult(
                probe=ProbeResult(NetworkState.ONLINE),
            )
        )

        def select_interface(current_index: int) -> int:
            self.assertEqual(current_index, 24)
            self.assertTrue(first_context.exited)
            self.assertFalse(second_context.exited)
            return 31

        with (
            patch(
                "campus_net.runner.create_bound_connector",
                side_effect=(sentinel.first_connector, sentinel.second_connector),
            ) as create_connector,
            patch(
                "campus_net.runner.aiohttp.CookieJar",
                side_effect=(sentinel.first_cookie_jar, sentinel.second_cookie_jar),
            ) as cookie_jar_type,
            patch(
                "campus_net.runner.aiohttp.ClientSession",
                side_effect=(first_context, second_context),
            ) as session_type,
            patch(
                "campus_net.runner.AggregatePortalClient",
                side_effect=(first_client, second_client),
            ) as client_type,
        ):
            exit_code = await run_captive_http(
                config,
                interface_selector=select_interface,
                status_callback=lambda _message: None,
            )

        self.assertEqual(exit_code, 0)
        self.assertTrue(first_context.exited)
        self.assertTrue(second_context.exited)
        self.assertEqual(config.interface_index, 24)
        create_connector.assert_has_calls([call(24), call(31)])
        self.assertEqual(cookie_jar_type.call_count, 2)
        self.assertEqual(session_type.call_count, 2)
        self.assertIs(client_type.call_args_list[0].args[0], sentinel.first_session)
        self.assertEqual(client_type.call_args_list[0].args[1].interface_index, 24)
        self.assertIs(client_type.call_args_list[1].args[0], sentinel.second_session)
        self.assertEqual(client_type.call_args_list[1].args[1].interface_index, 31)

    @patch("campus_net.runner._run_captive_http_attempt", new_callable=AsyncMock)
    async def test_explicit_selection_retries_with_runtime_only_interface(
        self,
        run_attempt,
    ):
        config = http_config()
        run_attempt.side_effect = [
            (2, "配置接口未连接，或该接口当前没有可用路由"),
            (0, None),
        ]
        interface_selector = Mock(return_value=31)
        status_messages: list[str] = []

        exit_code = await run_captive_http(
            config,
            probe_only=True,
            interface_selector=interface_selector,
            status_callback=status_messages.append,
        )

        self.assertEqual(exit_code, 0)
        self.assertEqual(config.interface_index, 24)
        self.assertEqual(run_attempt.await_count, 2)
        first_config = run_attempt.await_args_list[0].args[0]
        second_config = run_attempt.await_args_list[1].args[0]
        self.assertIs(first_config, config)
        self.assertEqual(second_config.interface_index, 31)
        self.assertEqual(second_config.username, config.username)
        self.assertEqual(second_config.password, config.password)
        for attempt_call in run_attempt.await_args_list:
            self.assertTrue(attempt_call.kwargs["probe_only"])
        interface_selector.assert_called_once_with(24)
        self.assertEqual(
            status_messages,
            [
                "无法确认 IPv4 接口 24 的网络状态：配置接口未连接，或该接口当前没有可用路由。"
                "可从当前 Windows IPv4 接口列表中显式选择一个接口重新探测；"
                "程序不会自动选择，也不会修改 config.json。",
                "已显式选择 IPv4 接口 31，仅本次运行使用；config.json 未修改，正在重新探测。",
            ],
        )

    @patch("campus_net.runner._run_captive_http_attempt", new_callable=AsyncMock)
    async def test_cancelled_selection_preserves_safe_exit(self, run_attempt):
        run_attempt.return_value = (2, "探测结果无法识别")
        interface_selector = Mock(return_value=None)
        status_messages: list[str] = []

        exit_code = await run_captive_http(
            http_config(),
            interface_selector=interface_selector,
            status_callback=status_messages.append,
        )

        self.assertEqual(exit_code, 2)
        run_attempt.assert_awaited_once()
        interface_selector.assert_called_once_with(24)
        self.assertEqual(status_messages[-1], "已取消接口选择；已停止，未改用其他网络接口。")

    @patch("campus_net.runner._run_captive_http_attempt", new_callable=AsyncMock)
    async def test_second_unknown_prompts_again_until_user_cancels(self, run_attempt):
        run_attempt.side_effect = [
            (2, "配置接口未连接，或该接口当前没有可用路由"),
            (2, "响应不匹配 captive 或精确在线指纹"),
        ]
        interface_selector = Mock(side_effect=(31, None))

        exit_code = await run_captive_http(
            http_config(),
            interface_selector=interface_selector,
            status_callback=lambda _message: None,
        )

        self.assertEqual(exit_code, 2)
        self.assertEqual(
            [attempt.args[0].interface_index for attempt in run_attempt.await_args_list],
            [24, 31],
        )
        self.assertEqual(interface_selector.call_args_list, [call(24), call(31)])

    @patch("campus_net.runner._run_captive_http_attempt", new_callable=AsyncMock)
    async def test_rejects_invalid_interface_selection(self, run_attempt):
        run_attempt.return_value = (2, "探测结果无法识别")

        for selected_index in (True, 0, 0x1_0000_0000, "24"):
            with self.subTest(selected_index=selected_index):
                with self.assertRaisesRegex(ValueError, "interface_index"):
                    await run_captive_http(
                        http_config(),
                        interface_selector=Mock(return_value=selected_index),
                        status_callback=lambda _message: None,
                    )


if __name__ == "__main__":
    unittest.main()
