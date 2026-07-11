import copy
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from gomoku.board import Board
from gomoku.game import GomokuGame
from gomoku.saver import GameSaver
from gomoku.ui import ConsoleUI


class BoardTests(unittest.TestCase):
    def test_rejects_invalid_board_and_move_values(self):
        for size in (0, 4, True, 15.0):
            with self.subTest(size=size), self.assertRaises(ValueError):
                Board(size)

        board = Board()
        for row, col in ((-1, 0), (0, 15), (True, 1), ("1", 1)):
            with self.subTest(row=row, col=col):
                self.assertFalse(board.is_valid_move(row, col))
        for stone in (Board.EMPTY, True, 3, "1"):
            with self.subTest(stone=stone):
                self.assertFalse(board.place_stone(0, 0, stone))

    def test_detects_wins_from_the_latest_move(self):
        for delta_row, delta_col in ((0, 1), (1, 0), (1, 1), (1, -1)):
            with self.subTest(direction=(delta_row, delta_col)):
                board = Board()
                start_col = 6 if delta_col < 0 else 2
                for offset in range(5):
                    self.assertTrue(
                        board.place_stone(
                            2 + offset * delta_row,
                            start_col + offset * delta_col,
                            Board.BLACK,
                        )
                    )
                self.assertEqual(board.check_winner(), Board.BLACK)


class GameSaverTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)
        self.save_dir = Path(self.temp_dir.name) / "nested" / "saves"
        self.save_dir_patch = patch.object(GameSaver, "SAVE_DIR", self.save_dir)
        self.save_dir_patch.start()
        self.addCleanup(self.save_dir_patch.stop)

    def test_round_trip_preserves_last_move_and_creates_unique_files(self):
        game = GomokuGame()
        self.assertTrue(game.make_move(7, 7))
        self.assertTrue(game.make_move(7, 8))

        first_path = Path(GameSaver.save_game(game))
        second_path = Path(GameSaver.save_game(game))
        self.assertNotEqual(first_path, second_path)
        self.assertTrue(first_path.is_file())
        self.assertTrue(second_path.is_file())
        self.assertEqual(list(self.save_dir.glob("*.tmp")), [])

        restored = GomokuGame(9)
        self.assertTrue(GameSaver.load_game(first_path, restored))
        self.assertEqual(restored.board.size, 15)
        self.assertEqual(restored.board.grid, game.board.grid)
        self.assertEqual(restored.board.last_move, (7, 8))
        self.assertEqual(restored.current_player, game.current_player)

    def test_invalid_save_does_not_partially_mutate_the_game(self):
        game = GomokuGame()
        self.assertTrue(game.make_move(3, 3))
        original = {
            "size": game.board.size,
            "grid": copy.deepcopy(game.board.grid),
            "last_move": game.board.last_move,
            "current_player": game.current_player,
            "game_over": game.game_over,
            "winner": game.winner,
        }
        invalid_path = self.save_dir / "invalid.json"
        invalid_path.parent.mkdir(parents=True)
        invalid_path.write_text(
            json.dumps(
                {
                    "board_size": 15,
                    "grid": [[0] * 15 for _ in range(14)],
                    "current_player": 99,
                    "game_over": False,
                    "winner": None,
                }
            ),
            encoding="utf-8",
        )

        with patch("builtins.print"):
            self.assertFalse(GameSaver.load_game(invalid_path, game))
        self.assertEqual(game.board.size, original["size"])
        self.assertEqual(game.board.grid, original["grid"])
        self.assertEqual(game.board.last_move, original["last_move"])
        self.assertEqual(game.current_player, original["current_player"])
        self.assertEqual(game.game_over, original["game_over"])
        self.assertEqual(game.winner, original["winner"])

    def test_legacy_save_without_last_move_remains_loadable(self):
        legacy_path = self.save_dir / "legacy.json"
        legacy_path.parent.mkdir(parents=True)
        grid = [[0] * 15 for _ in range(15)]
        grid[4][5] = Board.BLACK
        legacy_path.write_text(
            json.dumps(
                {
                    "board_size": 15,
                    "grid": grid,
                    "current_player": Board.WHITE,
                    "game_over": False,
                    "winner": None,
                }
            ),
            encoding="utf-8",
        )

        game = GomokuGame()
        self.assertTrue(GameSaver.load_game(legacy_path, game))
        self.assertEqual(game.board.grid, grid)
        self.assertIsNone(game.board.last_move)

    def test_rejects_non_integer_winner_values(self):
        invalid_path = self.save_dir / "invalid-winner.json"
        invalid_path.parent.mkdir(parents=True)
        invalid_path.write_text(
            json.dumps(
                {
                    "board_size": 15,
                    "grid": [[0] * 15 for _ in range(15)],
                    "current_player": Board.BLACK,
                    "game_over": True,
                    "winner": 1.0,
                }
            ),
            encoding="utf-8",
        )

        with patch("builtins.print"):
            self.assertFalse(GameSaver.load_game(invalid_path, GomokuGame()))


class ConsoleUITests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)
        self.save_dir_patch = patch.object(GameSaver, "SAVE_DIR", Path(self.temp_dir.name))
        self.save_dir_patch.start()
        self.addCleanup(self.save_dir_patch.stop)

    def test_save_and_load_commands_are_reachable(self):
        source = GomokuGame()
        source.make_move(2, 3)
        GameSaver.save_game(source)

        target = GomokuGame()
        ui = ConsoleUI(target)
        with patch("builtins.input", side_effect=["l", "1", "q"]), patch("builtins.print"):
            self.assertEqual(ui.get_move(), (None, None))

        self.assertFalse(ui.running)
        self.assertEqual(target.board.grid, source.board.grid)
        self.assertEqual(target.board.last_move, source.board.last_move)

    def test_loading_finished_game_does_not_attempt_another_move(self):
        source = GomokuGame()
        for col in range(4):
            source.make_move(0, col)
            source.make_move(1, col)
        source.make_move(0, 4)
        self.assertTrue(source.game_over)
        GameSaver.save_game(source)

        target = GomokuGame()
        ui = ConsoleUI(target)
        with (
            patch("builtins.input", side_effect=["l", "1", ""]),
            patch("builtins.print"),
            patch.object(target, "make_move", wraps=target.make_move) as make_move,
        ):
            ui.play()

        make_move.assert_not_called()
        self.assertTrue(target.game_over)
        self.assertEqual(target.winner, Board.BLACK)


if __name__ == "__main__":
    unittest.main()
