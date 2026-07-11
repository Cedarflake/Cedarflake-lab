import logging

import keyboard
import psutil
import win32api
import win32con
from clicker_core import ClickerRuntime, ClickSafetyError


def read_resource_usage() -> tuple[float, float]:
    return psutil.cpu_percent(), psutil.virtual_memory().percent


class Clicker(ClickerRuntime):
    def __init__(
        self,
        min_interval: float = 0.01,
        max_interval: float = 1.0,
        default_interval: float = 0.05,
        inactive_interval: float = 0.5,
        monitor_interval: float = 5.0,
        press_duration: float = 0.02,
    ) -> None:
        super().__init__(
            keyboard,
            read_resource_usage,
            min_interval=min_interval,
            max_interval=max_interval,
            default_interval=default_interval,
            inactive_interval=inactive_interval,
            monitor_interval=monitor_interval,
        )
        self.press_duration = self._validate_positive_interval(
            "press_duration",
            press_duration,
        )

    def perform_click(self) -> None:
        x, y = win32api.GetCursorPos()
        if x <= 0 and y <= 0:
            raise ClickSafetyError("鼠标已移至屏幕左上角")

        try:
            win32api.mouse_event(win32con.MOUSEEVENTF_LEFTDOWN, 0, 0)
            self.wait_for_interrupt(self.press_duration)
        finally:
            try:
                win32api.mouse_event(win32con.MOUSEEVENTF_LEFTUP, 0, 0)
            except Exception:
                self.request_stop()
                logging.critical("无法释放鼠标左键，点击器已强制停止")
                try:
                    win32api.mouse_event(win32con.MOUSEEVENTF_LEFTUP, 0, 0)
                except Exception:
                    logging.exception("鼠标左键释放重试失败")
                raise


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s - %(levelname)s - %(message)s",
    )
    Clicker().start()


if __name__ == "__main__":
    main()
