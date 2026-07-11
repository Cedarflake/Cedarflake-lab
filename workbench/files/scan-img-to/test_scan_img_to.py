import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Barrier
from unittest import mock

import scan_img_to


class CopyFileTests(unittest.TestCase):
    def test_concurrent_same_name_copies_preserve_both_files(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            source_a = root / "source-a" / "photo.jpg"
            source_b = root / "source-b" / "photo.jpg"
            destination = root / "destination"
            source_a.parent.mkdir()
            source_b.parent.mkdir()
            source_a.write_bytes(b"first image")
            source_b.write_bytes(b"second image")
            copy_barrier = Barrier(2)
            real_copy = scan_img_to.shutil.copy2

            def synchronized_copy(source, target):
                copy_barrier.wait(timeout=5)
                return real_copy(source, target)

            with mock.patch("scan_img_to.shutil.copy2", side_effect=synchronized_copy):
                with ThreadPoolExecutor(max_workers=2) as executor:
                    results = list(
                        executor.map(
                            lambda source: scan_img_to.copy_file(source, destination),
                            [source_a, source_b],
                        )
                    )

            self.assertEqual(results, [True, True])
            copied_contents = {path.read_bytes() for path in destination.glob("photo*.jpg")}
            self.assertEqual(copied_contents, {b"first image", b"second image"})


if __name__ == "__main__":
    unittest.main()
