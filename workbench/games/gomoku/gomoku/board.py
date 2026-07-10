class Board:
    """棋盘类，管理15x15的五子棋棋盘状态"""

    EMPTY = 0
    BLACK = 1
    WHITE = 2

    def __init__(self, size=15):
        """初始化棋盘"""
        self.size = size
        self.reset()

    def reset(self):
        """重置棋盘状态"""
        self.grid = [[self.EMPTY for _ in range(self.size)] for _ in range(self.size)]
        self.last_move = None

    def is_valid_move(self, row, col):
        """检查移动是否有效"""
        return 0 <= row < self.size and 0 <= col < self.size and self.grid[row][col] == self.EMPTY

    def place_stone(self, row, col, stone):
        """在指定位置放置棋子"""
        if not self.is_valid_move(row, col):
            return False
        self.grid[row][col] = stone
        self.last_move = (row, col)
        return True

    def check_winner(self):
        """检查是否有赢家"""
        if self.last_move is None:
            return None

        row, col = self.last_move
        stone = self.grid[row][col]

        # 检查所有方向
        directions = [
            [(0, 1), (0, -1)],  # 水平
            [(1, 0), (-1, 0)],  # 垂直
            [(1, 1), (-1, -1)],  # 正对角线
            [(1, -1), (-1, 1)],  # 反对角线
        ]

        for dir_pair in directions:
            count = 1  # 当前位置的棋子

            # 检查两个相反方向
            for dx, dy in dir_pair:
                r, c = row, col
                while True:
                    r, c = r + dx, c + dy
                    if not (0 <= r < self.size and 0 <= c < self.size) or self.grid[r][c] != stone:
                        break
                    count += 1

            if count >= 5:  # 如果连续5个或更多相同棋子
                return stone

        # 检查平局
        if all(self.grid[r][c] != self.EMPTY for r in range(self.size) for c in range(self.size)):
            return "DRAW"

        return None

    def __str__(self):
        """返回棋盘的字符串表示"""
        symbols = {self.EMPTY: ".", self.BLACK: "X", self.WHITE: "O"}
        result = "  " + " ".join(str(i) for i in range(self.size)) + "\n"
        for i, row in enumerate(self.grid):
            result += f"{i} " + " ".join(symbols[cell] for cell in row) + "\n"
        return result
