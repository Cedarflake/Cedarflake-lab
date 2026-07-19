# Campus Net

面向锐捷校园网门户的连接工具，支持旧版 ePortal 和新版 captive SSO。新版适配器完全使用 HTTP 会话复现门户流程，不打开或控制任何浏览器。

新版聚合门户不能从固定的 `/sam-sso/login` 地址直接联网。程序会把探测和认证 socket 绑定到指定 Windows 网络接口，从 captive 劫持响应中提取本次连接完整的 `/eportal/index.jsp?...` 入口，再依次完成 SSO、运营商选择和在线确认。接口索引可以属于 Wi-Fi、有线网卡或其他 IPv4 网络接口，不依赖 WLAN 名称。

系统图形验证码由门户服务端会话校验，客户端既没有答案也没有可替代答案的令牌。因此：

- 当前账号不触发验证码时，流程全自动完成。
- 触发系统图形验证码时，程序用本机原生小窗口显示图片；人工只填写验证码，其余表单和“中国电信”选择仍由程序自动完成。
- 程序不做 OCR、猜测或验证码绕过，也不支持 Geetest、Google reCAPTCHA 和 USTC 指纹风控。
- 只有服务端明确返回“验证码错误”时才允许继续输入；结果不明的登录 POST 永远不会自动重放。

最终成功必须同时满足门户在线状态和绑定接口上的独立 HTTP 在线指纹，不能只相信门户的“认证成功”页面。

新版门户的分析过程、完整请求序列、加密表单、验证码会话和兼容设计见 [新版 captive SSO 适配记录](docs/new-portal-adaptation.md)。

## 图形界面

Windows 用户可以运行基于 `ttkbootstrap` 的本机图形界面：

```powershell
uv sync --group dev
& .\.venv\Scripts\python.exe gui_main.py
```

界面支持编辑正式的 `version=1` 和 `version=2` 配置、刷新并选择 Windows IPv4 接口、显示或隐藏密码、只读探测、连接、取消和查看过程日志。网卡的 PowerShell 枚举状态会显示为“已连接”“未连接”或“正在认证”。新版触发系统图形验证码时，验证码图片和输入框会直接显示在程序窗口中；程序仍然不打开或控制浏览器。旧版协议没有只读探测能力，界面会禁用对应操作。

窗口关闭时会把最后的普通窗口位置、宽高和最大化状态保存到 `%LOCALAPPDATA%\Cedarflake\CampusNet\window-state.json`，下次启动自动恢复。该文件不含账号、密码或门户数据；损坏时会被忽略。若原显示器已断开，窗口会按当前显示器工作区校正，避免恢复到屏幕外。

“连接”和“只读探测”使用当前表单内容，不会自动保存密码。需要持久化时必须显式点击“保存配置”。覆盖已有配置前，界面会先把原文件备份到 Windows“文档”目录下的 `CampusNet Backups`，校验备份与原文件的 SHA-256 一致后才原子替换；备份失败或文件在加载后被其他程序修改时，保存会停止且不会覆盖旧文件。内容没有变化时不会重复覆盖或创建无意义备份，新建文件则没有可备份的旧版本。若替换后的最终落盘校验无法确认，界面会把状态标记为不确定并要求重新加载，而不会声称保存失败即代表旧文件仍未改变。

GUI 只会写入显式带 `version: 1` 或 `version: 2` 的正式格式。无 `version` 的历史配置仍可由 CLI 兼容运行，但界面不会静默改写。若要指定另一个配置文件，可使用：

```powershell
& .\.venv\Scripts\python.exe gui_main.py --config C:\path\to\config.json
```

打包后的控制台程序会依次检查 `CAMPUSNET_CONFIG`、启动时的当前目录、EXE 同目录，以及 EXE 位于项目 `dist` 时的父项目目录。因此从 `C:\Users\你的用户名` 启动项目 `dist` 中的 EXE，也能找到项目根目录的 `config.json`。父目录必须同时含项目的 `pyproject.toml` 和 `config.example.json`，不会仅凭任意同名 `dist` 目录盲目向上查找。可以用以下命令只核对最终路径；它不会读取配置内容或访问网络：

```powershell
.\dist\Auto-Connect-CampusNet.exe --print-config-path
```

## 配置

`config.json` 使用扁平配置：`version: 1` 表示旧版 ePortal，`version: 2` 表示新版 captive SSO。迁移已有本地配置前先备份；该文件已在 `.gitignore` 中，不应提交：

```powershell
$ErrorActionPreference = "Stop"
$backupRoot = Join-Path ([Environment]::GetFolderPath("MyDocuments")) "CampusNet Backups"
New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null
if (Test-Path -LiteralPath config.json) {
  $backupPath = Join-Path $backupRoot "config.$(Get-Date -Format yyyyMMdd-HHmmss).json"
  Copy-Item -LiteralPath config.json -Destination $backupPath -ErrorAction Stop
  if ((Get-FileHash -LiteralPath config.json).Hash -ne (Get-FileHash -LiteralPath $backupPath).Hash) {
    throw "配置备份校验失败，已停止覆盖"
  }
}
if (-not (Test-Path -LiteralPath config.json)) {
  Copy-Item -LiteralPath config.example.json -Destination config.json -ErrorAction Stop
}
```

新版 captive SSO 只需要填写 6 个顶层字段：

```json
{
  "version": 2,
  "interface_index": 24,
  "portal_url": "http://10.71.29.181",
  "username": "你的校园网账号",
  "password": "你的校园网密码",
  "carrier": "中国电信"
}
```

- `version`：新版固定为 `2`；`1` 留给旧版 ePortal。
- `interface_index`：面向校园网的 Windows IPv4 接口索引。可用 `Get-NetIPInterface -AddressFamily IPv4` 查看；Wi-Fi、以太网或其他 IPv4 接口都可以。
- `portal_url`：门户根地址，例如 `http://10.71.29.181`。不要填写 `/sam-sso/login` 等深层地址。
- `username`、`password`：校园网账号和密码。程序直接读取本地配置，不会再次询问密码或读取密码环境变量。
- `carrier`：运营商显示名。程序会从本次会话的服务列表中找到“中国电信”对应的动态值再提交。

程序始终先使用 `interface_index` 指定的 IPv4 接口，不按接口名称或类型猜测校园网，也不会自动改用其他网络接口。校园网可以位于 WLAN、以太网或其他 IPv4 接口；若交互式 CLI 无法确认所选接口的网络状态，会列出当前 Windows IPv4 接口，由用户显式选择一个接口后重新探测。该选择仅用于本次运行，不修改 `config.json`；重定向输入输出、后台任务和 GUI 不会等待终端输入，仍会安全停止。GUI 可在界面中重新选择接口再连接。任何改选都发生在提交账号密码之前。所选接口已经可以访问互联网时，程序会跳过登录，并提醒校园网位于其他接口时需要改选接口。

以下协议参数不再属于用户配置，由代码统一维护：User-Agent、连通性探测指纹、门户入口路径、验证码模式和次数、登录后确认间隔与超时。这样升级门户适配时只改实现，不要求用户同步一组内部常量。

`config.json` 及其备份包含敏感信息，不要提交或分享。系统验证码关闭窗口会立即取消；服务端明确返回验证码错误时，程序会刷新验证码并继续输入，不设置客户端重试次数上限。

先执行只读探测：

```powershell
& .\.venv\Scripts\python.exe main.py --probe-only
```

确认能识别 captive 状态并填写账号、密码后运行：

```powershell
& .\.venv\Scripts\python.exe main.py
```

程序不会修改 Windows 路由、网卡随机 MAC、sing-box 或 v2rayN 配置，也不会保存固定 Cookie、`sessionId` 或 ticket。若系统代理接管所有流量，接口绑定仍会让新版 HTTP socket 直接使用配置的校园网接口。

## 旧版 ePortal

旧版也使用扁平配置，不再手写 Cookie 和 Header：

```json
{
  "version": 1,
  "login_url": "http://你的校园网门户/eportal/InterFace.do?method=login",
  "username": "你的学号",
  "encrypted_password": "你的加密后密码",
  "carrier": "旧门户中的运营商值",
  "user_group": "旧门户中的身份组",
  "session_id": "从旧门户取得的 JSESSIONID"
}
```

`user_group` 和 `session_id` 可省略；`encrypted_password` 必须是旧门户原本使用的加密值，不能换成新版明文密码。`carrier`、`user_group` 按旧门户原值填写，不自动解码或重新编码。可直接复制示例：

```powershell
Copy-Item -LiteralPath config.legacy.example.json -Destination config.json
```

兼容规则：没有 `version` 的配置不会被自动改写；带 `adapter: "captive-sso-http"` 的嵌套新版配置继续可用，带 `adapter: "legacy-eportal"` 或没有 `adapter` 的原始 Cookie 配置继续按旧版加载。新建配置只需用 `version` 选择协议。旧版模式仅适用于 `/eportal/InterFace.do?method=login` 协议，不能用于当前聚合 SSO 门户。

## 开发与构建

本项目使用 `uv` 管理 Python 3.11+ 环境：

```powershell
uv sync --group dev
& .\.venv\Scripts\python.exe -m unittest discover -s tests -p "test_*.py" -v
& .\.venv\Scripts\python.exe -m PyInstaller --clean --noconfirm build.spec
& .\.venv\Scripts\python.exe -m PyInstaller --clean --noconfirm gui.spec
```

控制台版构建后可运行不读取配置、不访问网络的入口冒烟检查：

```powershell
& .\dist\Auto-Connect-CampusNet.exe --help
```

子项目在 `pyproject.toml` 中声明自己的 uv workspace 边界，因此 `uv sync` 不会继续向上扫描仓库根仅用于 Ruff 的 `pyproject.toml`。同步后直接使用该环境的 Python，也不会让后续每条测试或构建命令重新触发项目发现，从而避免与项目构建无关的“缺少 `[project]`”警告。

`build.spec` 继续生成控制台版 `dist\Auto-Connect-CampusNet.exe`，`gui.spec` 生成无控制台窗口版 `dist\Auto-Connect-CampusNet-GUI.exe`。两个 spec 都不会把 `config.json` 打进 EXE，发布物也不应携带用户配置或备份。

构建 GUI 后可运行不读取配置、不访问网络的窗口冒烟检查：

```powershell
$gui = [IO.Path]::GetFullPath(".\dist\Auto-Connect-CampusNet-GUI.exe")
$smokeConfig = Join-Path ([IO.Path]::GetTempPath()) "campus-net-gui-smoke-$PID.json"
$startInfo = [Diagnostics.ProcessStartInfo]::new()
$startInfo.FileName = $gui
$startInfo.Arguments = "--smoke-test --config=`"$smokeConfig`""
$startInfo.UseShellExecute = $false
$startInfo.CreateNoWindow = $true
$process = [Diagnostics.Process]::Start($startInfo)
if (-not $process.WaitForExit(60000)) {
  $process.Kill()
  $process.WaitForExit()
  throw "GUI smoke test timed out"
}
$exitCode = $process.ExitCode
$process.Dispose()
if ($exitCode -ne 0) {
  throw "GUI smoke test failed with exit code $exitCode"
}
if (Test-Path -LiteralPath $smokeConfig) {
  throw "GUI smoke test unexpectedly created $smokeConfig"
}
Start-Sleep -Milliseconds 500
$remaining = @(Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $gui })
if ($remaining.Count -ne 0) {
  throw "GUI smoke test left $($remaining.Count) process(es) running"
}
```

这里使用 `ProcessStartInfo.Arguments`，同时兼容 Windows PowerShell 5.1 和 PowerShell 7；不要改用仅在较新 .NET 中存在的 `ArgumentList` 属性，否则参数可能没有传给程序，冒烟检查会误启动普通 GUI。

`workflows/build.example.yml` 是 monorepo 下的失活构建示例，不会被 GitHub Actions 自动执行。示例会运行测试、构建并冒烟检查两个 EXE、生成 SHA-256 清单，再上传以提交哈希命名的 Actions artifact；启用时应复制为仓库根 `.github/workflows/project-campus-net-ci.yml`。它不会创建标签或 GitHub Release；正式发布需要另行实现符合仓库发布规则的项目级 release 工作流。

## License

MIT License. See `LICENSE`.
