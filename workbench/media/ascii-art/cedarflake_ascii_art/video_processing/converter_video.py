import os
import shutil
import subprocess
import sys
from tkinter import Tk, filedialog

from cedarflake_ascii_art.config import config, logger
from cedarflake_ascii_art.image_processing.converter_png import (
    ascii_art_convert,
    create_thumbnail,
)
from cedarflake_ascii_art.utils.file_utils import resource_path


def start_convert():
    """主流程：将视频转换为ASCII视频。"""
    # 隐藏Tkinter主窗口
    Tk().withdraw()

    # 选择视频文件
    src_file = filedialog.askopenfilename(
        title="选择一个视频文件", filetypes=[("视频文件", "*.mp4")]
    )
    if not src_file:
        logger.warning("未选择视频文件，程序退出。")
        return

    # 确定FFmpeg路径
    if getattr(sys, "frozen", False):  # 检测是否是打包后的环境
        base_dir = os.path.dirname(sys.executable)
        ffmpeg_path = resource_path(os.path.join("ffmpeg", "ffmpeg.exe"))
    else:
        # 获取项目根目录
        # converter_video.py 位于 cedarflake_ascii_art/video_processing/
        base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        # 构建FFmpeg路径
        ffmpeg_path = os.path.join(base_dir, "ffmpeg", "ffmpeg.exe")
        ffmpeg_path = os.path.abspath(ffmpeg_path)

    # 检查FFmpeg路径
    if not os.path.isfile(ffmpeg_path):
        logger.error(f"未找到FFmpeg！请确认路径是否正确：{ffmpeg_path}")
        return
    else:
        logger.info(f"FFmpeg路径确认：{ffmpeg_path}")

    # 设置输出目录
    video_name = os.path.splitext(os.path.basename(src_file))[0]
    output_dir = os.path.join(
        config.get("output_directories").get("video", "./output/video"), video_name
    )
    temp_audio_dir = os.path.join(output_dir, "temp_audio")
    temp_pic_dir = os.path.join(output_dir, "temp_pic")
    temp_thum_dir = os.path.join(output_dir, "temp_thum")
    temp_ascii_dir = os.path.join(output_dir, "temp_ascii")
    os.makedirs(temp_audio_dir, exist_ok=True)
    os.makedirs(temp_pic_dir, exist_ok=True)
    os.makedirs(temp_thum_dir, exist_ok=True)
    os.makedirs(temp_ascii_dir, exist_ok=True)

    # 定义输出文件路径
    audio_file = os.path.join(temp_audio_dir, f"{video_name}.aac")
    output_video = os.path.join(output_dir, f"{video_name}_ascii.mp4")

    try:
        # 分离音频
        logger.info(f"分离音频到：{audio_file}")
        subprocess.run([ffmpeg_path, "-i", src_file, "-vn", audio_file], check=True)

        # 分割视频为帧（24 FPS）
        logger.info(f"分割视频为帧，存储路径：{temp_pic_dir}")
        subprocess.run(
            [ffmpeg_path, "-i", src_file, "-r", "24", os.path.join(temp_pic_dir, "%06d.jpeg")],
            check=True,
        )

        # 生成缩略图
        logger.info(f"生成缩略图，存储路径：{temp_thum_dir}")
        create_thumbnail(temp_pic_dir, temp_thum_dir)

        # 转换缩略图为ASCII字符画
        logger.info(f"转换缩略图为ASCII字符画，存储路径：{temp_ascii_dir}")
        ascii_art_convert(temp_thum_dir, temp_ascii_dir)

        # 合成ASCII视频
        logger.info(f"合成ASCII视频，输出路径：{output_video}")
        subprocess.run(
            [
                ffmpeg_path,
                "-threads",
                "2",
                "-start_number",
                "000001",
                "-r",
                "24",
                "-i",
                os.path.join(temp_ascii_dir, "%06d.jpeg"),
                "-i",
                audio_file,
                "-vcodec",
                "mpeg4",
                "-c:a",
                "aac",
                "-b:a",
                "192k",
                "-shortest",
                output_video,
            ],
            check=True,
        )

        logger.info(f"字符视频生成完成：{output_video}")

    except subprocess.CalledProcessError as e:
        logger.error(f"FFmpeg命令执行失败：{e}")
    except Exception as e:
        logger.error(f"转换过程中出现错误：{e}")
    finally:
        # 清理临时文件夹
        def safe_rmtree(directory):
            try:
                shutil.rmtree(directory)
                logger.info(f"清理成功：{directory}")
            except Exception as e:
                logger.warning(f"清理目录 {directory} 时出现问题：{e}")

        safe_rmtree(temp_audio_dir)
        safe_rmtree(temp_pic_dir)
        safe_rmtree(temp_thum_dir)
        safe_rmtree(temp_ascii_dir)


# 如果直接运行该模块，执行主流程
if __name__ == "__main__":
    start_convert()
