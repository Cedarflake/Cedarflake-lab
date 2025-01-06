# WentUrc ASCII Art Tool

## 简介

WentUrc ASCII Art Tool 是一个支持图片和视频处理，以及播放 `.txt` 文件的字符画工具。它能够将图片和视频转换为 ASCII 字符艺术，并支持播放生成的 ASCII 视频。

## 目录结构

```
ASCII_drawing/
│
├── WentUrc_ASCII_Art_Tool/          # 主包
│   ├── __init__.py
│   ├── main.py                       # 入口点
│   ├── cli.py                        # 命令行接口
│   ├── config.py                     # 配置管理
│   │
│   ├── image_processing/             # 图片处理模块
│   │   ├── __init__.py
│   │   ├── converter_txt.py          # 图片转ASCII.txt
│   │   ├── converter_png.py          # 图片转ASCII.png
│   │   └── utils.py
│   │
│   ├── video_processing/             # 视频处理模块
│   │   ├── __init__.py
│   │   ├── converter_txt.py          # 视频转逐帧ASCII.txt
│   │   ├── converter_video.py        # 视频转完整ASCII视频
│   │   └── utils.py
│   │
│   ├── playback/                     # 播放模块
│   │   ├── __init__.py
│   │   └── player.py                 # 播放ASCII视频
│   │
│   └── utils/                        # 公用工具模块
│       ├── __init__.py
│       └── file_utils.py             # 文件操作工具
│
├── ffmpeg/                           # FFmpeg工具
│   └── ffmpeg.exe
│
├── output/                           # 输出目录
│   ├── image/
│   │   ├── txt/
│   │   └── png/
│   │
│   └── video/
│       └── [video_name]/
│
├── tests/                            # 测试目录
│   ├── __init__.py
│   ├── test_image_processing.py
│   ├── test_video_processing.py
│   └── test_playback.py
│
├── configs/                          # 配置文件
│   └── config.yaml
│
├── scripts/                          # 自动化脚本
│   ├── setup.sh
│   └── setup.bat
│
├── requirements.txt                  # Python依赖
├── README.md                         # 项目说明
├── .gitignore                        # Git忽略文件
└── setup.py                          # 安装脚本（可选）
```

## 安装与配置

### 1. 克隆仓库

```bash
git clone https://github.com/IGCrystal/ASCII_drawing.git
cd ASCII_drawing
```

### 2. 运行自动化脚本

#### Linux/macOS

```bash
bash scripts/setup.sh
```

#### Windows

```batch
scripts\setup.bat
```

### 3. 配置 FFmpeg

- 确保 `ffmpeg/ffmpeg.exe` 存在于项目根目录。
- 如果需要，可以在 `configs/config.yaml` 中指定 FFmpeg 的路径。

### 4. 配置文件

编辑 `configs/config.yaml` 以调整设置。

```yaml
output_directories:
  image_txt: "./output/image/txt"
  image_png: "./output/image/png"
  video: "./output/video"

font_path: "C:\\Windows\\Fonts\\consola.ttf"  # 根据需要调整路径

default_settings:
  ascii_width_txt: 100
  ascii_width_png: 300
  video_fps: 24

log_level: "INFO"
log_format: "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
```

### 5. 运行程序

激活虚拟环境。

#### Linux/macOS

```bash
source venv/bin/activate
```

#### Windows

```batch
venv\Scripts\activate
```

运行程序：

```bash
python main.py
```

或者，如果通过 `setup.py` 安装，可以使用：

```bash
wenturc
```

## 使用方法

1. **图片处理**:
    - **txt 模式**: 将图片转换为 ASCII 字符文件。
    - **图片模式**: 将图片转换为 ASCII 图片（`.png`）。

2. **视频处理**:
    - **txt 模式**: 将视频逐帧转换为 ASCII 字符文件并播放。
    - **video 模式**: 生成完整的 ASCII 视频。

3. **播放 .txt 文件**:
    - 播放存储在指定文件夹中的 `.txt` ASCII 字符文件。

## 测试

运行测试用例：

```bash
python -m unittest discover tests
```

## 贡献

欢迎贡献代码！请提交 Pull Request 或 Issue。

## 许可证

MIT License
```
