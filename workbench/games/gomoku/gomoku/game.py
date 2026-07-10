from .board import Board


class GomokuGame:
    """五子棋游戏逻辑类"""

    def __init__(self, size=15):
        """初始化游戏"""
        self.board = Board(size)
        self.current_player = Board.BLACK
        self.game_over = False
        self.winner = None

    def reset(self):
        """重置游戏"""
        self.board.reset()
        self.current_player = Board.BLACK
        self.game_over = False
        self.winner = None

    def make_move(self, row, col):
        """执行一步棋"""
        if self.game_over:
            return False

        if not self.board.place_stone(row, col, self.current_player):
            return False

        # 检查胜负
        winner = self.board.check_winner()
        if winner:
            self.game_over = True
            self.winner = winner
        else:
            # 切换玩家
            self.current_player = Board.WHITE if self.current_player == Board.BLACK else Board.BLACK

        return True

    def get_current_player_name(self):
        """获取当前玩家名称"""
        return "黑棋" if self.current_player == Board.BLACK else "白棋"

    def get_winner_name(self):
        """获取赢家名称"""
        if not self.game_over:
            return None
        if self.winner == "DRAW":
            return "平局"
        return "黑棋" if self.winner == Board.BLACK else "白棋"
