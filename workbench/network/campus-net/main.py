from __future__ import annotations

import argparse
import asyncio
import json
import subprocess
import sys
from collections.abc import Callable
from typing import Any

from campus_net.application import classify_run_error, execute_config
from campus_net.config_paths import resolve_config_path
from campus_net.interfaces import NetworkInterface, list_windows_ipv4_interfaces

InputReader = Callable[[str], str]
OutputWriter = Callable[[str], None]
InterfaceLoader = Callable[[], list[NetworkInterface]]


def load_config() -> dict[str, Any]:
    config_path = resolve_config_path()
    with config_path.open("r", encoding="utf-8") as config_file:
        config = json.load(config_file)
    if not isinstance(config, dict):
        raise TypeError("config.json 顶层必须是 JSON 对象")
    return config


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="连接锐捷校园网门户")
    parser.add_argument(
        "--probe-only",
        action="store_true",
        help="仅探测绑定接口的网络状态，不提交认证",
    )
    parser.add_argument(
        "--print-config-path",
        action="store_true",
        help="只显示将使用的配置路径，不读取配置或发起网络请求",
    )
    return parser.parse_args()


def is_interactive_terminal() -> bool:
    for stream in (sys.stdin, sys.stdout):
        try:
            if stream is None or not stream.isatty():
                return False
        except (AttributeError, OSError):
            return False
    return True


def prompt_interface_selection(
    current_index: int,
    *,
    interface_loader: InterfaceLoader = list_windows_ipv4_interfaces,
    input_reader: InputReader = input,
    output_writer: OutputWriter = print,
) -> int | None:
    try:
        interfaces = interface_loader()
    except (OSError, ValueError, RuntimeError, subprocess.SubprocessError) as error:
        output_writer(f"无法读取 Windows IPv4 接口列表：{error}")
        return None

    output_writer("当前 Windows IPv4 接口（已连接接口优先）：")
    for position, interface in enumerate(interfaces, start=1):
        current_marker = "（当前配置）" if interface.index == current_index else ""
        output_writer(f"  [{position}] {interface.display_name}{current_marker}")

    while True:
        try:
            answer = input_reader("请选择接口序号（直接回车或输入 0 取消）：").strip()
        except (EOFError, KeyboardInterrupt):
            output_writer("接口选择已取消。")
            return None
        if answer.casefold() in {"", "0", "q", "quit"}:
            return None
        try:
            position = int(answer)
        except ValueError:
            output_writer(f"请输入 1 到 {len(interfaces)} 之间的序号，或输入 0 取消。")
            continue
        if 1 <= position <= len(interfaces):
            return interfaces[position - 1].index
        output_writer(f"请输入 1 到 {len(interfaces)} 之间的序号，或输入 0 取消。")


async def async_main(*, probe_only: bool = False) -> int:
    cfg = load_config()
    interface_selector = prompt_interface_selection if is_interactive_terminal() else None
    return await execute_config(
        cfg,
        probe_only=probe_only,
        interface_selector=interface_selector,
    )


def main() -> int:
    args = parse_args()
    try:
        if args.print_config_path:
            print(resolve_config_path())
            return 0
        return asyncio.run(async_main(probe_only=args.probe_only))
    except BaseException as error:
        error_info = classify_run_error(error)
        if error_info is None:
            raise
        print(f"{error_info.title}：{error_info.message}", file=sys.stderr)
        return error_info.exit_code


if __name__ == "__main__":
    raise SystemExit(main())
