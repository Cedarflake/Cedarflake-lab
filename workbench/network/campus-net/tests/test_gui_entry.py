import unittest
from contextlib import ExitStack
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

import gui_main
import ttkbootstrap as ttk
from campus_net.gui import (
    CARRIERS,
    COMBOBOX_WHEEL_GUARD_TAG,
    CampusNetApp,
    app_icon_path,
    launch_gui,
)
from ttkbootstrap import Style
from ttkbootstrap.widgets.scrolled import ScrolledFrame


class TestGuiEntry(unittest.TestCase):
    def tearDown(self):
        Style.instance = None

    def test_main_forwards_explicit_config_and_smoke_test(self):
        with TemporaryDirectory() as temporary_directory:
            config_path = Path(temporary_directory) / "never-created.json"

            with patch("gui_main.launch_gui") as mocked_launch:
                exit_code = gui_main.main(
                    [
                        "--smoke-test",
                        "--config",
                        str(config_path),
                    ]
                )

            self.assertEqual(exit_code, 0)
            mocked_launch.assert_called_once_with(
                config_path=config_path,
                smoke_test=True,
            )
            self.assertFalse(config_path.exists())

    def test_smoke_test_with_explicit_config_has_no_external_side_effects(self):
        forbidden_targets = (
            "campus_net.gui.load_editable_config",
            "campus_net.gui.save_editable_config",
            "campus_net.gui.resolve_config_path",
            "campus_net.gui.list_windows_ipv4_interfaces",
            "campus_net.gui.load_window_state",
            "campus_net.gui.save_window_state",
            "campus_net.gui.OperationController.start",
        )
        with TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            config_path = root / "never-created.json"
            backup_directory = root / "backups"
            window_state_path = root / "window-state.json"
            forbidden_mocks = []

            with ExitStack() as stack:
                for target in forbidden_targets:
                    forbidden_mocks.append(
                        stack.enter_context(
                            patch(
                                target,
                                side_effect=AssertionError(f"smoke test must not call {target}"),
                            )
                        )
                    )
                stack.enter_context(
                    patch(
                        "campus_net.gui.default_backup_directory",
                        return_value=backup_directory,
                    )
                )
                stack.enter_context(
                    patch(
                        "campus_net.gui.default_window_state_path",
                        return_value=window_state_path,
                    )
                )

                launch_gui(config_path=config_path, smoke_test=True)

            for forbidden_mock in forbidden_mocks:
                forbidden_mock.assert_not_called()
            self.assertFalse(config_path.exists())
            self.assertEqual(list(root.iterdir()), [])

    def test_layout_scrolls_and_aligns_square_secret_toggle(self):
        with TemporaryDirectory() as temporary_directory:
            config_path = Path(temporary_directory) / "never-created.json"
            root = ttk.Window(themename="darkly")
            root.withdraw()
            app = None
            try:
                app = CampusNetApp(
                    root,
                    config_path=config_path,
                    initialize_runtime=False,
                )
                root.update_idletasks()

                self.assertIsInstance(app.form_stack, ScrolledFrame)
                self.assertEqual(app.form_stack.vscroll.winfo_manager(), "pack")
                self.assertTrue(app_icon_path().is_file())
                self.assertIsNotNone(app._header_logo_photo)

                toggle_borders = [
                    widget
                    for widget in app.v2_frame.winfo_children()
                    for widget in widget.winfo_children()
                    if widget.winfo_class() == "TFrame"
                    and widget.cget("style") == "ToggleBorder.TFrame"
                ]
                self.assertEqual(len(toggle_borders), 1)
                toggle_border = toggle_borders[0]
                toggle_control = toggle_border.winfo_children()[0]
                toggle = toggle_control.winfo_children()[0]
                self.assertEqual(toggle.cget("style"), "primary.Square.Toggle")
                self.assertEqual(tuple(app.v2_carrier_combo.cget("values")), CARRIERS)
                self.assertEqual(str(app.v2_carrier_combo.cget("state")), "readonly")
                self.assertEqual(app.v2_vars["carrier"].get(), "中国电信")
                for combobox in (app.interface_combo, app.v2_carrier_combo):
                    bindtags = combobox.bindtags()
                    self.assertLess(
                        bindtags.index(COMBOBOX_WHEEL_GUARD_TAG),
                        bindtags.index("TCombobox"),
                    )
                app.form_stack._add_scroll_binding(app.form_stack)
                app.v2_carrier_combo.event_generate("<MouseWheel>", delta=-120)
                root.update()
                self.assertEqual(app.v2_vars["carrier"].get(), "中国电信")
                self.assertLessEqual(
                    abs(toggle_border.winfo_reqheight() - app.v2_carrier_combo.winfo_reqheight()),
                    2,
                )
                v1_entries = [
                    widget
                    for field in app.v1_frame.winfo_children()
                    for widget in field.winfo_children()
                    if widget.winfo_class() == "TEntry"
                ]
                self.assertEqual(len(v1_entries), 6)

                app._set_status("操作完成。", "success")
                self.assertEqual(app.status_icon_var.get(), "✓")
                self.assertEqual(app.header_status_var.get(), "操作完成。")

                app.theme_display_var.set("浅色")
                app._change_theme()
                self.assertEqual(
                    root.style.lookup("Success.Interface.TLabel", "foreground"),
                    "#0f766e",
                )
            finally:
                if app is None:
                    root.destroy()
                else:
                    root.update_idletasks()
                    root.update()
                    app._destroy_root()


if __name__ == "__main__":
    unittest.main()
