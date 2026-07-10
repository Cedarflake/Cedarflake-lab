import sys

from gomoku.game import GomokuGame
from gomoku.ui import ConsoleUI


def main():
    """主程序入口"""
    game = GomokuGame()
    ui = ConsoleUI(game)

    try:
        ui.play()
    except KeyboardInterrupt:
        print("\n用户中断，游戏已退出。")
    except Exception as e:
        print(f"\n游戏发生错误: {e}")
        print("游戏异常终止。")
        return 1

    print("感谢您的游玩！")
    return 0


if __name__ == "__main__":
    sys.exit(main())
