import datetime
import json
import os


class GameSaver:
    """游戏存档管理器"""

    SAVE_DIR = "saves"

    @classmethod
    def ensure_save_dir(cls):
        """确保存档目录存在"""
        if not os.path.exists(cls.SAVE_DIR):
            os.makedirs(cls.SAVE_DIR)

    @classmethod
    def save_game(cls, game):
        """保存游戏状态"""
        cls.ensure_save_dir()

        # 准备游戏数据
        game_data = {
            "board_size": game.board.size,
            "grid": game.board.grid,
            "current_player": game.current_player,
            "game_over": game.game_over,
            "winner": game.winner,
            "timestamp": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        }

        # 生成保存文件名
        timestamp = datetime.datetime.now().strftime("%Y%m%d%H%M%S")
        filename = f"gomoku_save_{timestamp}.json"
        filepath = os.path.join(cls.SAVE_DIR, filename)

        # 写入文件
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(game_data, f, indent=2)

        return filepath

    @classmethod
    def load_game(cls, filepath, game):
        """从保存的文件加载游戏状态"""
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                game_data = json.load(f)

            # 恢复游戏状态
            if game_data["board_size"] != game.board.size:
                game.board.size = game_data["board_size"]

            game.board.grid = game_data["grid"]
            game.current_player = game_data["current_player"]
            game.game_over = game_data["game_over"]
            game.winner = game_data["winner"]

            # 找出最后一步棋的位置
            last_move = None
            for i in range(game.board.size):
                for j in range(game.board.size):
                    if game.board.grid[i][j] != 0:
                        last_move = (i, j)

            game.board.last_move = last_move
            return True
        except Exception as e:
            print(f"加载游戏失败: {e}")
            return False

    @classmethod
    def list_saves(cls):
        """列出所有存档"""
        cls.ensure_save_dir()

        saves = []
        for filename in os.listdir(cls.SAVE_DIR):
            if filename.startswith("gomoku_save_") and filename.endswith(".json"):
                filepath = os.path.join(cls.SAVE_DIR, filename)
                try:
                    with open(filepath, "r", encoding="utf-8") as f:
                        data = json.load(f)
                        saves.append(
                            {
                                "filename": filename,
                                "filepath": filepath,
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
