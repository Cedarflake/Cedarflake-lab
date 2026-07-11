#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
示例脚本：展示如何使用 scan_img_to.py
"""

import json
import os
import subprocess
import sys
from pathlib import Path


def create_sample_config():
    """
    创建示例配置文件
    """
    # 获取用户图片目录
    if sys.platform == "win32":
        pictures_dir = os.path.expanduser(r"~\Pictures")
    else:
        pictures_dir = os.path.expanduser("~/Pictures")

    # 创建示例目标目录
    sample_dest_dir = os.path.join(pictures_dir, "Backup")
    os.makedirs(sample_dest_dir, exist_ok=True)

    # 找到用户目录中可能包含图片的文件夹
    potential_image_dirs = []
    try:
        for item in os.listdir(pictures_dir):
            item_path = os.path.join(pictures_dir, item)
            if os.path.isdir(item_path) and item != "Backup":
                potential_image_dirs.append(item_path)
    except Exception as e:
        print(f"无法扫描图片目录: {e}")

    # 如果没有找到任何目录，则使用Pictures目录本身
    if not potential_image_dirs:
        potential_image_dirs = [pictures_dir]

    # 创建示例配置
    config = {
        "source_directories": potential_image_dirs,
        "destination_directory": sample_dest_dir,
        "include_extensions": [".jpg", ".jpeg", ".png", ".gif"],
        "ignore_patterns": ["temp_", "thumbnail_"],
    }

    # 保存到文件
    config_path = "example_config.json"
    with open(config_path, "w", encoding="utf-8") as f:
        json.dump(config, f, ensure_ascii=False, indent=4)

    print(f"已创建示例配置文件 {config_path}")
    return config_path


def main():
    print("==== scan_img_to.py 使用示例 ====")

    # 检查是否存在 scan_img_to.py
    script_path = Path(__file__).parent / "scan_img_to.py"
    if not script_path.exists():
        print(f"错误: 未找到 {script_path}")
        return

    # 创建示例配置
    config_path = create_sample_config()

    # 运行脚本
    print("\n正在运行 scan_img_to.py...")
    cmd = [sys.executable, str(script_path), "--config", config_path, "--workers", "4"]

    try:
        subprocess.run(cmd, check=True)
        print("\n脚本执行完成！请检查日志文件获取详细信息。")
    except subprocess.CalledProcessError as e:
        print(f"\n脚本执行失败: {e}")


if __name__ == "__main__":
    main()
