import asyncio
import json
import threading
import time
import unittest
from collections.abc import Callable
from pathlib import Path
from queue import Queue
from tempfile import TemporaryDirectory
from typing import Any

from campus_net.config import (
    CONFIG_VERSION_CAPTIVE_SSO,
    CONFIG_VERSION_LEGACY_EPORTAL,
)
from campus_net.config_store import (
    CaptiveConfigV2,
    ConfigRevision,
    LegacyConfigV1,
    config_to_mapping,
    load_editable_config,
    save_editable_config,
)
from campus_net.gui_core import (
    CaptchaBroker,
    CaptchaRequested,
    FailedEvent,
    FinishedEvent,
    GuiEvent,
    LogEvent,
    OperationController,
    _PendingCaptcha,
    build_config_from_form,
    form_values_from_config,
)
from campus_net.interfaces import NetworkInterface, parse_windows_ipv4_interfaces


def captive_values() -> dict[str, str]:
    return {
        "interface_index": "24",
        "portal_url": "http://10.71.29.181",
        "username": "example-student",
        "password": "example-password",
        "carrier": "中国电信",
    }


def legacy_values() -> dict[str, str]:
    return {
        "login_url": "https://campus.example/eportal/InterFace.do?method=login",
        "username": "example-student",
        "encrypted_password": "encrypted-password",
        "carrier": "carrier",
        "user_group": "student",
        "session_id": "example-session",
    }


def captive_model() -> CaptiveConfigV2:
    return CaptiveConfigV2(
        interface_index=24,
        portal_url="http://10.71.29.181",
        username="example-student",
        password="example-password",
        carrier="中国电信",
    )


class ControllerTestCase(unittest.TestCase):
    def wait_for_event(
        self,
        controller: OperationController,
        predicate: Callable[[GuiEvent], bool],
        *,
        timeout: float = 3,
    ) -> tuple[GuiEvent, list[GuiEvent]]:
        deadline = time.monotonic() + timeout
        observed: list[GuiEvent] = []
        while time.monotonic() < deadline:
            observed.extend(controller.drain_events())
            for event in observed:
                if predicate(event):
                    return event, observed
            time.sleep(0.01)
        self.fail(f"等待 GUI 事件超时，已收到：{observed!r}")

    def wait_until_stopped(
        self,
        controller: OperationController,
        *,
        timeout: float = 3,
    ) -> None:
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if not controller.is_running:
                return
            time.sleep(0.01)
        self.fail("GUI 后台任务未按时停止")


class TestCaptchaBroker(unittest.TestCase):
    def test_late_answer_and_cancel_tolerate_closed_event_loop(self):
        loop = asyncio.new_event_loop()
        answer_future = loop.create_future()
        cancel_future = loop.create_future()
        loop.close()
        broker = CaptchaBroker(1, Queue())
        broker._pending[1] = _PendingCaptcha(loop=loop, future=answer_future)

        self.assertFalse(broker.answer(1, "late-code"))
        self.assertFalse(broker.answer(1, "duplicate"))

        broker._pending[2] = _PendingCaptcha(loop=loop, future=cancel_future)
        self.assertFalse(broker.cancel_pending())
        self.assertFalse(broker.cancel_pending())


class TestOperationController(ControllerTestCase):
    def test_saved_config_round_trip_can_start_runner(self):
        received: dict[str, Any] = {}

        async def runner(config: dict[str, Any], **kwargs: Any) -> int:
            received.update(config)
            return 0

        with TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            config_path = root / "config.json"
            backup_directory = root / "backups"
            initial = captive_model()
            first_save = save_editable_config(
                initial,
                path=config_path,
                backup_dir=backup_directory,
                expected_revision=ConfigRevision.absent(),
            )
            loaded = load_editable_config(config_path)
            version, values = form_values_from_config(loaded.config)
            values["carrier"] = "updated-carrier"
            edited = build_config_from_form(version, values)
            second_save = save_editable_config(
                edited,
                path=config_path,
                backup_dir=backup_directory,
                expected_revision=loaded.revision,
            )
            reloaded = load_editable_config(config_path)
            controller = OperationController(runner)

            controller.start(reloaded.config, probe_only=False)
            terminal, _events = self.wait_for_event(
                controller,
                lambda event: isinstance(event, FinishedEvent),
            )
            self.wait_until_stopped(controller)

            self.assertTrue(first_save.changed)
            self.assertIsNone(first_save.backup)
            self.assertTrue(second_save.changed)
            self.assertIsNotNone(second_save.backup)
            self.assertEqual(received, config_to_mapping(edited))
            self.assertEqual(received["carrier"], "updated-carrier")
            self.assertEqual(terminal.exit_code, 0)

    def test_forwards_runner_inputs_and_emits_log_and_finished_events(self):
        received: dict[str, Any] = {}

        async def runner(config: dict[str, Any], **kwargs: Any) -> int:
            received["config"] = config
            received["probe_only"] = kwargs["probe_only"]
            received["captcha_provider"] = kwargs["captcha_provider"]
            kwargs["status_callback"]("正在测试")
            return 4

        source_config = captive_model()
        controller = OperationController(runner)

        operation_id = controller.start(source_config, probe_only=True)
        terminal, events = self.wait_for_event(
            controller,
            lambda event: isinstance(event, FinishedEvent),
        )
        self.wait_until_stopped(controller)

        self.assertEqual(operation_id, 1)
        self.assertEqual(received["config"], config_to_mapping(source_config))
        self.assertTrue(received["probe_only"])
        self.assertTrue(callable(received["captcha_provider"]))
        self.assertIn(LogEvent(operation_id, "正在测试"), events)
        self.assertIsInstance(terminal, FinishedEvent)
        self.assertEqual(terminal.exit_code, 4)
        self.assertEqual(
            terminal.message,
            "门户状态与独立连通性探测未能同时确认在线。",
        )
        self.assertFalse(terminal.cancelled)

    def test_reports_interface_selection_guidance_for_unknown_network_state(self):
        async def runner(_config: dict[str, Any], **_kwargs: Any) -> int:
            return 2

        controller = OperationController(runner)
        controller.start(captive_model(), probe_only=False)
        terminal, _events = self.wait_for_event(
            controller,
            lambda event: isinstance(event, FinishedEvent),
        )
        self.wait_until_stopped(controller)

        self.assertEqual(terminal.exit_code, 2)
        self.assertEqual(
            terminal.message,
            "配置的 IPv4 接口不可用或状态无法识别，请检查实际承载校园网的 IPv4 接口。",
        )

    def test_rejects_concurrent_start_and_cancels_active_task(self):
        started = threading.Event()

        async def runner(config: dict[str, Any], **kwargs: Any) -> int:
            started.set()
            await asyncio.Event().wait()
            return 0

        controller = OperationController(runner)
        operation_id = controller.start(captive_model(), probe_only=False)
        self.assertTrue(started.wait(1))

        try:
            with self.assertRaisesRegex(RuntimeError, "已有连接任务"):
                controller.start(captive_model(), probe_only=False)
            self.assertTrue(controller.cancel())
            terminal, _events = self.wait_for_event(
                controller,
                lambda event: isinstance(event, FinishedEvent),
            )
            self.wait_until_stopped(controller)
        finally:
            controller.cancel()

        self.assertEqual(terminal.operation_id, operation_id)
        self.assertTrue(terminal.cancelled)
        self.assertEqual(terminal.exit_code, 3)
        self.assertIn("服务端可能已经处理", terminal.message)
        self.assertFalse(controller.cancel())

    def test_bridges_captcha_request_and_answer_by_operation_and_request_id(self):
        received: dict[str, str] = {}

        async def runner(config: dict[str, Any], **kwargs: Any) -> int:
            received["code"] = await kwargs["captcha_provider"](
                b"captcha-image",
                "image/png",
            )
            return 0

        controller = OperationController(runner)
        operation_id = controller.start(captive_model(), probe_only=False)
        requested, _events = self.wait_for_event(
            controller,
            lambda event: isinstance(event, CaptchaRequested),
        )
        self.assertIsInstance(requested, CaptchaRequested)

        self.assertEqual(requested.operation_id, operation_id)
        self.assertEqual(requested.image_bytes, b"captcha-image")
        self.assertEqual(requested.content_type, "image/png")
        self.assertFalse(
            controller.answer_captcha(
                operation_id + 1,
                requested.request_id,
                "stale",
            )
        )
        self.assertTrue(
            controller.answer_captcha(
                operation_id,
                requested.request_id,
                "a1b2",
            )
        )
        self.assertFalse(
            controller.answer_captcha(
                operation_id,
                requested.request_id,
                "duplicate",
            )
        )
        terminal, _events = self.wait_for_event(
            controller,
            lambda event: isinstance(event, FinishedEvent),
        )
        self.wait_until_stopped(controller)

        self.assertEqual(received["code"], "a1b2")
        self.assertEqual(terminal.exit_code, 0)
        self.assertEqual(terminal.message, "操作完成。")

    def test_cancel_while_waiting_for_captcha_emits_one_cancelled_terminal_event(self):
        async def runner(config: dict[str, Any], **kwargs: Any) -> int:
            await kwargs["captcha_provider"](b"captcha-image", "image/png")
            return 0

        controller = OperationController(runner)
        operation_id = controller.start(captive_model(), probe_only=False)
        requested, _events = self.wait_for_event(
            controller,
            lambda event: isinstance(event, CaptchaRequested),
        )

        self.assertTrue(controller.cancel())
        terminal, events = self.wait_for_event(
            controller,
            lambda event: isinstance(event, FinishedEvent),
        )
        self.wait_until_stopped(controller)
        events.extend(controller.drain_events())

        self.assertTrue(terminal.cancelled)
        self.assertFalse(
            controller.answer_captcha(
                operation_id,
                requested.request_id,
                "too-late",
            )
        )
        terminal_events = [event for event in events if isinstance(event, FinishedEvent)]
        self.assertEqual(len(terminal_events), 1)

    def test_classifies_known_runner_error(self):
        async def runner(config: dict[str, Any], **kwargs: Any) -> int:
            raise TypeError("interface_index 必须是整数")

        controller = OperationController(runner)
        operation_id = controller.start(captive_model(), probe_only=False)
        terminal, _events = self.wait_for_event(
            controller,
            lambda event: isinstance(event, FailedEvent),
        )
        self.wait_until_stopped(controller)

        self.assertEqual(terminal.operation_id, operation_id)
        self.assertEqual(terminal.exit_code, 1)
        self.assertEqual(terminal.title, "配置错误")
        self.assertEqual(terminal.message, "interface_index 必须是整数")

    def test_redacts_unknown_runner_error_message(self):
        async def runner(config: dict[str, Any], **kwargs: Any) -> int:
            raise RuntimeError("secret diagnostic")

        controller = OperationController(runner)
        controller.start(captive_model(), probe_only=False)
        terminal, _events = self.wait_for_event(
            controller,
            lambda event: isinstance(event, FailedEvent),
        )
        self.wait_until_stopped(controller)

        self.assertEqual(terminal.exit_code, 3)
        self.assertEqual(terminal.title, "内部错误")
        self.assertEqual(terminal.message, "发生未处理的 RuntimeError")
        self.assertNotIn("secret diagnostic", terminal.message)

    def test_terminal_event_allows_immediate_restart_with_distinct_id(self):
        async def runner(config: dict[str, Any], **kwargs: Any) -> int:
            return 0

        controller = OperationController(runner)

        first_id = controller.start(captive_model(), probe_only=False)
        self.wait_for_event(controller, lambda event: isinstance(event, FinishedEvent))
        self.assertFalse(controller.is_running)
        second_id = controller.start(captive_model(), probe_only=False)
        self.wait_for_event(controller, lambda event: isinstance(event, FinishedEvent))
        self.wait_until_stopped(controller)

        self.assertEqual((first_id, second_id), (1, 2))


class TestGuiFormConversion(unittest.TestCase):
    def test_builds_and_round_trips_version_2_form(self):
        config = build_config_from_form(CONFIG_VERSION_CAPTIVE_SSO, captive_values())

        self.assertIsInstance(config, CaptiveConfigV2)
        self.assertEqual(
            config_to_mapping(config),
            {
                "version": 2,
                "interface_index": 24,
                "portal_url": "http://10.71.29.181",
                "username": "example-student",
                "password": "example-password",
                "carrier": "中国电信",
            },
        )
        version, values = form_values_from_config(config)
        self.assertEqual(version, CONFIG_VERSION_CAPTIVE_SSO)
        self.assertEqual(values, captive_values())

    def test_builds_version_1_and_omits_blank_optional_fields(self):
        values = legacy_values()
        values["encrypted_password"] = "  encrypted-password  "
        values["user_group"] = "  "
        values["session_id"] = ""

        config = build_config_from_form(CONFIG_VERSION_LEGACY_EPORTAL, values)

        self.assertIsInstance(config, LegacyConfigV1)
        self.assertEqual(config.version, CONFIG_VERSION_LEGACY_EPORTAL)
        self.assertEqual(config.encrypted_password, "  encrypted-password  ")
        self.assertIsNone(config.user_group)
        self.assertIsNone(config.session_id)

    def test_round_trips_version_1_optional_fields(self):
        config = build_config_from_form(CONFIG_VERSION_LEGACY_EPORTAL, legacy_values())

        version, values = form_values_from_config(config)

        self.assertEqual(version, CONFIG_VERSION_LEGACY_EPORTAL)
        self.assertEqual(values, legacy_values())

    def test_rejects_invalid_form_version_or_interface_index(self):
        with self.assertRaisesRegex(ValueError, "version=1 或 version=2"):
            build_config_from_form(3, {})
        with self.assertRaisesRegex(TypeError, "interface_index 必须是整数"):
            build_config_from_form(
                CONFIG_VERSION_CAPTIVE_SSO,
                {**captive_values(), "interface_index": "not-a-number"},
            )

    def test_rejects_historical_config_without_formal_version(self):
        with self.assertRaisesRegex(TypeError, "正式"):
            form_values_from_config(
                {
                    "login_url": "https://campus.example/eportal/InterFace.do?method=login",
                }
            )


class TestWindowsInterfaceParsing(unittest.TestCase):
    def test_parses_single_interface_object(self):
        payload = json.dumps(
            {
                "InterfaceIndex": 24,
                "InterfaceAlias": "  以太网  ",
                "ConnectionState": "Connected",
                "InterfaceMetric": 5,
            }
        )

        interfaces = parse_windows_ipv4_interfaces(payload)

        self.assertEqual(interfaces, [NetworkInterface(24, "以太网", "Connected", 5)])
        self.assertEqual(interfaces[0].display_name, "24 · 以太网 · 已连接")

    def test_sorts_connected_interfaces_by_metric_then_index(self):
        payload = json.dumps(
            [
                {
                    "InterfaceIndex": 9,
                    "InterfaceAlias": "Disconnected",
                    "ConnectionState": "Disconnected",
                    "InterfaceMetric": 1,
                },
                {
                    "InterfaceIndex": 24,
                    "InterfaceAlias": "Wi-Fi",
                    "ConnectionState": "Connected",
                    "InterfaceMetric": 50,
                },
                {
                    "InterfaceIndex": 12,
                    "InterfaceAlias": "Ethernet",
                    "ConnectionState": "connected",
                    "InterfaceMetric": 5,
                },
            ]
        )

        interfaces = parse_windows_ipv4_interfaces(payload)

        self.assertEqual([item.index for item in interfaces], [12, 24, 9])
        self.assertEqual(interfaces[0].state, "connected")
        self.assertEqual(interfaces[0].display_name, "12 · Ethernet · 已连接")
        self.assertEqual(interfaces[-1].display_name, "9 · Disconnected · 未连接")

    def test_maps_numeric_connection_state_values_from_powershell(self):
        payload = json.dumps(
            [
                {
                    "InterfaceIndex": 8,
                    "InterfaceAlias": "Offline",
                    "ConnectionState": 0,
                    "InterfaceMetric": 1,
                },
                {
                    "InterfaceIndex": 9,
                    "InterfaceAlias": "Online",
                    "ConnectionState": 1,
                    "InterfaceMetric": 50,
                },
            ]
        )

        interfaces = parse_windows_ipv4_interfaces(payload)

        self.assertEqual(
            interfaces,
            [
                NetworkInterface(9, "Online", "Connected", 50),
                NetworkInterface(8, "Offline", "Disconnected", 1),
            ],
        )
        self.assertEqual(interfaces[0].display_name, "9 · Online · 已连接")
        self.assertEqual(interfaces[1].display_name, "8 · Offline · 未连接")

    def test_skips_malformed_items_and_normalizes_invalid_metric_and_state(self):
        payload = json.dumps(
            [
                None,
                {"InterfaceIndex": True, "InterfaceAlias": "invalid"},
                {"InterfaceIndex": 10, "InterfaceAlias": "   "},
                {
                    "InterfaceIndex": 7,
                    "InterfaceAlias": "Loopback",
                    "ConnectionState": True,
                    "InterfaceMetric": True,
                },
            ]
        )

        interfaces = parse_windows_ipv4_interfaces(payload)

        self.assertEqual(interfaces, [NetworkInterface(7, "Loopback", "", 0)])
        self.assertEqual(interfaces[0].display_name, "7 · Loopback · 未知状态")

    def test_rejects_invalid_json_or_payload_shape(self):
        for payload in ("not-json", "null", '"interface"', "123"):
            with self.subTest(payload=payload):
                with self.assertRaisesRegex(ValueError, "接口列表"):
                    parse_windows_ipv4_interfaces(payload)

    def test_rejects_collection_without_valid_interfaces(self):
        with self.assertRaisesRegex(ValueError, "没有找到"):
            parse_windows_ipv4_interfaces(
                json.dumps([{"InterfaceIndex": "24", "InterfaceAlias": "Wi-Fi"}])
            )


if __name__ == "__main__":
    unittest.main()
