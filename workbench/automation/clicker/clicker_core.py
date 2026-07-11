import logging
import math
import threading
import time
from collections.abc import Callable
from numbers import Real
from typing import Protocol

MIN_SAFE_INTERVAL = 0.01
THREAD_JOIN_TIMEOUT = 2.0


class KeyboardBackend(Protocol):
    def add_hotkey(self, hotkey: str, callback: Callable[[], None]) -> object: ...

    def remove_hotkey(self, hotkey: object) -> None: ...

    def wait(self, hotkey: str) -> None: ...


class ClickSafetyError(RuntimeError):
    pass


class ClickerRuntime:
    def __init__(
        self,
        keyboard_backend: KeyboardBackend,
        resource_reader: Callable[[], tuple[float, float]],
        *,
        min_interval: float = MIN_SAFE_INTERVAL,
        max_interval: float = 1.0,
        default_interval: float = 0.05,
        inactive_interval: float = 0.5,
        monitor_interval: float = 5.0,
    ) -> None:
        self.min_interval = self._validate_positive_interval(
            "min_interval",
            min_interval,
            minimum=MIN_SAFE_INTERVAL,
        )
        self.max_interval = self._validate_positive_interval(
            "max_interval",
            max_interval,
            minimum=self.min_interval,
        )
        self.active_interval = self._validate_positive_interval(
            "default_interval",
            default_interval,
            minimum=self.min_interval,
        )
        if self.active_interval > self.max_interval:
            raise ValueError("default_interval 不能大于 max_interval")

        self.inactive_interval = self._validate_positive_interval(
            "inactive_interval",
            inactive_interval,
        )
        self.monitor_interval = self._validate_positive_interval(
            "monitor_interval",
            monitor_interval,
        )
        self.keyboard_backend = keyboard_backend
        self.resource_reader = resource_reader
        self.clicking_event = threading.Event()
        self.stop_event = threading.Event()
        self.state_changed_event = threading.Event()
        self.state_lock = threading.Lock()
        self.interval_lock = threading.Lock()
        self.lifecycle_lock = threading.Lock()
        self.hotkey_handles: list[object] = []
        self.threads: list[threading.Thread] = []
        self.is_started = False

    @staticmethod
    def _validate_positive_interval(
        name: str,
        value: float,
        *,
        minimum: float = 0.0,
    ) -> float:
        if isinstance(value, bool) or not isinstance(value, Real):
            raise TypeError(f"{name} 必须是有限数值")

        normalized = float(value)
        if not math.isfinite(normalized):
            raise ValueError(f"{name} 必须是有限数值")
        if normalized <= 0 or normalized < minimum:
            raise ValueError(f"{name} 不能小于 {minimum:g} 秒")
        return normalized

    def toggle_clicking(self) -> None:
        with self.state_lock:
            if self.stop_event.is_set():
                return

            if self.clicking_event.is_set():
                self.clicking_event.clear()
                is_clicking = False
            else:
                self.clicking_event.set()
                is_clicking = True

        logging.info("▶️ 点击进行中" if is_clicking else "🛑 点击已暂停")
        self.state_changed_event.set()

    def pause_clicking(self) -> None:
        with self.state_lock:
            self.clicking_event.clear()
        self.state_changed_event.set()

    def adjust_interval(self, delta: float) -> None:
        if isinstance(delta, bool) or not isinstance(delta, Real):
            raise TypeError("delta 必须是有限数值")
        normalized_delta = float(delta)
        if not math.isfinite(normalized_delta):
            raise ValueError("delta 必须是有限数值")

        with self.interval_lock:
            next_interval = self.active_interval + normalized_delta
            self.active_interval = max(
                self.min_interval,
                min(next_interval, self.max_interval),
            )
            active_interval = self.active_interval

        status = ""
        if active_interval == self.min_interval:
            status = " (极限速度)"
        elif active_interval == self.max_interval:
            status = " (最低速度)"
        logging.info("⏱️ 当前间隔：%.3f秒%s", active_interval, status)
        self.state_changed_event.set()

    def increase_speed(self) -> None:
        self.adjust_interval(-0.005)

    def decrease_speed(self) -> None:
        self.adjust_interval(0.005)

    def wait_for_interrupt(self, timeout: float) -> bool:
        was_changed = self.state_changed_event.wait(timeout)
        self.state_changed_event.clear()
        return was_changed or self.stop_event.is_set()

    def perform_click(self) -> None:
        raise NotImplementedError

    def click_engine(self) -> None:
        next_click_at = 0.0
        while not self.stop_event.is_set():
            if not self.clicking_event.is_set():
                self.wait_for_interrupt(self.inactive_interval)
                continue

            remaining = next_click_at - time.monotonic()
            if remaining > 0:
                self.wait_for_interrupt(remaining)
                continue

            try:
                self.perform_click()
            except ClickSafetyError as exc:
                logging.warning("❌ 安全保护触发：%s", exc)
                self.pause_clicking()
            except Exception:
                logging.exception("⚠️ 点击异常，已自动暂停")
                self.pause_clicking()

            with self.interval_lock:
                active_interval = self.active_interval
            next_click_at = time.monotonic() + active_interval

    def resource_monitor(self) -> None:
        while not self.stop_event.wait(self.monitor_interval):
            if not self.clicking_event.is_set():
                continue

            try:
                cpu, memory = self.resource_reader()
            except Exception:
                logging.exception("⚠️ 无法读取系统负载")
                continue
            logging.info("📊 系统负载 | CPU: %.1f%% | 内存: %.1f%%", cpu, memory)

    def request_stop(self) -> None:
        with self.state_lock:
            self.clicking_event.clear()
            self.stop_event.set()
        self.state_changed_event.set()

    def graceful_exit(self) -> None:
        logging.info("\n🛑 正在停止所有线程...")
        self.request_stop()

    def _register_hotkeys(self) -> None:
        bindings = (
            ("ctrl+shift+s", self.toggle_clicking),
            ("ctrl+up", self.increase_speed),
            ("ctrl+down", self.decrease_speed),
        )
        try:
            for hotkey, callback in bindings:
                handle = self.keyboard_backend.add_hotkey(hotkey, callback)
                self.hotkey_handles.append(handle)
        except Exception:
            self._remove_hotkeys()
            raise

    def _remove_hotkeys(self) -> None:
        while self.hotkey_handles:
            handle = self.hotkey_handles.pop()
            try:
                self.keyboard_backend.remove_hotkey(handle)
            except Exception:
                logging.exception("⚠️ 无法注销热键")

    def _start_threads(self) -> None:
        candidates = [
            threading.Thread(
                target=self.click_engine,
                name="click-engine",
                daemon=True,
            ),
            threading.Thread(
                target=self.resource_monitor,
                name="resource-monitor",
                daemon=True,
            ),
        ]
        self.threads = []
        for thread in candidates:
            thread.start()
            self.threads.append(thread)

    def _join_threads(self) -> None:
        for thread in self.threads:
            thread.join(THREAD_JOIN_TIMEOUT)
            if thread.is_alive():
                logging.error("⚠️ 线程 %s 未能在限时内停止", thread.name)

    def start(self) -> None:
        with self.lifecycle_lock:
            if self.is_started:
                raise RuntimeError("点击器已启动")
            if self.stop_event.is_set():
                raise RuntimeError("已停止的点击器不能再次启动")
            self.is_started = True

        logging.info("🔥 Egg, Inc. 专业版点击器")
        logging.info("==========================")
        logging.info("- Ctrl+Shift+S : 启动/停止点击")
        logging.info("- Ctrl+↑       : 每次加速0.005秒")
        logging.info("- Ctrl+↓       : 每次减速0.005秒")
        logging.info("- ESC          : 安全退出程序")
        logging.info("==========================")

        try:
            self._register_hotkeys()
            self._start_threads()
            logging.info("⏎ 按 ESC 退出")
            self.keyboard_backend.wait("esc")
        finally:
            self.request_stop()
            self._remove_hotkeys()
            self._join_threads()
            with self.lifecycle_lock:
                self.is_started = False
            logging.info("✅ 资源已释放")
