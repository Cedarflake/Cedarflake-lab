import os

from PIL import Image, ImageDraw, ImageFont

from cedarflake_ascii_art.config import config, logger
from cedarflake_ascii_art.utils.file_utils import get_next_available_filename

# 简单的 ASCII 字符表：用于单张图片转 ASCII
ASCII_CHARS = "@%#*+=-:. "

# 更丰富的 ASCII 符号表：用于视频截图转 ASCII
SYMBOLS = list("$@B%8&WM#*oahkbdpqwmZO0QLCJUYXzcvunxrjft/\\|()1{}[]?-_+~<>i!lI;:,\"^`'.   ")


def grayify(image):
    """将图片转换为灰度图。"""
    return image.convert("L")


def pixels_to_ascii(image):
    """将每个像素映射到对应的ASCII字符(用于单张图片)。"""
    pixels = image.getdata()
    ascii_str = "".join([ASCII_CHARS[min(pixel // 25, len(ASCII_CHARS) - 1)] for pixel in pixels])
    return ascii_str


def convert_image_to_ascii(image_path, font_width=4.80, font_height=5.88, target_width=300):
    """
    将图片转换为ASCII字符画，同时动态调整比例。
    返回ASCII字符画、调整后的宽度和高度。
    """
    try:
        image = Image.open(image_path)
    except Exception as e:
        logger.error(f"无法打开图片 {image_path}：{e}")
        return None, None, None

    # 原始图片尺寸
    original_width, original_height = image.size

    # 字符的宽高比（高度 / 宽度）
    char_aspect_ratio = font_height / font_width

    # 原图宽高比
    aspect_ratio = original_height / original_width

    # 动态调整的高度比例
    adjusted_height = int(target_width * aspect_ratio / char_aspect_ratio)

    # 调整图像尺寸并转灰度
    image = image.resize((target_width, adjusted_height))
    image = grayify(image)
    ascii_str = pixels_to_ascii(image)

    # 按行拼接
    ascii_image = "\n".join(
        [ascii_str[i : (i + target_width)] for i in range(0, len(ascii_str), target_width)]
    )

    logger.info(f"成功将图片 {image_path} 转换为ASCII字符画。")
    return ascii_image, target_width, adjusted_height


def save_ascii_to_png(
    ascii_art, corrected_width, corrected_height, output_directory=None, font_path=None
):
    """
    将ASCII字符画保存为PNG图片，保持字符比例一致。
    """
    if output_directory is None:
        output_directory = config.get("output_directories").get("image_png", "./output/image/png")
    if not ascii_art.strip():
        logger.error("ASCII字符内容为空，无法生成图片。")
        return

    # 设置字体大小
    font_size = 12
    font_path = font_path or config.get("font_path", "C:\\Windows\\Fonts\\consola.ttf")

    try:
        font = ImageFont.truetype(font_path, font_size)
    except Exception as e:
        logger.warning(f"字体加载失败：{font_path}，使用默认字体。错误：{e}")
        font = ImageFont.load_default()

    # 获取字体宽高，使用 getbbox 代替 getsize
    try:
        bbox = font.getbbox("A")
        char_width, char_height = bbox[2] - bbox[0], bbox[3] - bbox[1]
    except Exception as e:
        logger.warning(f"获取字体尺寸失败：{e}，使用默认尺寸。")
        char_width, char_height = 10, 10  # 默认尺寸

    # 计算图片的宽高
    image_width = corrected_width * char_width
    image_height = corrected_height * char_height

    # 创建空白图片并绘制
    img = Image.new("RGB", (image_width, image_height), color="white")
    draw = ImageDraw.Draw(img)

    y = 0
    for line in ascii_art.split("\n"):
        draw.text((0, y), line, font=font, fill="black")
        y += char_height

    # 保存图片
    try:
        output_path = get_next_available_filename(
            output_directory, base_name="ascii_art", extension=".png"
        )
        os.makedirs(output_directory, exist_ok=True)
        img.save(output_path, format="PNG")
        logger.info(f"ASCII字符画已保存为PNG图片：{output_path}")
    except Exception as e:
        logger.error(f"保存PNG图片时发生错误：{e}")


def convert_and_save(image_path, target_width=300):
    """
    高层函数：将图片转换为ASCII并保存为PNG。
    """
    ascii_art, corrected_width, corrected_height = convert_image_to_ascii(
        image_path, target_width=target_width
    )
    if ascii_art:
        save_ascii_to_png(ascii_art, corrected_width, corrected_height)
        logger.info("ASCII PNG生成完成。")
    else:
        logger.error("ASCII字符转换失败。")


# --------------------- 以下为从 converter_video.py 移动过来的函数 --------------------- #


def clean_metadata(input_path, output_path):
    """
    清除图片元数据（解决 iCCP 警告），
    原先在 converter_video.py 中使用。
    """
    os.makedirs(os.path.dirname(output_path), exist_ok=True)  # 确保输出目录存在
    try:
        with Image.open(input_path) as img:
            img.save(output_path, optimize=True)
        logger.info(f"清理元数据后的图片已保存至：{output_path}")
    except Exception as e:
        logger.error(f"清理元数据失败：{e}")
        raise e


def load_picture(filename):
    """
    加载并转换图片为灰度图。
    原先在 converter_video.py，用于把图片读取为像素数组。
    """
    base_dir, file_name = os.path.split(filename)
    clean_filename = os.path.join(base_dir, "cleaned_" + file_name)

    clean_metadata(filename, clean_filename)

    try:
        img = Image.open(clean_filename).convert("L")
        x, y = img.size
        pixels = list(img.getdata())
        img.close()
        logger.info(f"已加载并转换图片为灰度图：{clean_filename}")
        return pixels, x, y
    except Exception as e:
        logger.error(f"加载图片失败：{e}")
        raise e


def create_ascii_picture(pixels, symbols, dest_name, x_size, y_size):
    """
    生成并保存ASCII字符画为JPEG图片。
    原先在 converter_video.py，用于对像素数组逐个替换为ASCII符号。
    """
    scale = 4
    border = 1
    interval_pixel = 2
    try:
        # 创建空白灰度图
        img = Image.new("L", (x_size * scale + 2 * border, y_size * scale + 2 * border), 255)
        font_path = config.get("font_path", "C:\\Windows\\Fonts\\Arial.ttf")
        try:
            fnt = ImageFont.truetype(font_path, int(scale * 3))
        except Exception as e:
            logger.warning(f"字体加载失败：{font_path}，使用默认字体。错误：{e}")
            fnt = ImageFont.load_default()

        draw = ImageDraw.Draw(img)
        x = border
        y = border
        for j in range(0, y_size, interval_pixel):
            for i in range(0, x_size, interval_pixel):
                try:
                    pixel_value = pixels[j * x_size + i]
                    symbol_index = int(pixel_value / 256 * len(symbols))
                    symbol = symbols[symbol_index] if symbol_index < len(symbols) else symbols[-1]
                    draw.text((x, y), symbol, font=fnt, fill=0)
                    x += scale * interval_pixel
                except IndexError:
                    logger.warning(f"索引错误：({i}, {j})，像素值：{pixel_value}")
            x = border
            y += scale * interval_pixel
        img.save(dest_name, "JPEG")
        logger.info(f"ASCII字符画已保存为JPEG图片：{dest_name}")
    except Exception as e:
        logger.error(f"生成ASCII字符画失败：{e}")
        raise e


def create_thumbnail(src_dir, dst_dir, size=(200, 200)):
    """
    生成缩略图。
    原先在 converter_video.py，用于把抽帧后的JPEG缩小，减少后续处理负担。
    """
    os.makedirs(dst_dir, exist_ok=True)
    try:
        picts_list = sorted(os.listdir(src_dir))
        for picture in picts_list:
            src_path = os.path.join(src_dir, picture)
            dst_path = os.path.join(dst_dir, picture)
            with Image.open(src_path) as img:
                img.thumbnail(size, Image.Resampling.LANCZOS)
                img.save(dst_path)
            logger.info(f"缩略图已创建：{dst_path}")
    except Exception as e:
        logger.error(f"生成缩略图失败：{e}")
        raise e


def ascii_art_convert(src_dir, dest_dir):
    """
    将缩略图转换为ASCII字符画。
    原先在 converter_video.py。
    """
    os.makedirs(dest_dir, exist_ok=True)
    try:
        picts_list = sorted(os.listdir(src_dir))
        for i, picture in enumerate(picts_list):
            src_path = os.path.join(src_dir, picture)
            dest_path = os.path.join(dest_dir, picture)
            pixels, x_size, y_size = load_picture(src_path)
            create_ascii_picture(pixels, SYMBOLS, dest_path, x_size, y_size)
            logger.info(f"已转换 {i + 1}/{len(picts_list)}：{picture}")
    except Exception as e:
        logger.error(f"转换ASCII字符画失败：{e}")
        raise e


# 如果直接运行该模块，允许用户输入图片路径和宽度
def main():
    """主程序入口"""
    image_path = input("请输入图片路径：").strip()
    width_input = input("请输入目标宽度 (默认300): ").strip()
    try:
        target_width = int(width_input) if width_input.isdigit() else 300
    except ValueError:
        target_width = 300

    convert_and_save(image_path, target_width=target_width)


if __name__ == "__main__":
    main()
