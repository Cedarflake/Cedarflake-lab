@echo off

:: 创建虚拟环境
python -m venv venv
call venv\Scripts\activate

:: 升级pip
python -m pip install --upgrade pip

:: 安装依赖
pip install -r requirements.txt

:: 检查FFmpeg
if not exist .\ffmpeg\ffmpeg.exe (
    echo FFmpeg 未找到，请将 ffmpeg.exe 放在 .\ffmpeg\ 目录下
    exit /b 1
)

echo 设置完成！
