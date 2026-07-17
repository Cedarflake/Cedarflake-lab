import json
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from campus_net.window_state import (
    ScreenRect,
    WindowState,
    clamp_window_state,
    load_window_state,
    save_window_state,
)


class TestWindowStatePersistence(unittest.TestCase):
    def test_round_trips_window_state(self):
        with TemporaryDirectory() as temporary_directory:
            path = Path(temporary_directory) / "window-state.json"
            state = WindowState(
                width=1100,
                height=720,
                x=-1450,
                y=85,
                maximized=True,
            )

            save_window_state(state, path)

            self.assertEqual(load_window_state(path), state)

    def test_missing_or_corrupt_state_is_ignored(self):
        with TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            missing_path = root / "missing.json"
            self.assertIsNone(load_window_state(missing_path))

            corrupt_payloads = (
                b"{not-json",
                b"[]",
                b'"window"',
                json.dumps(
                    {
                        "height": 720,
                        "x": 20,
                        "y": 30,
                        "maximized": False,
                    }
                ).encode("utf-8"),
            )
            for index, payload in enumerate(corrupt_payloads):
                with self.subTest(index=index):
                    path = root / f"corrupt-{index}.json"
                    path.write_bytes(payload)
                    self.assertIsNone(load_window_state(path))

    def test_oversized_state_file_is_ignored(self):
        with TemporaryDirectory() as temporary_directory:
            path = Path(temporary_directory) / "oversized.json"
            path.write_bytes(b" " * (1024 * 1024))

            self.assertIsNone(load_window_state(path))

    def test_rejects_booleans_for_integer_fields_and_integer_for_boolean(self):
        with TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            base_payload = {
                "version": 1,
                "width": 1100,
                "height": 720,
                "x": 20,
                "y": 30,
                "maximized": False,
            }
            invalid_values = {
                "width": True,
                "height": False,
                "x": True,
                "y": False,
                "maximized": 1,
            }

            for index, (field, value) in enumerate(invalid_values.items()):
                with self.subTest(field=field):
                    payload = {**base_payload, field: value}
                    path = root / f"invalid-{index}.json"
                    path.write_text(json.dumps(payload), encoding="utf-8")
                    self.assertIsNone(load_window_state(path))

    def test_save_rejects_invalid_window_state(self):
        with TemporaryDirectory() as temporary_directory:
            path = Path(temporary_directory) / "window-state.json"

            with self.assertRaises(ValueError):
                save_window_state(WindowState(True, 720, 20, 30), path)

            self.assertFalse(path.exists())

    def test_failed_atomic_replace_preserves_previous_state(self):
        with TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            path = root / "window-state.json"
            original = WindowState(1100, 720, 50, 60)
            replacement = WindowState(1280, 800, 70, 80, maximized=True)
            save_window_state(original, path)

            with patch(
                "campus_net.window_state.os.replace",
                side_effect=OSError("replace failed"),
            ):
                with self.assertRaisesRegex(OSError, "replace failed"):
                    save_window_state(replacement, path)

            self.assertEqual(load_window_state(path), original)
            self.assertEqual(list(root.iterdir()), [path])


class TestClampWindowState(unittest.TestCase):
    def test_preserves_negative_coordinates_on_connected_left_monitor(self):
        state = WindowState(1200, 700, -1800, 120, maximized=True)
        work_areas = [
            ScreenRect(-1920, 0, 0, 1040),
            ScreenRect(0, 0, 1920, 1040),
        ]

        clamped = clamp_window_state(state, work_areas)

        self.assertEqual(clamped, state)

    def test_centers_disconnected_monitor_state_on_primary_work_area(self):
        state = WindowState(1000, 700, 2500, 140)
        primary = ScreenRect(0, 0, 1920, 1040)

        clamped = clamp_window_state(
            state,
            [primary, ScreenRect(-1920, 0, 0, 1040)],
        )

        self.assertEqual(
            clamped,
            WindowState(
                width=1100,
                height=720,
                x=410,
                y=160,
            ),
        )

    def test_resets_too_small_size_to_safe_defaults(self):
        state = WindowState(300, 200, 40, 50, maximized=True)

        clamped = clamp_window_state(
            state,
            [ScreenRect(0, 0, 1920, 1040)],
            min_width=940,
            min_height=620,
            default_width=1000,
            default_height=680,
        )

        self.assertEqual((clamped.width, clamped.height), (940, 620))
        self.assertEqual((clamped.x, clamped.y), (40, 50))
        self.assertTrue(clamped.maximized)

    def test_shrinks_too_large_visible_state_to_its_work_area(self):
        state = WindowState(5000, 4000, 0, 0)
        primary = ScreenRect(0, 0, 1920, 1040)

        clamped = clamp_window_state(
            state,
            [primary],
            default_width=1100,
            default_height=720,
        )

        self.assertEqual((clamped.width, clamped.height), (1920, 1040))
        self.assertGreaterEqual(clamped.x, primary.left)
        self.assertGreaterEqual(clamped.y, primary.top)
        self.assertLessEqual(clamped.x + clamped.width, primary.right)
        self.assertLessEqual(clamped.y + clamped.height, primary.bottom)


if __name__ == "__main__":
    unittest.main()
