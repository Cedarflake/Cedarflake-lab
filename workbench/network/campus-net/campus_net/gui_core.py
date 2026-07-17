from __future__ import annotations

import asyncio
import copy
import json
import os
import subprocess
import sys
import threading
from collections.abc import Awaitable, Callable, Mapping
from dataclasses import dataclass, field
from pathlib import Path
from queue import Empty, Queue
from typing import Any

from .application import RunErrorInfo, classify_run_error, execute_config
from .config_store import (
    CaptiveConfigV2,
    EditableConfig,
    LegacyConfigV1,
    config_from_mapping,
    config_to_mapping,
)

AsyncRunner = Callable[..., Awaitable[int]]


@dataclass(frozen=True, slots=True)
class LogEvent:
    operation_id: int
    message: str


@dataclass(frozen=True, slots=True)
class CaptchaRequested:
    operation_id: int
    request_id: int
    image_bytes: bytes = field(repr=False)
    content_type: str


@dataclass(frozen=True, slots=True)
class FinishedEvent:
    operation_id: int
    exit_code: int
    message: str
    cancelled: bool = False


@dataclass(frozen=True, slots=True)
class FailedEvent:
    operation_id: int
    exit_code: int
    title: str
    message: str


TerminalEvent = FinishedEvent | FailedEvent
GuiEvent = LogEvent | CaptchaRequested | TerminalEvent


@dataclass(frozen=True, slots=True)
class NetworkInterface:
    index: int
    alias: str
    state: str
    metric: int

    @property
    def display_name(self) -> str:
        state = {
            "connected": "已连接",
            "disconnected": "未连接",
            "authenticating": "正在认证",
        }.get(self.state.casefold(), self.state or "未知状态")
        return f"{self.index} · {self.alias} · {state}"


@dataclass(slots=True)
class _PendingCaptcha:
    loop: asyncio.AbstractEventLoop
    future: asyncio.Future[str]


class CaptchaBroker:
    def __init__(self, operation_id: int, events: Queue[GuiEvent]) -> None:
        self.operation_id = operation_id
        self.events = events
        self._lock = threading.Lock()
        self._next_request_id = 0
        self._pending: dict[int, _PendingCaptcha] = {}

    async def provider(self, image_bytes: bytes, content_type: str) -> str:
        loop = asyncio.get_running_loop()
        future = loop.create_future()
        with self._lock:
            if self._pending:
                raise RuntimeError("同一连接任务不能同时等待多个验证码")
            self._next_request_id += 1
            request_id = self._next_request_id
            self._pending[request_id] = _PendingCaptcha(loop=loop, future=future)
        self.events.put(
            CaptchaRequested(
                operation_id=self.operation_id,
                request_id=request_id,
                image_bytes=image_bytes,
                content_type=content_type,
            )
        )
        try:
            return await future
        finally:
            with self._lock:
                self._pending.pop(request_id, None)

    def answer(self, request_id: int, code: str) -> bool:
        with self._lock:
            pending = self._pending.pop(request_id, None)
        if pending is None:
            return False
        try:
            pending.loop.call_soon_threadsafe(_set_future_result, pending.future, code)
        except RuntimeError:
            return False
        return True

    def cancel_pending(self) -> bool:
        with self._lock:
            pending = list(self._pending.values())
            self._pending.clear()
        cancelled = False
        for item in pending:
            try:
                item.loop.call_soon_threadsafe(_cancel_future, item.future)
            except RuntimeError:
                continue
            cancelled = True
        return cancelled


class OperationController:
    def __init__(self, runner: AsyncRunner = execute_config) -> None:
        self.events: Queue[GuiEvent] = Queue()
        self._runner = runner
        self._lock = threading.Lock()
        self._next_operation_id = 0
        self._operation_id: int | None = None
        self._thread: threading.Thread | None = None
        self._loop: asyncio.AbstractEventLoop | None = None
        self._task: asyncio.Task[int] | None = None
        self._broker: CaptchaBroker | None = None
        self._cancel_requested = False
        self._is_active = False

    @property
    def is_running(self) -> bool:
        with self._lock:
            return self._is_active

    @property
    def operation_id(self) -> int | None:
        with self._lock:
            return self._operation_id

    def start(self, config: EditableConfig, *, probe_only: bool) -> int:
        with self._lock:
            if self._is_active:
                raise RuntimeError("已有连接任务正在运行")
            self._next_operation_id += 1
            operation_id = self._next_operation_id
            broker = CaptchaBroker(operation_id, self.events)
            thread = threading.Thread(
                target=self._thread_main,
                args=(operation_id, copy.deepcopy(config), probe_only, broker),
                name=f"campus-net-operation-{operation_id}",
                daemon=True,
            )
            self._operation_id = operation_id
            self._broker = broker
            self._cancel_requested = False
            self._is_active = True
            self._thread = thread
            try:
                thread.start()
            except BaseException:
                self._is_active = False
                self._thread = None
                self._broker = None
                raise
        return operation_id

    def cancel(self) -> bool:
        with self._lock:
            if not self._is_active:
                return False
            self._cancel_requested = True
            loop = self._loop
            task = self._task
            broker = self._broker
        if broker is not None:
            broker.cancel_pending()
        if loop is not None and task is not None:
            try:
                loop.call_soon_threadsafe(task.cancel)
            except RuntimeError:
                pass
        return True

    def answer_captcha(self, operation_id: int, request_id: int, code: str) -> bool:
        with self._lock:
            if operation_id != self._operation_id:
                return False
            broker = self._broker
        return broker.answer(request_id, code) if broker is not None else False

    def drain_events(self, *, limit: int = 100) -> list[GuiEvent]:
        drained: list[GuiEvent] = []
        for _ in range(limit):
            try:
                drained.append(self.events.get_nowait())
            except Empty:
                break
        return drained

    def _thread_main(
        self,
        operation_id: int,
        config: EditableConfig,
        probe_only: bool,
        broker: CaptchaBroker,
    ) -> None:
        asyncio.run(self._run(operation_id, config, probe_only, broker))

    async def _run(
        self,
        operation_id: int,
        config: EditableConfig,
        probe_only: bool,
        broker: CaptchaBroker,
    ) -> None:
        loop = asyncio.get_running_loop()
        current_task = asyncio.current_task()
        if current_task is None:
            raise RuntimeError("GUI 后台任务没有 asyncio Task")
        with self._lock:
            self._loop = loop
            self._task = current_task
            should_cancel = self._cancel_requested
        terminal_event: TerminalEvent
        try:
            if should_cancel:
                raise asyncio.CancelledError
            exit_code = await self._runner(
                config_to_mapping(config),
                probe_only=probe_only,
                captcha_provider=broker.provider,
                status_callback=lambda message: self.events.put(
                    LogEvent(operation_id=operation_id, message=message)
                ),
            )
        except asyncio.CancelledError:
            terminal_event = FinishedEvent(
                operation_id=operation_id,
                exit_code=3,
                message="操作已取消；如果请求正在提交，服务端可能已经处理。",
                cancelled=True,
            )
        except Exception as error:
            error_info = classify_run_error(error) or RunErrorInfo(
                exit_code=3,
                title="内部错误",
                message=f"发生未处理的 {type(error).__name__}",
            )
            terminal_event = FailedEvent(
                operation_id=operation_id,
                exit_code=error_info.exit_code,
                title=error_info.title,
                message=error_info.message,
            )
        else:
            terminal_event = FinishedEvent(
                operation_id=operation_id,
                exit_code=exit_code,
                message=_completion_message(exit_code),
            )
        finally:
            broker.cancel_pending()
            with self._lock:
                if self._operation_id == operation_id:
                    self._loop = None
                    self._task = None
                    self._is_active = False
        self.events.put(terminal_event)


def build_config_from_form(version: int, values: Mapping[str, str]) -> EditableConfig:
    if version == 2:
        interface_index_text = values.get("interface_index", "").strip()
        try:
            interface_index = int(interface_index_text)
        except ValueError as error:
            raise TypeError("interface_index 必须是整数") from error
        config: dict[str, Any] = {
            "version": 2,
            "interface_index": interface_index,
            "portal_url": values.get("portal_url", ""),
            "username": values.get("username", ""),
            "password": values.get("password", ""),
            "carrier": values.get("carrier", ""),
        }
        return config_from_mapping(config)

    if version == 1:
        config = {
            "version": 1,
            "login_url": values.get("login_url", ""),
            "username": values.get("username", ""),
            "encrypted_password": values.get("encrypted_password", ""),
            "carrier": values.get("carrier", ""),
        }
        user_group = values.get("user_group", "").strip()
        session_id = values.get("session_id", "").strip()
        if user_group:
            config["user_group"] = user_group
        if session_id:
            config["session_id"] = session_id
        return config_from_mapping(config)

    raise ValueError("GUI 只支持 version=1 或 version=2")


def form_values_from_config(config: EditableConfig) -> tuple[int, dict[str, str]]:
    raw_config = config_to_mapping(config)
    version = raw_config["version"]
    if isinstance(config, CaptiveConfigV2):
        return version, {
            "interface_index": str(config.interface_index),
            "portal_url": config.portal_url,
            "username": config.username,
            "password": config.password,
            "carrier": config.carrier,
        }
    if isinstance(config, LegacyConfigV1):
        return version, {
            "login_url": config.login_url,
            "username": config.username,
            "encrypted_password": config.encrypted_password,
            "carrier": config.carrier,
            "user_group": config.user_group or "",
            "session_id": config.session_id or "",
        }
    raise TypeError("GUI 只接受正式 version=1 或 version=2 配置")


def list_windows_ipv4_interfaces() -> list[NetworkInterface]:
    if sys.platform != "win32":
        raise OSError("网卡列表当前仅支持 Windows")
    system_root = os.environ.get("SystemRoot")
    if not system_root:
        raise OSError("Windows 环境缺少 SystemRoot")
    powershell_path = (
        Path(system_root) / "System32" / "WindowsPowerShell" / "v1.0" / "powershell.exe"
    )
    if not powershell_path.is_file():
        raise OSError(f"找不到系统 PowerShell：{powershell_path}")
    command = (
        "[Console]::OutputEncoding = [Text.UTF8Encoding]::new(); "
        "Get-NetIPInterface -AddressFamily IPv4 | "
        "Select-Object InterfaceIndex,InterfaceAlias,"
        "@{Name='ConnectionState';Expression={$_.ConnectionState.ToString()}},"
        "InterfaceMetric | "
        "ConvertTo-Json -Compress"
    )
    creation_flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
    result = subprocess.run(
        [str(powershell_path), "-NoProfile", "-NonInteractive", "-Command", command],
        check=True,
        capture_output=True,
        text=True,
        encoding="utf-8",
        timeout=10,
        creationflags=creation_flags,
    )
    return parse_windows_ipv4_interfaces(result.stdout)


def parse_windows_ipv4_interfaces(payload: str) -> list[NetworkInterface]:
    try:
        decoded = json.loads(payload)
    except json.JSONDecodeError as error:
        raise ValueError("无法解析 Windows IPv4 接口列表") from error
    if isinstance(decoded, dict):
        items = [decoded]
    elif isinstance(decoded, list):
        items = decoded
    else:
        raise ValueError("Windows IPv4 接口列表格式无效")

    interfaces: list[NetworkInterface] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        index = item.get("InterfaceIndex")
        alias = item.get("InterfaceAlias")
        state = _normalize_connection_state(item.get("ConnectionState"))
        metric = item.get("InterfaceMetric")
        if (
            isinstance(index, bool)
            or not isinstance(index, int)
            or not isinstance(alias, str)
            or not alias.strip()
        ):
            continue
        interfaces.append(
            NetworkInterface(
                index=index,
                alias=alias.strip(),
                state=state,
                metric=metric if isinstance(metric, int) and not isinstance(metric, bool) else 0,
            )
        )
    if not interfaces:
        raise ValueError("没有找到可用的 Windows IPv4 接口")
    return sorted(
        interfaces,
        key=lambda item: (
            item.state.casefold() != "connected",
            item.metric,
            item.index,
        ),
    )


def _normalize_connection_state(value: object) -> str:
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, int) and not isinstance(value, bool):
        return {
            0: "Disconnected",
            1: "Connected",
            2: "Disconnected",
            3: "Authenticating",
        }.get(value, f"状态 {value}")
    return ""


def _set_future_result(future: asyncio.Future[str], value: str) -> None:
    if not future.done():
        future.set_result(value)


def _cancel_future(future: asyncio.Future[str]) -> None:
    if not future.done():
        future.cancel()


def _completion_message(exit_code: int) -> str:
    return {
        0: "操作完成。",
        2: "无法确认配置接口的网络状态。",
        4: "门户状态与独立连通性探测未能同时确认在线。",
    }.get(exit_code, f"操作结束，退出码 {exit_code}。")
