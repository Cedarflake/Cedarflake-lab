# WentUrc_ASCII_Art_Tool/image_processing/converter_txt.py

import os
from PIL import Image
from WentUrc_ASCII_Art_Tool.utils.file_utils import save_to_file
from WentUrc_ASCII_Art_Tool.config import logger, config

ASCII_CHARS = "@%#*+=-:. "

def resize_image(image, new_width=100):
    """调整图片大小，同时保持纵横比。"""
    width, height = image.size
    aspect_ratio = height / width
    new_height = int(new_width * aspect_ratio * 0.5)
    return image.resize((new_width, new_height))

def grayify(image):
    """将图片转换为灰度图。"""
    return image.convert("L")

def pixels_to_ascii(image):
    """将每个像素映射到对应的ASCII字符。"""
    pixels = image.getdata()
    ascii_str = "".join([ASCII_CHARS[min(pixel // 25, len(ASCII_CHARS) - 1)] for pixel in pixels])
    return ascii_str

def convert_image_to_ascii(image_path, new_width=100):
    """将图片转换为ASCII字符字符串。"""
    try:
        image = Image.open(image_path)
    except Exception as e:
        logger.error(f"无法打开图片 {image_path}：{e}")
        return None

    image = resize_image(image, new_width)
    image = grayify(image)
    ascii_str = pixels_to_ascii(image)

    ascii_str_len = len(ascii_str)
    ascii_image = "\n".join([ascii_str[i:(i + new_width)] for i in range(0, ascii_str_len, new_width)])

    logger.info(f"成功将图片 {image_path} 转换为ASCII字符。")
    return ascii_image

def save_ascii_to_file(ascii_art, directory=None):
    """将ASCII字符保存到文本文件中，文件名自动编号。"""
    if directory is None:
        directory = config.get('output_directories').get('image_txt', './output/image/txt')
    save_to_file(ascii_art, directory=directory, filename_prefix="output", extension=".txt")
    logger.info(f"ASCII字符文件已保存至 {directory}/")

# 如果直接运行该模块，允许用户输入图片路径和宽度
if __name__ == "__main__":
    image_path = input("请输入图片路径：").strip()
    width_input = input("请输入宽度（默认100）：").strip()
    try:
        width = int(width_input) if width_input.isdigit() else 100
    except ValueError:
        width = 100

    ascii_art = convert_image_to_ascii(image_path, new_width=width)
    if ascii_art:
        save_ascii_to_file(ascii_art)
        print(ascii_art)  # 可选：用于调试或直接查看ASCII字符
