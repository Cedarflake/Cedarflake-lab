# Sync Multi

监听一个或多个源目录，并将变更同步到目标目录。适合本地素材、视频或项目文件的轻量备份同步。

## 依赖

```powershell
uv venv
uv pip install -r requirements.txt
```

## 配置

```powershell
Copy-Item config.example.json config.json
```

编辑 `config.json` 后运行：

```powershell
python sync_multi.py
```

真实配置通常包含本机路径，不要提交到 Git。
