#!/usr/bin/env python3
"""
merge_av.py —— 强化鲁棒性的 FFmpeg 合并脚本
功能：
  - 交互 & CLI 模式二选一
  - 路径与扩展名校验
  - 磁盘空间检测
  - 超时执行与临时文件清理
  - 根据输出容器智能选用视频编码器：
      · MP4 ➔ copy（原画）
      · 其他 ➔ libx264 -crf 18 -preset slow（近无损）
  - 音频统一转 AAC
  - 优雅处理所有异常与用户中断
"""

import argparse
import atexit
import logging
import re
import shutil
import signal
import subprocess
import sys
from pathlib import Path

# 支持的媒体扩展名
VIDEO_EXT = {".mp4", ".mov", ".mkv", ".avi", ".flv", ".webm"}
AUDIO_EXT = {".mp3", ".aac", ".wav", ".flac", ".ogg", ".m4a"}

# 临时文件列表，用于退出时清理（目前无临时文件）
_temp_files = []


def setup_logging(verbose: bool):
    """
    配置日志输出到标准输出，避免干扰 input() 提示。
    """
    level = logging.DEBUG if verbose else logging.INFO
    fmt = "%(asctime)s - %(levelname)s - %(message)s"
    logging.basicConfig(level=level, format=fmt, stream=sys.stdout)


def check_ffmpeg():
    if not shutil.which("ffmpeg"):
        logging.error("未检测到 ffmpeg，请先安装并配置到 PATH。")
        sys.exit(1)


def validate_media_file(path: Path, allowed_exts: set, role: str):
    if not path.is_file():
        raise FileNotFoundError(f"{role} 文件不存在: {path}")
    if path.suffix.lower() not in allowed_exts:
        raise ValueError(f"{role} 扩展名不受支持: {path.suffix}")


def ensure_disk_space(target_dir: Path, required_bytes: int = 100 * 1024 * 1024):
    """检查目标目录是否至少有 required_bytes 可用空间，默认 100MB"""
    stat = shutil.disk_usage(str(target_dir))
    if stat.free < required_bytes:
        raise OSError(f"目标目录可用空间不足: {stat.free // (1024 * 1024)}MB")


def _sanitize_filename(name: str) -> str:
    """在 Windows 上移除非法字符，归一化空白，避免结尾空格/点。
    合法保留 Unicode 字符（如日文），仅替换 Windows 非法集 <>:"/\\|?* 与控制字符。
    """
    # 替换非法字符为空格
    illegal = '<>:"/\\|?*'
    table = {ord(c): " " for c in illegal}
    # 删除控制字符
    cleaned = "".join(ch if (32 <= ord(ch) <= 126) or (ord(ch) > 126) else " " for ch in name)
    cleaned = cleaned.translate(table)
    # 折叠空白
    cleaned = re.sub(r"\s+", " ", cleaned)
    # 去除首尾空白与尾随点
    cleaned = cleaned.strip().rstrip(".")
    return cleaned or "output"


def build_output_path(input_video: Path, output: str) -> Path:
    """
    构造输出路径：
      - 若未提供目录，输出到原视频目录
      - 清理文件名中的非法字符（尤其是正斜杠和反斜杠在 Windows 上会被当作路径分隔）
      - 若缺少扩展名，默认使用原视频的后缀（如 .mp4）
    """
    in_dir = input_video.resolve().parent
    path = Path(output)

    # 规则：
    # 1) 绝对路径：尊重目录，仅清理文件名
    # 2) 相对路径：若父目录不存在（通常是因为用户输入了带分隔符的“名字”），
    #    则把整串当作纯文件名，放到输入视频目录；否则尊重目录，仅清理文件名
    if path.is_absolute():
        filename = _sanitize_filename(path.name)
        target = path.with_name(filename)
    elif path.parent == Path(".") or not path.parent.exists():
        filename = _sanitize_filename(output)
        target = in_dir / filename
    else:
        filename = _sanitize_filename(path.name)
        target = path.with_name(filename)

    # 自动补后缀：若没有后缀，沿用输入视频的后缀
    if target.suffix == "":
        target = target.with_suffix(input_video.suffix)

    return target


def cleanup_temp_files():
    for f in _temp_files:
        try:
            if Path(f).exists():
                Path(f).unlink()
                logging.debug(f"清理临时文件: {f}")
        except Exception:
            pass


atexit.register(cleanup_temp_files)


def merge_av(
    input_video: Path,
    input_audio: Path,
    output_video: Path,
    overwrite: bool,
    verbose: bool,
    timeout: int,
):
    # 校验输入
    validate_media_file(input_video, VIDEO_EXT, "视频")
    validate_media_file(input_audio, AUDIO_EXT, "音频")
    out_dir = output_video.parent
    out_dir.mkdir(parents=True, exist_ok=True)
    ensure_disk_space(out_dir)

    # 根据输出后缀选择视频编码器
    suffix = output_video.suffix.lower()
    if suffix == ".mp4":
        video_codec = "copy"  # 原画
    else:
        video_codec = "libx264"  # 近无损编码
    audio_codec = "aac"

    # 如果是重新编码模式，加 CRF 与 preset
    extra_v = []
    if video_codec != "copy":
        extra_v = ["-crf", "18", "-preset", "slow"]

    # 构造 FFmpeg 命令
    ff_cmd = [
        "ffmpeg",
        "-y" if overwrite else "-n",
        "-i",
        str(input_video.resolve()),
        "-i",
        str(input_audio.resolve()),
        "-c:v",
        video_codec,
        *extra_v,
        "-c:a",
        audio_codec,
        "-map",
        "0:v:0",
        "-map",
        "1:a:0",
        "-shortest",
        str(output_video),
    ]
    logging.info(f"执行: {' '.join(ff_cmd)}")

    proc = subprocess.Popen(
        ff_cmd,
        stdout=None if verbose else subprocess.DEVNULL,
        stderr=None if verbose else subprocess.DEVNULL,
    )
    try:
        proc.wait(timeout=timeout)
    except subprocess.TimeoutExpired:
        proc.send_signal(signal.SIGINT)
        raise TimeoutError("FFmpeg 合并超时已中断")
    if proc.returncode != 0:
        raise subprocess.CalledProcessError(proc.returncode, ff_cmd)
    logging.info(f"合并成功 👉 {output_video}")


def interactive_mode(force: bool, verbose: bool, timeout: int):
    """
    交互模式：支持路径引号自动剥离，合并后继续，输入 'q' 退出。
    """
    print("进入交互模式（输入 q 或 quit 退出），喵~")
    try:
        while True:
            sys.stdout.flush()
            raw_vid = input("请输入原视频文件路径: ").strip()
            if raw_vid.lower() in ("q", "quit"):
                break
            vid = Path(raw_vid.strip('"').strip("'"))

            sys.stdout.flush()
            raw_aud = input("请输入原音频文件路径: ").strip()
            if raw_aud.lower() in ("q", "quit"):
                break
            aud = Path(raw_aud.strip('"').strip("'"))

            base = vid.stem
            default = f"{base}-已转换{vid.suffix}"
            sys.stdout.flush()
            raw_out = input(f"输出文件名（默认 {default}，输入 q 退出）: ").strip()
            if raw_out.lower() in ("q", "quit"):
                break
            out_name = raw_out or default

            output_path = build_output_path(vid, out_name)
            try:
                merge_av(vid, aud, output_path, force, verbose, timeout)
                print(f"\n✅ 合并已完成 👉 {output_path}\n")
            except Exception as e:
                logging.error(f"❌ 本次合并失败: {e}")

            print("-" * 50)
            print("你可以继续下一组合并，或者输入 q 退出喵~")
            print("-" * 50)

    except KeyboardInterrupt:
        print("\n喵～用户中断，已退出~")
    finally:
        print("退出交互模式，拜拜喵！")
        sys.exit(0)


def parse_args():
    p = argparse.ArgumentParser(description="鲁棒性 FFmpeg 合并脚本")
    g = p.add_mutually_exclusive_group()
    g.add_argument("-i", "--interactive", action="store_true", help="交互模式")
    p.add_argument("-f", "--force", action="store_true", help="覆盖已存在输出")
    p.add_argument("-v", "--verbose", action="store_true", help="详细日志")
    p.add_argument("-t", "--timeout", type=int, default=300, help="超时秒数，默认 300s")
    p.add_argument("video", nargs="?", help="视频文件路径")
    p.add_argument("audio", nargs="?", help="音频文件路径")
    p.add_argument("output", nargs="?", help="输出文件名")
    return p.parse_args()


def main():
    args = parse_args()
    setup_logging(args.verbose)
    check_ffmpeg()

    if args.interactive:
        interactive_mode(args.force, args.verbose, args.timeout)
    else:
        if not (args.video and args.audio and args.output):
            logging.error("参数不足，或与 -i 冲突。")
            sys.exit(1)
        vid = Path(args.video)
        aud = Path(args.audio)
        outp = build_output_path(vid, args.output)
        try:
            merge_av(vid, aud, outp, args.force, args.verbose, args.timeout)
        except Exception as e:
            logging.error(f"合并失败: {e}")
            sys.exit(1)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n喵～用户中断，已退出~")
        sys.exit(0)
