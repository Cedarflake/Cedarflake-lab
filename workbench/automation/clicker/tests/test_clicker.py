import importlib
import sys
import threading
import time
import types
import unittest
from collections.abc import Callable
from pathlib import Path
from unittest.mock import Mock, patch

CLICKER_DIR = Path(__file__).resolve().parents[1]


class FakeFailSafeException(Exception):
    pass


def make_module(name: str, **attributes: object) -> types.ModuleType:
    module = types.ModuleType(name)
    for attribute, value in attributes.items():
        setattr(module, attribute, value)
    return module


fake_keyboard = make_module(
    "keyboard",
    add_hotkey=Mock(side_effect=lambda hotkey, callback: hotkey),
    remove_hotkey=Mock(),
    wait=Mock(),
)
fake_psutil = make_module(
    "psutil",
    cpu_percent=Mock(return_value=12.5),
    virtual_memory=Mock(return_value=types.SimpleNamespace(percent=34.5)),
)
fake_pyautogui = make_module(
    "pyautogui",
    FAILSAFE=False,
    FailSafeException=FakeFailSafeException,
    click=Mock(),
    sleep=Mock(),
    position=Mock(return_value=(10, 20)),
)
fake_win32api = make_module(
    "win32api",
    GetCursorPos=Mock(return_value=(100, 100)),
    mouse_event=Mock(),
)
fake_win32con = make_module(
    "win32con",
    MOUSEEVENTF_LEFTDOWN=2,
    MOUSEEVENTF_LEFTUP=4,
)

sys.path.insert(0, str(CLICKER_DIR))
with patch.dict(
    sys.modules,
    {
        "keyboard": fake_keyboard,
        "psutil": fake_psutil,
        "pyautogui": fake_pyautogui,
        "win32api": fake_win32api,
        "win32con": fake_win32con,
    },
):
    clicker_core = importlib.import_module("clicker_core")
    clicker_pyautogui = importlib.import_module("clicker_pyautogui")
    clicker_winapi = importlib.import_module("clicker_winapi")


class RuntimeTests(unittest.TestCase):
    def setUp(self) -> None:
        fake_keyboard.add_hotkey.reset_mock(
            side_effect=True,
            return_value=True,
        )
        fake_keyboard.add_hotkey.side_effect = lambda hotkey, callback: hotkey
        fake_keyboard.remove_hotkey.reset_mock()
        fake_keyboard.wait.reset_mock(side_effect=True, return_value=True)
        fake_psutil.cpu_percent.reset_mock(return_value=True)
        fake_psutil.cpu_percent.return_value = 12.5
        fake_psutil.virtual_memory.reset_mock(return_value=True)
        fake_psutil.virtual_memory.return_value = types.SimpleNamespace(percent=34.5)
        fake_pyautogui.click.reset_mock(side_effect=True, return_value=True)
        fake_win32api.GetCursorPos.reset_mock(return_value=True)
        fake_win32api.GetCursorPos.return_value = (100, 100)
        fake_win32api.mouse_event.reset_mock(side_effect=True, return_value=True)

    def test_rejects_unsafe_or_invalid_intervals(self) -> None:
        for clicker_type in (clicker_pyautogui.Clicker, clicker_winapi.Clicker):
            with self.subTest(clicker_type=clicker_type.__module__):
                with self.assertRaises(ValueError):
                    clicker_type(min_interval=0.009)
                with self.assertRaises(ValueError):
                    clicker_type(default_interval=1.1)
                with self.assertRaises(ValueError):
                    clicker_type(default_interval=float("nan"))
                with self.assertRaises(TypeError):
                    clicker_type(default_interval=True)

    def test_interval_adjustment_clamps_and_rejects_non_finite_delta(self) -> None:
        clicker = clicker_pyautogui.Clicker(
            min_interval=0.01,
            max_interval=0.1,
            default_interval=0.05,
        )

        clicker.adjust_interval(-1)
        self.assertEqual(clicker.active_interval, 0.01)
        clicker.adjust_interval(1)
        self.assertEqual(clicker.active_interval, 0.1)
        with self.assertRaises(ValueError):
            clicker.adjust_interval(float("inf"))

    def test_stop_is_terminal_and_prevents_reactivation(self) -> None:
        clicker = clicker_pyautogui.Clicker()
        clicker.toggle_clicking()
        self.assertTrue(clicker.clicking_event.is_set())

        clicker.request_stop()
        clicker.toggle_clicking()

        self.assertTrue(clicker.stop_event.is_set())
        self.assertFalse(clicker.clicking_event.is_set())
        with self.assertRaises(RuntimeError):
            clicker.start()

    def test_start_stops_threads_and_unregisters_hotkeys(self) -> None:
        clicker = clicker_pyautogui.Clicker(
            inactive_interval=0.01,
            monitor_interval=0.01,
        )

        clicker.start()

        self.assertTrue(clicker.stop_event.is_set())
        self.assertFalse(clicker.is_started)
        self.assertEqual(fake_keyboard.add_hotkey.call_count, 3)
        self.assertEqual(fake_keyboard.remove_hotkey.call_count, 3)
        self.assertTrue(all(not thread.is_alive() for thread in clicker.threads))
        fake_keyboard.wait.assert_called_once_with("esc")

    def test_wait_failure_still_cleans_up_lifecycle(self) -> None:
        clicker = clicker_pyautogui.Clicker(
            inactive_interval=0.01,
            monitor_interval=0.01,
        )
        fake_keyboard.wait.side_effect = RuntimeError("keyboard unavailable")

        with self.assertRaisesRegex(RuntimeError, "keyboard unavailable"):
            clicker.start()

        self.assertTrue(clicker.stop_event.is_set())
        self.assertFalse(clicker.is_started)
        self.assertEqual(fake_keyboard.remove_hotkey.call_count, 3)
        self.assertTrue(all(not thread.is_alive() for thread in clicker.threads))

    def test_partial_hotkey_registration_is_rolled_back(self) -> None:
        fake_keyboard.add_hotkey.side_effect = ["first", RuntimeError("denied")]
        clicker = clicker_pyautogui.Clicker()

        with self.assertRaisesRegex(RuntimeError, "denied"):
            clicker.start()

        fake_keyboard.remove_hotkey.assert_called_once_with("first")
        self.assertEqual(clicker.threads, [])

    def test_pyautogui_failsafe_pauses_click_engine(self) -> None:
        fake_pyautogui.click.side_effect = FakeFailSafeException
        clicker = clicker_pyautogui.Clicker(
            default_interval=0.01,
            inactive_interval=0.01,
        )
        clicker.clicking_event.set()
        thread = threading.Thread(target=clicker.click_engine)
        thread.start()

        self.assertTrue(self._wait_until(lambda: fake_pyautogui.click.called))
        self.assertTrue(self._wait_until(lambda: not clicker.clicking_event.is_set()))
        clicker.request_stop()
        thread.join(1)

        self.assertFalse(thread.is_alive())

    def test_click_engine_never_exceeds_safe_rate(self) -> None:
        click_times: list[float] = []
        fake_pyautogui.click.side_effect = lambda: click_times.append(time.monotonic())
        clicker = clicker_pyautogui.Clicker(
            min_interval=0.01,
            default_interval=0.01,
            inactive_interval=0.01,
        )
        clicker.clicking_event.set()
        clicker.state_changed_event.set()
        thread = threading.Thread(target=clicker.click_engine)
        thread.start()

        self.assertTrue(self._wait_until(lambda: len(click_times) >= 4))
        clicker.request_stop()
        thread.join(1)

        gaps = [later - earlier for earlier, later in zip(click_times, click_times[1:])]
        self.assertTrue(gaps)
        self.assertGreaterEqual(min(gaps), 0.009)

    @staticmethod
    def _wait_until(predicate: Callable[[], bool], timeout: float = 1.0) -> bool:
        complete = threading.Event()

        def poll() -> None:
            while not predicate():
                if complete.wait(0.001):
                    return
            complete.set()

        thread = threading.Thread(target=poll, daemon=True)
        thread.start()
        result = complete.wait(timeout)
        complete.set()
        return result


class WinApiTests(unittest.TestCase):
    def setUp(self) -> None:
        fake_win32api.GetCursorPos.reset_mock(return_value=True)
        fake_win32api.GetCursorPos.return_value = (100, 100)
        fake_win32api.mouse_event.reset_mock(side_effect=True, return_value=True)

    def test_click_always_releases_button_when_wait_raises(self) -> None:
        clicker = clicker_winapi.Clicker()
        clicker.wait_for_interrupt = Mock(side_effect=RuntimeError("interrupted"))

        with self.assertRaisesRegex(RuntimeError, "interrupted"):
            clicker.perform_click()

        self.assertEqual(
            fake_win32api.mouse_event.call_args_list,
            [
                unittest.mock.call(fake_win32con.MOUSEEVENTF_LEFTDOWN, 0, 0),
                unittest.mock.call(fake_win32con.MOUSEEVENTF_LEFTUP, 0, 0),
            ],
        )

    def test_click_attempts_release_when_button_down_call_raises(self) -> None:
        fake_win32api.mouse_event.side_effect = [
            RuntimeError("press failed"),
            None,
        ]
        clicker = clicker_winapi.Clicker()

        with self.assertRaisesRegex(RuntimeError, "press failed"):
            clicker.perform_click()

        self.assertEqual(
            fake_win32api.mouse_event.call_args_list,
            [
                unittest.mock.call(fake_win32con.MOUSEEVENTF_LEFTDOWN, 0, 0),
                unittest.mock.call(fake_win32con.MOUSEEVENTF_LEFTUP, 0, 0),
            ],
        )

    def test_stop_during_press_releases_button_promptly(self) -> None:
        pressed = threading.Event()

        def record_event(event: int, _x: int, _y: int) -> None:
            if event == fake_win32con.MOUSEEVENTF_LEFTDOWN:
                pressed.set()

        fake_win32api.mouse_event.side_effect = record_event
        clicker = clicker_winapi.Clicker(press_duration=1.0)
        thread = threading.Thread(target=clicker.perform_click)
        thread.start()

        self.assertTrue(pressed.wait(1))
        clicker.request_stop()
        thread.join(1)

        self.assertFalse(thread.is_alive())
        self.assertEqual(fake_win32api.mouse_event.call_count, 2)
        self.assertEqual(
            fake_win32api.mouse_event.call_args_list[-1],
            unittest.mock.call(fake_win32con.MOUSEEVENTF_LEFTUP, 0, 0),
        )

    def test_release_failure_forces_terminal_stop(self) -> None:
        fake_win32api.mouse_event.side_effect = [
            None,
            RuntimeError("release failed"),
            None,
        ]
        clicker = clicker_winapi.Clicker()

        with self.assertRaisesRegex(RuntimeError, "release failed"):
            clicker.perform_click()

        self.assertTrue(clicker.stop_event.is_set())
        self.assertEqual(fake_win32api.mouse_event.call_count, 3)

    def test_top_left_corner_pauses_before_button_down(self) -> None:
        fake_win32api.GetCursorPos.return_value = (0, 0)
        clicker = clicker_winapi.Clicker()

        with self.assertRaises(clicker_core.ClickSafetyError):
            clicker.perform_click()

        fake_win32api.mouse_event.assert_not_called()


class PointerPositionTests(unittest.TestCase):
    def test_import_has_no_mouse_or_sleep_side_effects(self) -> None:
        fake_pyautogui.sleep.reset_mock()
        fake_pyautogui.position.reset_mock()
        sys.modules.pop("pointer_position", None)

        with patch.dict(sys.modules, {"pyautogui": fake_pyautogui}):
            importlib.import_module("pointer_position")

        fake_pyautogui.sleep.assert_not_called()
        fake_pyautogui.position.assert_not_called()


if __name__ == "__main__":
    unittest.main()
