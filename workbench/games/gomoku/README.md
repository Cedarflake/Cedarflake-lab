# Gomoku

一个简单的五子棋游戏，提供控制台和图形界面两种版本。

## 功能

- 15x15 标准棋盘
- 黑白双方轮流落子
- 自动判断胜负
- 控制台和图形界面两种入口

## 安装

```powershell
uv venv
uv pip install -r requirements.txt
```

## 运行

控制台版本（输入 `h` 可查看落子、保存、加载和重新开始命令）：

```powershell
python main.py
```

图形界面版本：

```powershell
python main_gui.py
```

图形界面中，点击棋盘落子，按 `R` 重新开始，按 `Esc` 退出。
