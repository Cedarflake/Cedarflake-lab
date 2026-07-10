import sys

import pygame

from .board import Board


class GomokuGUI:
    """使用Pygame实现的五子棋图形界面"""

    # 颜色定义
    BACKGROUND = (220, 179, 92)  # 棋盘背景色（木色）
    BLACK = (0, 0, 0)
    WHITE = (255, 255, 255)
    RED = (255, 0, 0)
    LINE = (0, 0, 0)
    TEXT = (0, 0, 0)

    def __init__(self, game, window_size=750):
        """初始化图形界面"""
        self.game = game
        self.window_size = window_size
        self.cell_size = window_size // (game.board.size + 1)
        self.board_padding = self.cell_size
        self.exit_requested = False
        self.exit_timer = None
        self.exit_confirmation = False

        # 初始化Pygame
        pygame.init()
        self.window = pygame.display.set_mode((window_size, window_size))
        pygame.display.set_caption("五子棋")
        self.font = pygame.font.SysFont("SimHei", 24)
        self.font_large = pygame.font.SysFont("SimHei", 36)
        self.clock = pygame.time.Clock()

    def get_grid_pos(self, mouse_x, mouse_y):
        """将鼠标坐标转换为棋盘格子坐标"""
        if mouse_x < self.board_padding or mouse_y < self.board_padding:
            return None

        row = round((mouse_y - self.board_padding) / self.cell_size)
        col = round((mouse_x - self.board_padding) / self.cell_size)

        if 0 <= row < self.game.board.size and 0 <= col < self.game.board.size:
            return row, col
        return None

    def draw_board(self):
        """绘制棋盘"""
        self.window.fill(self.BACKGROUND)

        # 绘制网格线
        for i in range(self.game.board.size):
            # 横线
            pygame.draw.line(
                self.window,
                self.LINE,
                (self.board_padding, self.board_padding + i * self.cell_size),
                (self.window_size - self.board_padding, self.board_padding + i * self.cell_size),
                2,
            )
            # 竖线
            pygame.draw.line(
                self.window,
                self.LINE,
                (self.board_padding + i * self.cell_size, self.board_padding),
                (self.board_padding + i * self.cell_size, self.window_size - self.board_padding),
                2,
            )

        # 绘制棋子
        for row in range(self.game.board.size):
            for col in range(self.game.board.size):
                stone = self.game.board.grid[row][col]
                if stone != Board.EMPTY:
                    center_x = self.board_padding + col * self.cell_size
                    center_y = self.board_padding + row * self.cell_size
                    color = self.BLACK if stone == Board.BLACK else self.WHITE

                    # 绘制棋子（圆形）
                    pygame.draw.circle(
                        self.window, color, (center_x, center_y), self.cell_size // 2 - 2
                    )

                    # 给白棋绘制黑色边框
                    if stone == Board.WHITE:
                        pygame.draw.circle(
                            self.window,
                            self.BLACK,
                            (center_x, center_y),
                            self.cell_size // 2 - 2,
                            2,
                        )

        # 标记最后一手棋的位置
        if self.game.board.last_move:
            row, col = self.game.board.last_move
            center_x = self.board_padding + col * self.cell_size
            center_y = self.board_padding + row * self.cell_size
            pygame.draw.rect(self.window, self.RED, (center_x - 5, center_y - 5, 10, 10), 2)

    def draw_status(self):
        """绘制状态信息"""
        if self.game.game_over:
            if self.game.winner == "DRAW":
                status_text = "游戏结束，平局！"
            else:
                status_text = f"游戏结束，{self.game.get_winner_name()}获胜！"
        else:
            status_text = f"当前玩家: {self.game.get_current_player_name()}"

        text = self.font.render(status_text, True, self.TEXT)
        self.window.blit(text, (20, 20))

    def draw_instructions(self):
        """绘制游戏说明"""
        instructions = ["按R键重新开始游戏", "按ESC键退出游戏"]

        for i, instruction in enumerate(instructions):
            text = self.font.render(instruction, True, self.TEXT)
            self.window.blit(text, (self.window_size - 200, 20 + i * 30))

    def draw_exit_dialog(self):
        """绘制退出确认对话框"""
        if not self.exit_requested:
            return

        # 绘制半透明背景
        overlay = pygame.Surface((self.window_size, self.window_size), pygame.SRCALPHA)
        overlay.fill((0, 0, 0, 128))  # 黑色半透明
        self.window.blit(overlay, (0, 0))

        # 绘制对话框
        dialog_width, dialog_height = 400, 200
        dialog_x = (self.window_size - dialog_width) // 2
        dialog_y = (self.window_size - dialog_height) // 2

        pygame.draw.rect(
            self.window, (245, 245, 245), (dialog_x, dialog_y, dialog_width, dialog_height)
        )
        pygame.draw.rect(
            self.window, (50, 50, 50), (dialog_x, dialog_y, dialog_width, dialog_height), 2
        )

        # 对话框标题
        title_text = self.font_large.render("确认退出", True, (50, 50, 50))
        self.window.blit(
            title_text, (dialog_x + (dialog_width - title_text.get_width()) // 2, dialog_y + 30)
        )

        # 对话框内容
        msg_text = self.font.render("您确定要退出游戏吗？", True, (50, 50, 50))
        self.window.blit(
            msg_text, (dialog_x + (dialog_width - msg_text.get_width()) // 2, dialog_y + 80)
        )

        # 按钮：确认和取消
        btn_width, btn_height = 120, 40

        # 确认按钮
        yes_btn_x = dialog_x + dialog_width // 4 - btn_width // 2
        yes_btn_y = dialog_y + 130

        pygame.draw.rect(self.window, (50, 120, 220), (yes_btn_x, yes_btn_y, btn_width, btn_height))
        yes_text = self.font.render("确认 (Y)", True, (255, 255, 255))
        self.window.blit(
            yes_text,
            (
                yes_btn_x + (btn_width - yes_text.get_width()) // 2,
                yes_btn_y + (btn_height - yes_text.get_height()) // 2,
            ),
        )

        # 取消按钮
        no_btn_x = dialog_x + dialog_width * 3 // 4 - btn_width // 2
        no_btn_y = dialog_y + 130

        pygame.draw.rect(self.window, (150, 150, 150), (no_btn_x, no_btn_y, btn_width, btn_height))
        no_text = self.font.render("取消 (N)", True, (255, 255, 255))
        self.window.blit(
            no_text,
            (
                no_btn_x + (btn_width - no_text.get_width()) // 2,
                no_btn_y + (btn_height - no_text.get_height()) // 2,
            ),
        )

    def handle_exit_dialog_events(self, event):
        """处理退出对话框事件"""
        if event.type == pygame.KEYDOWN:
            if event.key == pygame.K_y:  # 确认退出
                self.exit_confirmation = True
                return True
            elif event.key == pygame.K_n or event.key == pygame.K_ESCAPE:  # 取消退出
                self.exit_requested = False
                return True
        elif event.type == pygame.MOUSEBUTTONDOWN:
            x, y = event.pos

            # 对话框尺寸和位置
            dialog_width, dialog_height = 400, 200
            dialog_x = (self.window_size - dialog_width) // 2
            dialog_y = (self.window_size - dialog_height) // 2
            btn_width, btn_height = 120, 40

            # 确认按钮区域
            yes_btn_x = dialog_x + dialog_width // 4 - btn_width // 2
            yes_btn_y = dialog_y + 130

            # 取消按钮区域
            no_btn_x = dialog_x + dialog_width * 3 // 4 - btn_width // 2
            no_btn_y = dialog_y + 130

            # 检查点击是否在按钮区域内
            if yes_btn_x <= x <= yes_btn_x + btn_width and yes_btn_y <= y <= yes_btn_y + btn_height:
                self.exit_confirmation = True
                return True
            elif no_btn_x <= x <= no_btn_x + btn_width and no_btn_y <= y <= no_btn_y + btn_height:
                self.exit_requested = False
                return True

        return False

    def cleanup(self):
        """清理资源并退出"""
        print("正在关闭游戏...")
        pygame.quit()
        sys.exit()

    def play(self):
        """开始游戏循环"""
        running = True

        try:
            while running:
                # 处理事件
                for event in pygame.event.get():
                    if self.exit_requested:
                        # 如果退出对话框已显示，则处理对话框事件
                        if self.handle_exit_dialog_events(event):
                            if self.exit_confirmation:
                                running = False
                            continue

                    if event.type == pygame.QUIT:
                        self.exit_requested = True

                    elif event.type == pygame.KEYDOWN:
                        if event.key == pygame.K_ESCAPE:
                            self.exit_requested = True
                        elif event.key == pygame.K_r and not self.exit_requested:
                            self.game.reset()

                    elif (
                        event.type == pygame.MOUSEBUTTONDOWN
                        and not self.exit_requested
                        and not self.game.game_over
                    ):
                        pos = self.get_grid_pos(*event.pos)
                        if pos:
                            self.game.make_move(*pos)

                # 绘制游戏界面
                self.draw_board()
                self.draw_status()
                self.draw_instructions()

                # 如果需要，显示退出对话框
                if self.exit_requested:
                    self.draw_exit_dialog()

                pygame.display.update()
                self.clock.tick(30)

            # 执行清理操作
            self.cleanup()

        except Exception as e:
            print(f"发生错误: {e}")
            self.cleanup()
        except KeyboardInterrupt:
            print("\n用户中断，正在退出...")
            self.cleanup()
