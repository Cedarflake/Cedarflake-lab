# WentUrc_ASCII_Art_Tool/tests/test_image_processing.py

import unittest
import os
from WentUrc_ASCII_Art_Tool.image_processing import converter_txt, converter_png
from WentUrc_ASCII_Art_Tool.utils.file_utils import is_valid_file

class TestImageProcessing(unittest.TestCase):
    def setUp(self):
        # 设置测试数据和目录
        self.test_image_path = "tests/test_images/sample.jpg"
        self.output_dir_txt = "tests/output/image/txt"
        self.output_dir_png = "tests/output/image/png"
        os.makedirs(self.output_dir_txt, exist_ok=True)
        os.makedirs(self.output_dir_png, exist_ok=True)

    def test_convert_image_to_ascii_txt(self):
        ascii_art = converter_txt.convert_image_to_ascii(self.test_image_path, new_width=100)
        self.assertIsNotNone(ascii_art)
        self.assertIsInstance(ascii_art, str)
        # 检查保存功能
        converter_txt.save_ascii_to_file(ascii_art, directory=self.output_dir_txt)
        # 检查文件是否存在
        output_files = os.listdir(self.output_dir_txt)
        self.assertGreater(len(output_files), 0)

    def test_convert_image_to_ascii_png(self):
        ascii_art, width, height = converter_png.convert_image_to_ascii(self.test_image_path, target_width=300)
        self.assertIsNotNone(ascii_art)
        self.assertIsInstance(ascii_art, str)
        self.assertIsNotNone(width)
        self.assertIsNotNone(height)
        converter_png.save_ascii_to_png(ascii_art, width, height, output_directory=self.output_dir_png)
        # 检查文件是否存在
        output_files = os.listdir(self.output_dir_png)
        self.assertGreater(len(output_files), 0)

    def tearDown(self):
        # 清理测试输出目录
        import shutil
        shutil.rmtree(self.output_dir_txt, ignore_errors=True)
        shutil.rmtree(self.output_dir_png, ignore_errors=True)

if __name__ == '__main__':
    unittest.main()
