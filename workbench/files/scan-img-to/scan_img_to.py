#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
扫描一个或多个目录中的所有图片，并将其复制到一个或多个目标文件夹。
支持多线程和多进程处理，路径信息通过配置文件管理，支持多平台和忽略规则。

作者: Cedarflake
版本: 1.0.0
日期: 2025-05-12
"""

import argparse
import concurrent.futures
import json
import logging
import os
import re
import shutil
import sys
from datetime import datetime
from logging.handlers import RotatingFileHandler
from pathlib import Path


# 配置日志格式
def setup_logging(log_level=logging.INFO, log_dir=None):
    """
    设置日志配置，支持不同级别和日志文件路径
    """
    if log_dir:
        log_dir_path = Path(log_dir)
        log_dir_path.mkdir(exist_ok=True, parents=True)
        log_file = log_dir_path / f"scan_img_to_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log"
    else:
        log_file = f"scan_img_to_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log"

    handlers = [
        logging.StreamHandler(),
        RotatingFileHandler(
            log_file,
            maxBytes=10 * 1024 * 1024,  # 10MB
            backupCount=5,
            encoding="utf-8",
        ),
    ]

    logging.basicConfig(
        level=log_level,
        format="%(asctime)s - %(levelname)s - %(message)s",
        handlers=handlers,
        force=True,
    )

    # 减少第三方库的日志级别，避免过多输出
    logging.getLogger("urllib3").setLevel(logging.WARNING)
    logging.getLogger("PIL").setLevel(logging.WARNING)


# 支持的图片格式
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".bmp", ".tiff", ".webp"}


def load_config(config_file="config.json"):
    """
    加载配置文件
    """
    try:
        with open(config_file, "r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        logging.error(f"配置文件 {config_file} 不存在")
        return None
    except json.JSONDecodeError:
        logging.error(f"配置文件 {config_file} 格式错误")
        return None


def is_image_file(file_path):
    """
    判断文件是否为图片
    """
    return file_path.suffix.lower() in IMAGE_EXTENSIONS


def should_ignore(file_path, ignore_patterns):
    """
    根据忽略规则判断是否应该忽略文件
    """
    if not ignore_patterns:
        return False

    str_path = str(file_path)

    for pattern in ignore_patterns:
        if re.search(pattern, str_path):
            logging.debug(f"忽略文件 {file_path} (匹配规则: {pattern})")
            return True

    return False


def scan_directory(directory, ignore_patterns=None):
    """
    扫描目录中的所有图片文件，支持忽略规则
    """
    directory = Path(directory)
    if not directory.exists() or not directory.is_dir():
        logging.warning(f"目录不存在或不是有效目录: {directory}")
        return []

    image_files = []
    try:
        for file_path in directory.glob("**/*"):
            if (
                file_path.is_file()
                and is_image_file(file_path)
                and not should_ignore(file_path, ignore_patterns)
            ):
                image_files.append(file_path)
    except Exception as e:
        logging.error(f"扫描目录 {directory} 时出错: {e}")

    return image_files


def copy_file(src_file, dest_dir):
    """
    复制单个文件到目标目录
    """
    src_file = Path(src_file)
    dest_dir = Path(dest_dir)

    if not src_file.exists():
        logging.warning(f"源文件不存在: {src_file}")
        return False

    try:
        # 确保目标目录存在
        os.makedirs(dest_dir, exist_ok=True)

        counter = 0
        while True:
            suffix = "" if counter == 0 else f"_{counter:03d}"
            dest_file = dest_dir / f"{src_file.stem}{suffix}{src_file.suffix}"
            try:
                descriptor = os.open(dest_file, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
                os.close(descriptor)
                break
            except FileExistsError:
                counter += 1

        try:
            shutil.copy2(src_file, dest_file)
        except Exception:
            dest_file.unlink(missing_ok=True)
            raise
        logging.info(f"成功复制: {src_file} -> {dest_file}")
        return True
    except Exception as e:
        logging.error(f"复制文件 {src_file} 时出错: {e}")
        return False


def process_directory(src_dir, dest_dirs, max_workers, ignore_patterns=None):
    """
    处理单个源目录，支持多个目标目录
    """
    image_files = scan_directory(src_dir, ignore_patterns)
    logging.info(f"在 {src_dir} 中找到 {len(image_files)} 个图片文件")

    success_count = 0
    total_operations = len(image_files) * len(dest_dirs)

    # 使用线程池进行并行复制
    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
        # 为每个图片和每个目标目录创建任务
        futures = []
        for img in image_files:
            for dest_dir in dest_dirs:
                futures.append(executor.submit(copy_file, img, dest_dir))

        for future in concurrent.futures.as_completed(futures):
            if future.result():
                success_count += 1

    return success_count, total_operations


def main():
    parser = argparse.ArgumentParser(description="扫描目录中的图片并复制到目标文件夹")
    parser.add_argument("-c", "--config", default="config.json", help="配置文件路径")
    parser.add_argument("-w", "--workers", type=int, default=4, help="并行处理的线程数")
    parser.add_argument(
        "-l",
        "--log-level",
        choices=["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"],
        default="INFO",
        help="日志级别",
    )
    parser.add_argument("-d", "--log-dir", help="日志文件目录")
    args = parser.parse_args()

    # 设置日志级别
    log_level = getattr(logging, args.log_level)
    setup_logging(log_level=log_level, log_dir=args.log_dir)

    # 加载配置
    config = load_config(args.config)
    if not config:
        logging.error("无法加载配置，程序退出")
        sys.exit(1)

    # 确保必要的配置项存在
    if "source_directories" not in config:
        logging.error("配置文件缺少必要的 'source_directories' 项")
        sys.exit(1)

    if "destination_directories" not in config and "destination_directory" not in config:
        logging.error(
            "配置文件缺少目标目录配置，需要 'destination_directories' 或 'destination_directory'"
        )
        sys.exit(1)

    source_dirs = config["source_directories"]

    # 支持单个目标目录或多个目标目录
    if "destination_directories" in config:
        dest_dir = config["destination_directories"]
    else:
        dest_dir = [config["destination_directory"]]

    # 获取忽略规则
    ignore_patterns = config.get("ignore_patterns", [])

    # 记录开始时间
    start_time = datetime.now()
    logging.info(f"任务开始: {start_time}")
    logging.info(f"源目录: {source_dirs}")
    logging.info(f"目标目录: {dest_dir}")
    logging.info(f"使用 {args.workers} 个线程进行处理")

    total_success = 0
    total_images = 0

    # 处理每个源目录
    for src_dir in source_dirs:
        success, total = process_directory(src_dir, dest_dir, args.workers, ignore_patterns)
        total_success += success
        total_images += total

    # 记录结束时间和统计信息
    end_time = datetime.now()
    duration = end_time - start_time
    logging.info(f"任务完成: {end_time}")
    logging.info(f"总耗时: {duration}")
    logging.info(f"成功复制 {total_success}/{total_images} 个文件")


if __name__ == "__main__":
    main()
