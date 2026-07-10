# Auto Crawler

图片网站发现和批量下载实验工具。

## 依赖

```powershell
uv venv
uv pip install -r requirements.txt
```

## 配置

```powershell
Copy-Item config/config.example.yaml config/config.yaml
```

编辑 `config/config.yaml` 后运行：

```powershell
python main.py
```

下载目录、日志、数据库和真实配置都不提交到 Git。
