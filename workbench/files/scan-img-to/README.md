# Scan Image To

扫描一个或多个目录中的图片，并复制到一个或多个目标目录。支持多线程复制、忽略规则和日志输出。

## 配置

复制示例配置：

```powershell
Copy-Item config.example.json config.json
```

编辑 `config.json`：

```json
{
  "source_directories": [
    "C:\\Path\\To\\Pictures"
  ],
  "destination_directories": [
    "D:\\Path\\To\\PictureBackup"
  ],
  "ignore_patterns": [
    ".*temp_.*",
    ".*thumbnail_.*"
  ]
}
```

## 运行

```powershell
python scan_img_to.py --config config.json --workers 4
```

可选参数：

- `-c, --config`: 配置文件路径，默认 `config.json`
- `-w, --workers`: 并行线程数，默认 4
- `-l, --log-level`: 日志级别
- `-d, --log-dir`: 日志目录
