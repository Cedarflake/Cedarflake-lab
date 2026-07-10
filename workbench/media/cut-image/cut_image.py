import argparse
from pathlib import Path

from PIL import Image


def slice_image_horizontally(
    image_path: Path, output_dir: Path, output_prefix: str, slices: int = 5
) -> None:
    with Image.open(image_path) as image:
        width, height = image.size
        output_dir.mkdir(parents=True, exist_ok=True)
        slice_height = height // slices

        for index in range(slices):
            upper = index * slice_height
            lower = (index + 1) * slice_height if index < slices - 1 else height
            cropped_image = image.crop((0, upper, width, lower))
            output_path = output_dir / f"{output_prefix}_{index + 1}.png"
            cropped_image.save(output_path)
            print(f"保存切片 {index + 1} 到 {output_path}")


def main() -> None:
    parser = argparse.ArgumentParser(description="将图片按横向切分成多张图片")
    parser.add_argument("image", type=Path, help="输入图片路径")
    parser.add_argument(
        "--output-dir", type=Path, default=Path("cut-image-output"), help="输出目录"
    )
    parser.add_argument("--prefix", default="slice", help="输出文件名前缀")
    parser.add_argument("--slices", type=int, default=5, help="切片数量")
    args = parser.parse_args()

    if args.slices < 1:
        raise ValueError("切片数量必须大于 0")

    slice_image_horizontally(args.image, args.output_dir, args.prefix, args.slices)


if __name__ == "__main__":
    main()
