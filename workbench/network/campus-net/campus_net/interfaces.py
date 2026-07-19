from __future__ import annotations

import json
import os
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path


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
