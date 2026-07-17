from __future__ import annotations

import argparse
from collections.abc import Sequence
from pathlib import Path

from campus_net.gui import launch_gui


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Campus Net 图形界面",
        allow_abbrev=False,
    )
    parser.add_argument(
        "--config",
        type=Path,
        metavar="PATH",
        help="使用指定配置文件；默认按程序内置顺序查找 config.json",
    )
    parser.add_argument(
        "--smoke-test",
        action="store_true",
        help="只创建、更新并销毁窗口，不读取配置或访问网络",
    )
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    launch_gui(config_path=args.config, smoke_test=args.smoke_test)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
