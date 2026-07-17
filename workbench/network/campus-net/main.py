from __future__ import annotations

import argparse
import asyncio
import json
import sys
from typing import Any

from campus_net.application import classify_run_error, execute_config
from campus_net.config_paths import resolve_config_path


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


async def async_main(*, probe_only: bool = False) -> int:
    cfg = load_config()
    return await execute_config(cfg, probe_only=probe_only)


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
