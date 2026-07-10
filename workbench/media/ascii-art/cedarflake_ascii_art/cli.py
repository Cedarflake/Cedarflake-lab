import os

import click

from cedarflake_ascii_art.config import config, logger
from cedarflake_ascii_art.image_processing import converter_png, converter_txt
from cedarflake_ascii_art.playback import player
from cedarflake_ascii_art.utils.file_utils import is_valid_file
from cedarflake_ascii_art.video_processing import converter_txt as video_converter_txt
from cedarflake_ascii_art.video_processing import converter_video


@click.command()
def main():
    """
    Cedarflake ASCII Art - 支持图片和视频处理，以及播放 .txt 文件
    """
    # 欢迎信息
    click.echo("=" * 50)
    click.echo("欢迎使用 Cedarflake ASCII Art！")
    click.echo("支持图片处理、视频转换和 ASCII 动画播放")
    click.echo("=" * 50)

    while True:
        click.echo("\n请选择操作:\n1. 图片处理\n2. 视频处理\n3. 播放 .txt 文件\n4. 退出")
        choice = input("请输入操作编号 (1-4): ").strip()
        if choice == "1":
            handle_image_processing()
        elif choice == "2":
            handle_video_processing()
        elif choice == "3":
            handle_txt_playback()
        elif choice == "4":
            click.echo("感谢你的使用，再见！")
            break
        else:
            click.echo("无效的选择，请重新输入！")


def handle_image_processing():
    """
    图片处理逻辑，包括 txt 模式和 png 模式。
    """
    click.echo(
        "请选择图片处理模式:\n1. txt 模式 (生成 ASCII 字符文件)\n2. 图片模式 (生成 ASCII 图片)"
    )
    mode_choice = input("请输入模式编号 (1 或 2): ").strip()
    if mode_choice == "1":
        # txt 模式
        image_path = input("请输入图片路径 (示例: C:\\\\path\\to\\your\\img.png): ").strip()
        if is_valid_file(image_path, [".jpg", ".jpeg", ".png"]):
            try:
                width_input = input(
                    f"请输入 ASCII 图的宽度 (默认: {config.get_default_setting('ascii_width_txt')}): "
                ).strip()
                new_width = (
                    int(width_input)
                    if width_input.isdigit()
                    else config.get_default_setting("ascii_width_txt")
                )
                ascii_art = converter_txt.convert_image_to_ascii(image_path, new_width=new_width)
                if ascii_art:
                    converter_txt.save_ascii_to_file(ascii_art)
                    click.echo(
                        f"ASCII 字符文件生成完成！结果已保存到 {config.get('output_directories').get('image_txt')}/"
                    )
            except Exception as e:
                logger.exception("图片处理失败")
                click.echo(f"图片处理失败: {e}")
        else:
            click.echo("无效的图片文件路径，请重新输入！")
    elif mode_choice == "2":
        # png 模式
        image_path = input("请输入图片路径 :").strip()
        if is_valid_file(image_path, [".jpg", ".jpeg", ".png"]):
            try:
                target_width = input(
                    f"请输入 ASCII 图的宽度 (默认: {config.get_default_setting('ascii_width_png')}): "
                ).strip()
                target_width = (
                    int(target_width)
                    if target_width.isdigit()
                    else config.get_default_setting("ascii_width_png")
                )
                converter_png.convert_and_save(image_path, target_width=target_width)
                click.echo(
                    f"图片转换完成！结果已保存到 {config.get('output_directories').get('image_png')}/"
                )
            except Exception as e:
                logger.exception("图片处理失败")
                click.echo(f"图片处理失败: {e}")
        else:
            click.echo("无效的图片文件路径，请重新输入！")
    else:
        click.echo("无效的选择，请重新输入！")


def handle_video_processing():
    """
    视频处理逻辑。
    """
    click.echo("请选择模式:\n1. txt (生成逐帧 ASCII 字符画并播放)\n2. video (生成完整 ASCII 视频)")
    mode_choice = input("请输入模式编号 (1 或 2): ").strip()
    if mode_choice == "1":
        # txt 模式
        video_path = input("请输入视频路径 :").strip()
        if is_valid_file(video_path, [".mp4", ".avi", ".mkv"]):
            try:
                video_converter_txt.video_to_ascii(
                    video_path, new_width=config.get_default_setting("ascii_width_txt")
                )
                video_name = os.path.splitext(os.path.basename(video_path))[0]
                video_output_dir = os.path.join(
                    config.get("output_directories").get("video"), video_name
                )
                player.play_ascii_video(
                    video_output_dir, fps=config.get_default_setting("video_fps")
                )
                click.echo(f"ASCII.txt 文件生成完成！结果已保存至：{video_output_dir}")
            except Exception as e:
                logger.exception("视频处理失败")
                click.echo(f"视频处理失败: {e}")
        else:
            click.echo("无效的视频文件路径，请重新输入！")
    elif mode_choice == "2":
        # video 模式
        click.echo("即将启动完整 ASCII 视频生成模块 (无需路径)...")
        try:
            converter_video.start_convert()
            click.echo(
                f"ASCII 视频生成成功！结果已保存至 {config.get('output_directories').get('video')}/"
            )
        except Exception as e:
            logger.exception("视频处理失败")
            click.echo(f"视频处理失败: {e}")
    else:
        click.echo("无效的选择，请重新输入！")


def handle_txt_playback():
    """
    播放 .txt 文件夹内容。
    """
    folder_path = input(
        "请输入存放 .txt 文件的文件夹路径 (示例: ./output/video/video_name): "
    ).strip()
    if os.path.isdir(folder_path):
        try:
            fps_input = input(
                f"请输入播放帧率 (默认: {config.get_default_setting('video_fps')}): "
            ).strip()
            fps = int(fps_input) if fps_input.isdigit() else config.get_default_setting("video_fps")
            player.play_ascii_video(folder_path, fps=fps)
        except Exception as e:
            logger.exception("播放失败")
            click.echo(f"播放失败: {e}")
    else:
        click.echo("无效的文件夹路径，请重新输入！")
