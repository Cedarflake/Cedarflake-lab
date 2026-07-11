import logging

import keyboard
import psutil
import pyautogui
from clicker_core import ClickerRuntime, ClickSafetyError

pyautogui.FAILSAFE = True


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

    def perform_click(self) -> None:
        try:
            pyautogui.click()
        except pyautogui.FailSafeException as exc:
            raise ClickSafetyError("鼠标已移至屏幕角落") from exc


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s - %(levelname)s - %(message)s",
    )
    Clicker().start()


if __name__ == "__main__":
    main()
