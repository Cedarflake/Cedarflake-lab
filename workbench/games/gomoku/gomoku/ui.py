from .saver import GameSaver


class ConsoleUI:
    """控制台用户界面"""

    def __init__(self, game):
        """初始化UI"""
        self.game = game
        self.running = True

    def display_board(self):
        """显示棋盘"""
        print(self.game.board)

    def display_status(self):
        """显示当前游戏状态"""
        if self.game.game_over:
            if self.game.winner == "DRAW":
                print("游戏结束，平局！")
            else:
                print(f"游戏结束，{self.game.get_winner_name()}获胜！")
        else:
            print(f"当前玩家: {self.game.get_current_player_name()}")

    def display_help(self):
        """显示帮助信息"""
        print("\n游戏命令:")
        print("  输入坐标 (例如: 7 7) - 在指定位置落子")
        print("  q 或 quit 或 exit - 退出游戏")
        print("  r 或 restart - 重新开始游戏")
        print("  s 或 save - 保存游戏")
        print("  l 或 load - 加载游戏")
        print("  h 或 help - 显示此帮助信息")

    def get_move(self):
        """获取用户输入的移动"""
        while True:
            try:
                move = input("\n请输入落子位置 (行 列) 或命令 [h 查看帮助]: ").strip().lower()

                # 处理特殊命令
                if move in ("q", "quit", "exit"):
                    self.running = False
                    return None, None
                elif move in ("r", "restart"):
                    self.game.reset()
                    print("\n游戏已重新开始！")
                    self.display_board()
                    self.display_status()
                    continue
                elif move in ("h", "help"):
                    self.display_help()
                    continue
                elif move in ("s", "save"):
                    filepath = GameSaver.save_game(self.game)
                    print(f"游戏已保存到: {filepath}")
                    continue
                elif move in ("l", "load"):
                    self.load_game()
                    if self.game.game_over:
                        return None, None
                    continue

                # 处理落子坐标
                row, col = map(int, move.split())
                return row, col
            except ValueError:
                print("输入格式错误，请重新输入（例如: 7 7）")

    def load_game(self):
        """选择并加载已有存档"""
        saves = GameSaver.list_saves()
        if not saves:
            print("没有可用的游戏存档。")
            return False

        print("\n可用存档:")
        for index, save in enumerate(saves, start=1):
            print(f"  {index}. {save['timestamp']} ({save['filename']})")

        selection = input("请输入存档编号，或按 Enter 取消: ").strip()
        if not selection:
            return False

        try:
            index = int(selection) - 1
        except ValueError:
            print("存档编号无效。")
            return False
        if not 0 <= index < len(saves):
            print("存档编号无效。")
            return False

        if not GameSaver.load_game(saves[index]["filepath"], self.game):
            return False

        print("游戏存档已加载。")
        self.display_board()
        self.display_status()
        return True

    def show_message(self, message):
        """显示消息"""

        print(message)

    def play(self):
        """开始游戏循环"""
        print("\n===== 欢迎来到五子棋游戏！=====")
        print("输入格式：行号 列号 (例如: 7 7)")
        print("输入 h 或 help 查看更多命令")

        # 显示初始棋盘
        self.display_board()

        while self.running and not self.game.game_over:
            self.display_status()

            # 获取用户输入
            row, col = self.get_move()
            if not self.running:
                # 用户选择退出
                self.cleanup()
                return
            if self.game.game_over:
                break

            # 尝试落子
            if not self.game.make_move(row, col):
                self.show_message("无效的移动，请重试！")
                continue

            # 更新棋盘显示
            self.display_board()

        # 游戏正常结束，显示最终结果
        if self.running:
            self.display_board()
            self.display_status()
            self.show_message("\n游戏结束！输入任意键退出...")
            input()

        self.cleanup()

    def cleanup(self):
        """清理资源并优雅退出"""
        print("\n感谢您玩五子棋游戏！再见！")
        # 在这里可以添加任何需要的资源清理工作
