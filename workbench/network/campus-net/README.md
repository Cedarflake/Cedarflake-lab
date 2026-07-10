# Campus Net

面向锐捷校园网门户的自动登录脚本，可通过本地配置运行，也可用 PyInstaller 构建为 Windows 可执行文件。

## 配置

真实账号、加密密码和会话 Cookie 不进入 Git。先创建本地配置：

```powershell
Copy-Item config.example.json config.json
```

填写抓包得到的登录地址、账号信息、运营商和身份组。也可以通过 `CAMPUSNET_CONFIG` 指定其他配置文件路径。

## 运行

本项目使用 `uv` 管理 Python 3.11+ 环境：

```powershell
uv sync
uv run python main.py
```

## 构建

```powershell
uv run pyinstaller --clean --noconfirm build.spec
```

`workflows/build.example.yml` 是 monorepo 下的失活示例，不会被 GitHub Actions 自动执行。需要发布时，应将它复制到仓库根 `.github/workflows/` 并复核版本标签与工作目录。

## License

MIT License. See `LICENSE`.
