# Cedarflake ASCII Art

将图片或视频转换为 ASCII 文本、图片和视频，并可在终端播放逐帧 ASCII 文本。

## 环境

本项目使用 `uv` 管理 Python 3.11+ 环境：

```powershell
uv sync
```

需要完整视频转换时，将 `ffmpeg.exe`、`ffplay.exe` 和 `ffprobe.exe` 放入 `ffmpeg/`。这些二进制文件不会进入 Git。

## 配置

默认配置位于 `configs/config.example.yaml`。如需本地覆盖，复制为 `configs/config.yaml`；也可以通过 `CEDARFLAKE_ASCII_ART_CONFIG` 指定配置文件。

```powershell
Copy-Item configs/config.example.yaml configs/config.yaml
```

## 运行

```powershell
uv run python -m cedarflake_ascii_art.main
```

构建 Windows 可执行文件：

```powershell
uv run pyinstaller --clean --noconfirm cedarflake-ascii-art.spec
```

## 测试

```powershell
uv run python -m unittest discover tests
```

## License

GNU General Public License v3.0. See `LICENSE`.
