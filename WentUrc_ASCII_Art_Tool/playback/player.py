# WentUrc_ASCII_Art_Tool/playback/player.py

import os
import time
import glob
import logging
from WentUrc_ASCII_Art_Tool.config import logger, config

def play_ascii_video(folder_path, fps=24):
    """
    播放ASCII视频，通过逐帧显示.txt文件中的ASCII字符。
    """
    try:
        # 获取所有帧文件，按顺序排序
        frame_files = sorted(glob.glob(os.path.join(folder_path, "frame_*.txt")))
        if not frame_files:
            logger.error(f"在目录 {folder_path} 中未找到任何.txt帧文件。")
            return

        frame_delay = 1 / fps

        logger.info(f"开始播放ASCII视频：{folder_path}，帧率：{fps} FPS")

        for frame_file in frame_files:
            with open(frame_file, "r", encoding='utf-8') as f:
                frame = f.read()

            # 清屏
            os.system('cls' if os.name == 'nt' else 'clear')

            # 显示帧
            print(frame)

            # 等待下一帧
            time.sleep(frame_delay)

        logger.info("ASCII视频播放完成。")

    except KeyboardInterrupt:
        logger.info("用户中断了ASCII视频播放。")
    except Exception as e:
        logger.error(f"播放ASCII视频时发生错误：{e}")
