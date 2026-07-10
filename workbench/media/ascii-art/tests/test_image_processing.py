import tempfile
import unittest
from pathlib import Path

from cedarflake_ascii_art.image_processing import converter_png, converter_txt
from PIL import Image


class TestImageProcessing(unittest.TestCase):
    def setUp(self):
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary_directory.name)
        self.image_path = self.root / "sample.png"
        Image.new("RGB", (16, 8), color=(80, 140, 220)).save(self.image_path)

    def tearDown(self):
        self.temporary_directory.cleanup()

    def test_convert_image_to_ascii_text(self):
        ascii_art = converter_txt.convert_image_to_ascii(self.image_path, new_width=8)

        self.assertIsInstance(ascii_art, str)
        self.assertEqual(len(ascii_art.splitlines()), 2)

    def test_save_ascii_image(self):
        ascii_art, width, height = converter_png.convert_image_to_ascii(
            self.image_path,
            target_width=8,
        )
        output_directory = self.root / "output"

        converter_png.save_ascii_to_png(
            ascii_art,
            width,
            height,
            output_directory=output_directory,
        )

        self.assertEqual(len(list(output_directory.glob("*.png"))), 1)


if __name__ == "__main__":
    unittest.main()
