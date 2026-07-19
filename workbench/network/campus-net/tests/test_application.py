import json
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import aiohttp
from campus_net.aggregate import (
    AuthenticationRejected,
    AuthenticationUncertain,
    PortalProtocolError,
)
from campus_net.application import classify_run_error, execute_config
from campus_net.config import (
    ADAPTER_CAPTIVE_SSO_HTTP,
    CONFIG_VERSION_CAPTIVE_SSO,
    CONFIG_VERSION_LEGACY_EPORTAL,
)
from campus_net.interactive import CaptchaPromptError
from campus_net.sso import SsoProtocolError


def captive_config() -> dict[str, object]:
    return {
        "version": CONFIG_VERSION_CAPTIVE_SSO,
        "interface_index": 24,
        "portal_url": "http://10.71.29.181",
        "username": "example-student",
        "password": "example-password",
        "carrier": "中国电信",
    }


def legacy_config() -> dict[str, object]:
    return {
        "version": CONFIG_VERSION_LEGACY_EPORTAL,
        "login_url": "https://campus.example/eportal/InterFace.do?method=login",
        "username": "example-student",
        "encrypted_password": "encrypted-password",
        "carrier": "carrier",
    }


class TestExecuteConfig(unittest.IsolatedAsyncioTestCase):
    @patch("campus_net.application.run_captive_http", new_callable=AsyncMock)
    async def test_dispatches_version_2_to_captive_runner(self, run_captive_http):
        run_captive_http.return_value = 4
        captcha_provider = AsyncMock(return_value="abcd")
        status_messages: list[str] = []
        status_callback = status_messages.append

        exit_code = await execute_config(
            captive_config(),
            probe_only=True,
            captcha_provider=captcha_provider,
            status_callback=status_callback,
        )

        self.assertEqual(exit_code, 4)
        run_captive_http.assert_awaited_once()
        runtime_config = run_captive_http.await_args.args[0]
        self.assertEqual(runtime_config.adapter, ADAPTER_CAPTIVE_SSO_HTTP)
        self.assertEqual(runtime_config.interface_index, 24)
        self.assertEqual(runtime_config.username, "example-student")
        self.assertEqual(runtime_config.password, "example-password")
        self.assertTrue(run_captive_http.await_args.kwargs["probe_only"])
        self.assertIs(
            run_captive_http.await_args.kwargs["captcha_provider"],
            captcha_provider,
        )
        self.assertIs(
            run_captive_http.await_args.kwargs["status_callback"],
            status_callback,
        )
        self.assertIsNone(run_captive_http.await_args.kwargs["interface_selector"])

    @patch("campus_net.application.run_legacy", new_callable=AsyncMock)
    async def test_dispatches_version_1_to_legacy_runner(self, run_legacy):
        run_legacy.return_value = 0
        status_messages: list[str] = []
        status_callback = status_messages.append
        config = legacy_config()

        exit_code = await execute_config(
            config,
            status_callback=status_callback,
        )

        self.assertEqual(exit_code, 0)
        run_legacy.assert_awaited_once_with(
            config,
            status_callback=status_callback,
        )

    @patch("campus_net.application.run_legacy", new_callable=AsyncMock)
    async def test_version_1_probe_reports_unsupported_without_running(self, run_legacy):
        status_messages: list[str] = []

        exit_code = await execute_config(
            legacy_config(),
            probe_only=True,
            status_callback=status_messages.append,
        )

        self.assertEqual(exit_code, 2)
        self.assertEqual(status_messages, ["legacy-eportal 暂不支持 --probe-only。"])
        run_legacy.assert_not_awaited()

    async def test_rejects_unknown_version_before_dispatch(self):
        with self.assertRaisesRegex(ValueError, "不支持的 version"):
            await execute_config({"version": 3})


class TestClassifyRunError(unittest.TestCase):
    def test_classifies_configuration_errors(self):
        errors = (
            FileNotFoundError("config missing"),
            json.JSONDecodeError("invalid json", "{", 1),
            TypeError("wrong type"),
            ValueError("wrong value"),
        )

        for error in errors:
            with self.subTest(error_type=type(error).__name__):
                info = classify_run_error(error)

                self.assertIsNotNone(info)
                self.assertEqual(info.exit_code, 1)
                self.assertEqual(info.title, "配置错误")
                self.assertEqual(info.message, str(error))

    def test_classifies_protocol_and_transport_errors(self):
        errors = (
            AuthenticationRejected("rejected"),
            AuthenticationUncertain("uncertain"),
            CaptchaPromptError("captcha failed"),
            PortalProtocolError("portal failed"),
            SsoProtocolError("sso failed"),
        )

        for error in errors:
            with self.subTest(error_type=type(error).__name__):
                info = classify_run_error(error)

                self.assertIsNotNone(info)
                self.assertEqual(info.exit_code, 3)
                self.assertEqual(info.title, "连接失败")
                self.assertEqual(info.message, str(error))

    def test_sanitizes_transport_error_details(self):
        errors_and_messages = (
            (
                aiohttp.ClientConnectorError(
                    SimpleNamespace(host="private.example", port=80, ssl=True),
                    OSError(10065, "raw socket failure"),
                ),
                "校园网请求失败，请检查配置的 IPv4 接口和校园网连接。",
            ),
            (
                TimeoutError("private timeout detail"),
                "校园网请求超时，请检查配置的 IPv4 接口和校园网连接。",
            ),
        )

        for error, expected_message in errors_and_messages:
            with self.subTest(error_type=type(error).__name__):
                info = classify_run_error(error)

                self.assertIsNotNone(info)
                self.assertEqual(info.exit_code, 3)
                self.assertEqual(info.title, "连接失败")
                self.assertEqual(info.message, expected_message)
                for private_detail in (
                    "private.example",
                    "ssl",
                    "10065",
                    "raw socket failure",
                    "private timeout detail",
                ):
                    self.assertNotIn(private_detail, info.message)

    def test_leaves_unknown_errors_for_the_caller(self):
        self.assertIsNone(classify_run_error(RuntimeError("unexpected")))


if __name__ == "__main__":
    unittest.main()
