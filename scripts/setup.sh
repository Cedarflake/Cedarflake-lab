#!/bin/bash

# 创建虚拟环境
python3 -m venv venv
source venv/bin/activate

# 升级pip
pip install --upgrade pip

# 安装依赖
pip install -r requirements.txt

# 检查FFmpeg
if [ ! -f ./ffmpeg/ffmpeg.exe ]; then
    echo "FFmpeg 未找到，请将 ffmpeg.exe 放在 ./ffmpeg/ 目录下"
    exit 1
fi

echo "设置完成！"
