import os

import cv2

from cedarflake_ascii_art.config import config, logger
from cedarflake_ascii_art.playback import player

ASCII_CHARS = "@%#*+=-:. "


def resize_frame(frame, new_width=100):
    """调整视频帧大小，同时保持纵横比。"""
    height, width = frame.shape[:2]
    aspect_ratio = height / width
    new_height = int(new_width * aspect_ratio * 0.5)
    resized_frame = cv2.resize(frame, (new_width, new_height))
    return resized_frame


def pixels_to_ascii(image):
    """将每个像素映射到对应的ASCII字符。"""
    pixels = image.flatten()
    ascii_str = "".join([ASCII_CHARS[min(pixel // 25, len(ASCII_CHARS) - 1)] for pixel in pixels])
    return ascii_str


def frame_to_ascii(frame, new_width=100):
    """将单个视频帧转换为ASCII字符。"""
    gray_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)  # 转为灰度
    resized_frame = resize_frame(gray_frame, new_width)  # 调整大小
    ascii_str = pixels_to_ascii(resized_frame)  # 转换为ASCII字符
    ascii_image = "\n".join(
        [ascii_str[i : (i + new_width)] for i in range(0, len(ascii_str), new_width)]
    )
    return ascii_image


def video_to_ascii(video_path, output_dir=None, new_width=100):
    """将视频逐帧转换为ASCII字符并保存为文本文件。"""
    if output_dir is None:
        output_dir = config.get("output_directories").get("video", "./output/video")

    # 提取视频名称并创建输出目录
    video_name = os.path.splitext(os.path.basename(video_path))[0]
    video_output_dir = os.path.join(output_dir, video_name)
    os.makedirs(video_output_dir, exist_ok=True)

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        logger.error(f"无法打开视频文件：{video_path}")
        return

    frame_index = 0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    logger.info(f"开始转换视频 {video_path}，总帧数：{total_frames}")

    while True:
        ret, frame = cap.read()
        if not ret:
            break  # 视频结束

        ascii_art = frame_to_ascii(frame, new_width)
        frame_filename = f"frame_{frame_index:06d}.txt"
        frame_path = os.path.join(video_output_dir, frame_filename)
        try:
            with open(frame_path, "w", encoding="utf-8") as f:
                f.write(ascii_art)
            logger.debug(f"保存帧 {frame_index}：{frame_path}")
        except Exception as e:
            logger.error(f"保存帧 {frame_index} 失败：{e}")

        logger.info(f"处理帧 {frame_index + 1}/{total_frames}")
        frame_index += 1

    cap.release()
    logger.info(f"视频转换完成！所有帧已保存至：{video_output_dir}")

    # 自动调用播放模块
    try:
        player.play_ascii_video(video_output_dir, fps=config.get_default_setting("video_fps"))
        logger.info("ASCII视频播放已启动。")
    except Exception as e:
        logger.error(f"启动播放模块失败：{e}")


# 如果直接运行该模块，允许用户输入视频路径和宽度
if __name__ == "__main__":
    video_path = input("请输入视频路径：").strip()
    width_input = input("请输入字符宽度（默认100）：").strip()
    try:
        new_width = int(width_input) if width_input.isdigit() else 100
    except ValueError:
        new_width = 100

    video_to_ascii(video_path, new_width=new_width)
