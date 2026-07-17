import unittest
from unittest.mock import AsyncMock, patch, sentinel

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
                "正在通过配置的 IPv4 接口探测校园网状态…",
                "配置的 IPv4 接口 24 已通过独立连通性探测，无需登录；"
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
                        "正在通过配置的 IPv4 接口探测校园网状态…",
                        "无法确认配置的 IPv4 接口 24 的网络状态：配置接口未连接，或该接口当前没有可用路由。"
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


if __name__ == "__main__":
    unittest.main()
