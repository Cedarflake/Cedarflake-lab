import datetime
import json
import os
import uuid
from pathlib import Path

from .board import Board


class GameSaver:
    """游戏存档管理器"""

    SAVE_DIR = "saves"

    @classmethod
    def ensure_save_dir(cls):
        """确保存档目录存在"""
        save_dir = Path(cls.SAVE_DIR)
        save_dir.mkdir(parents=True, exist_ok=True)
        return save_dir

    @classmethod
    def save_game(cls, game):
        """保存游戏状态"""
        save_dir = cls.ensure_save_dir()

        # 准备游戏数据
        game_data = {
            "board_size": game.board.size,
            "grid": game.board.grid,
            "current_player": game.current_player,
            "game_over": game.game_over,
            "winner": game.winner,
            "last_move": game.board.last_move,
            "timestamp": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        }

        # 生成保存文件名
        timestamp = datetime.datetime.now().strftime("%Y%m%d%H%M%S%f")
        filepath = save_dir / f"gomoku_save_{timestamp}_{uuid.uuid4().hex[:8]}.json"
        temp_path = save_dir / f".{filepath.name}.{uuid.uuid4().hex}.tmp"

        try:
            with temp_path.open("x", encoding="utf-8") as file:
                json.dump(game_data, file, indent=2)
                file.flush()
                os.fsync(file.fileno())
            os.replace(temp_path, filepath)
        finally:
            temp_path.unlink(missing_ok=True)

        return str(filepath)

    @staticmethod
    def _validate_game_data(game_data):
        if not isinstance(game_data, dict):
            raise ValueError("存档根节点必须是对象")

        board_size = game_data.get("board_size")
        if type(board_size) is not int or board_size < 5:
            raise ValueError("存档中的棋盘大小无效")

        grid = game_data.get("grid")
        if not isinstance(grid, list) or len(grid) != board_size:
            raise ValueError("存档中的棋盘行数无效")
        if any(not isinstance(row, list) or len(row) != board_size for row in grid):
            raise ValueError("存档中的棋盘列数无效")
        if any(
            type(cell) is not int or cell not in (Board.EMPTY, Board.BLACK, Board.WHITE)
            for row in grid
            for cell in row
        ):
            raise ValueError("存档中包含无效棋子")

        current_player = game_data.get("current_player")
        if type(current_player) is not int or current_player not in (Board.BLACK, Board.WHITE):
            raise ValueError("存档中的当前玩家无效")

        game_over = game_data.get("game_over")
        if type(game_over) is not bool:
            raise ValueError("存档中的结束状态无效")

        winner = game_data.get("winner")
        is_stone_winner = type(winner) is int and winner in (Board.BLACK, Board.WHITE)
        if winner is not None and winner != "DRAW" and not is_stone_winner:
            raise ValueError("存档中的胜负状态无效")
        if game_over == (winner is None):
            raise ValueError("存档中的结束状态与胜负状态不一致")

        last_move = game_data.get("last_move")
        if last_move is not None:
            if (
                not isinstance(last_move, (list, tuple))
                or len(last_move) != 2
                or any(type(value) is not int for value in last_move)
            ):
                raise ValueError("存档中的最后一步无效")
            row, col = last_move
            if not (0 <= row < board_size and 0 <= col < board_size):
                raise ValueError("存档中的最后一步越界")
            if grid[row][col] == Board.EMPTY:
                raise ValueError("存档中的最后一步没有棋子")

        return {
            "board_size": board_size,
            "grid": [row.copy() for row in grid],
            "current_player": current_player,
            "game_over": game_over,
            "winner": winner,
            "last_move": tuple(last_move) if last_move is not None else None,
        }

    @classmethod
    def load_game(cls, filepath, game):
        """从保存的文件加载游戏状态"""
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                game_data = json.load(f)
            validated = cls._validate_game_data(game_data)

            # 恢复游戏状态
            game.board.size = validated["board_size"]
            game.board.grid = validated["grid"]
            game.board.last_move = validated["last_move"]
            game.current_player = validated["current_player"]
            game.game_over = validated["game_over"]
            game.winner = validated["winner"]
            return True
        except Exception as e:
            print(f"加载游戏失败: {e}")
            return False

    @classmethod
    def list_saves(cls):
        """列出所有存档"""
        save_dir = cls.ensure_save_dir()

        saves = []
        for filename in os.listdir(save_dir):
            if filename.startswith("gomoku_save_") and filename.endswith(".json"):
                filepath = save_dir / filename
                try:
                    with filepath.open("r", encoding="utf-8") as f:
                        data = json.load(f)
                        saves.append(
                            {
                                "filename": filename,
                                "filepath": str(filepath),
                                "timestamp": data.get("timestamp", "未知时间"),
                                "game_over": data.get("game_over", False),
                                "winner": data.get("winner", None),
                            }
                        )
                except Exception:
                    pass

        # 按时间排序，最新的在前面
        saves.sort(key=lambda x: x["filepath"], reverse=True)
        return saves
