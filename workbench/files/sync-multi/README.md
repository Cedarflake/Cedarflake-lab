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

## 同步语义

- `sources` 与 `targets` 数量相同时，按配置顺序一一对应。
- 单个 source 配置多个 target 时，同一份内容会同步到所有 target。
- 多个 source 配置单个 target 时，target 是所有 source 文件和目录的联合视图，包含空目录。
- 同时配置多个 source 和多个 target 时，两者去重后的数量必须一致，避免静默忽略配置项。
- 多个 source 存在同一相对路径时，`sources` 中靠前的目录拥有该路径；拥有者删除文件后，下一顺位的文件会接管。
- target 中既不属于任何 source、也未被 `exclude` 匹配的内容会被删除。
- source 与 target 会先解析为规范绝对路径；二者相同或存在祖先/后代关系时，任务会拒绝启动。
- 指向同一物理目录的 target 路径别名会合并为一个联合目标。
- 配置重载会先验证并启动新任务；配置无效时继续保留当前任务。

真实配置通常包含本机路径，不要提交到 Git。
