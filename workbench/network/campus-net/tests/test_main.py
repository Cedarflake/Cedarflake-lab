import unittest
from unittest.mock import AsyncMock, Mock, patch

import main
from campus_net.interfaces import NetworkInterface


class _TerminalStream:
    def __init__(self, is_terminal: bool, *, raises: bool = False) -> None:
        self.is_terminal = is_terminal
        self.raises = raises

    def isatty(self) -> bool:
        if self.raises:
            raise OSError("stream unavailable")
        return self.is_terminal


class TestInteractiveTerminal(unittest.TestCase):
    def test_requires_both_input_and_output_terminals(self):
        for stdin_terminal, stdout_terminal, expected in (
            (True, True, True),
            (False, True, False),
            (True, False, False),
        ):
            with (
                self.subTest(
                    stdin_terminal=stdin_terminal,
                    stdout_terminal=stdout_terminal,
                ),
                patch.object(main.sys, "stdin", _TerminalStream(stdin_terminal)),
                patch.object(main.sys, "stdout", _TerminalStream(stdout_terminal)),
            ):
                self.assertIs(main.is_interactive_terminal(), expected)

    def test_handles_missing_or_unavailable_streams(self):
        with patch.object(main.sys, "stdin", None):
            self.assertFalse(main.is_interactive_terminal())
        with (
            patch.object(main.sys, "stdin", _TerminalStream(True, raises=True)),
            patch.object(main.sys, "stdout", _TerminalStream(True)),
        ):
            self.assertFalse(main.is_interactive_terminal())


class TestInterfaceSelectionPrompt(unittest.TestCase):
    def test_lists_generic_interfaces_and_accepts_explicit_selection(self):
        interfaces = [
            NetworkInterface(31, "WLAN", "Connected", 25),
            NetworkInterface(8, "以太网", "Connected", 35),
            NetworkInterface(44, "USB 网络共享", "Disconnected", 5),
        ]
        answers = iter(("not-a-number", "9", "2"))
        output: list[str] = []

        selected_index = main.prompt_interface_selection(
            24,
            interface_loader=lambda: interfaces,
            input_reader=lambda _prompt: next(answers),
            output_writer=output.append,
        )

        self.assertEqual(selected_index, 8)
        self.assertIn("31 · WLAN · 已连接", "\n".join(output))
        self.assertIn("8 · 以太网 · 已连接", "\n".join(output))
        self.assertIn("44 · USB 网络共享 · 未连接", "\n".join(output))
        self.assertEqual(sum("请输入 1 到 3" in line for line in output), 2)

    def test_marks_current_interface_but_never_auto_selects_it(self):
        output: list[str] = []

        selected_index = main.prompt_interface_selection(
            24,
            interface_loader=lambda: [
                NetworkInterface(24, "WLAN", "Connected", 25),
            ],
            input_reader=lambda _prompt: "",
            output_writer=output.append,
        )

        self.assertIsNone(selected_index)
        self.assertIn("（当前配置）", "\n".join(output))

    def test_eof_and_keyboard_interrupt_cancel_cleanly(self):
        interfaces = [NetworkInterface(31, "WLAN", "Connected", 25)]
        for error in (EOFError(), KeyboardInterrupt()):
            with self.subTest(error_type=type(error).__name__):
                output: list[str] = []

                def raise_input(_prompt: str) -> str:
                    raise error

                selected_index = main.prompt_interface_selection(
                    24,
                    interface_loader=lambda: interfaces,
                    input_reader=raise_input,
                    output_writer=output.append,
                )

                self.assertIsNone(selected_index)
                self.assertEqual(output[-1], "接口选择已取消。")

    def test_enumeration_failure_preserves_safe_exit(self):
        output: list[str] = []

        def fail_loader() -> list[NetworkInterface]:
            raise OSError("PowerShell unavailable")

        selected_index = main.prompt_interface_selection(
            24,
            interface_loader=fail_loader,
            input_reader=Mock(side_effect=AssertionError("must not prompt")),
            output_writer=output.append,
        )

        self.assertIsNone(selected_index)
        self.assertEqual(
            output,
            ["无法读取 Windows IPv4 接口列表：PowerShell unavailable"],
        )


class TestAsyncMain(unittest.IsolatedAsyncioTestCase):
    @patch("main.execute_config", new_callable=AsyncMock)
    @patch("main.load_config")
    @patch("main.is_interactive_terminal")
    async def test_enables_selector_only_for_interactive_terminal(
        self,
        is_interactive_terminal,
        load_config,
        execute_config,
    ):
        config = {"version": 2}
        load_config.return_value = config
        execute_config.return_value = 2

        for is_interactive, expected_selector in (
            (True, main.prompt_interface_selection),
            (False, None),
        ):
            with self.subTest(is_interactive=is_interactive):
                is_interactive_terminal.return_value = is_interactive
                execute_config.reset_mock()

                exit_code = await main.async_main(probe_only=True)

                self.assertEqual(exit_code, 2)
                execute_config.assert_awaited_once_with(
                    config,
                    probe_only=True,
                    interface_selector=expected_selector,
                )


if __name__ == "__main__":
    unittest.main()
