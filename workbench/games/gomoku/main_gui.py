import sys

from gomoku.game import GomokuGame
from gomoku.gui import GomokuGUI


def main():
    """图形界面版本主程序入口"""
    try:
        game = GomokuGame()
        ui = GomokuGUI(game)
        ui.play()
    except KeyboardInterrupt:
        print("\n用户中断，游戏已退出。")
        return 0
    except Exception as e:
        print(f"\n游戏发生错误: {e}")
        print("游戏异常终止。")
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
