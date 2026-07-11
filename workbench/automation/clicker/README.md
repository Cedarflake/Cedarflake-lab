# Clicker

鼠标连点器和坐标辅助脚本。

## 脚本

- `clicker_pyautogui.py`: 使用 pyautogui 实现点击。
- `clicker_winapi.py`: Windows API 点击版本。
- `pointer_position.py`: 延迟 3 秒后输出当前鼠标坐标。

## 安全控制

- `Ctrl+Shift+S` 启动或暂停点击，`Esc` 停止程序。
- 点击间隔下限固定为 10 毫秒，拒绝非有限数值和越界配置。
- pyautogui 版本保留屏幕角落保护；Win32 版本将鼠标移至左上角也会自动暂停。
- 退出时会停止后台线程并注销全局热键；Win32 版本即使点击过程异常也会尝试释放左键。

这类脚本会控制鼠标。运行前请确认热键，首次测试时保持鼠标靠近屏幕左上角。
