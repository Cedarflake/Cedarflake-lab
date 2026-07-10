import pyautogui

print("请把鼠标放到目标位置，3秒后显示目标坐标")
pyautogui.sleep(3)
print("鼠标坐标是：", pyautogui.position())
