# NyaAI

NyaAI 是一个基于 Flask 的 OpenAI-compatible 聊天 API 项目。它默认使用 OpenAI API，也可以通过 `BASE_URL`、`MODEL` 和 `API_KEY_ENV` 切换到 DeepSeek 或其他兼容 OpenAI Chat Completions 的服务。

## 结构

```txt
tools/ai/nya-ai/
  app.py
  nya_chat/
  config.example.json
  pyproject.toml
  requirements.txt
```

## 配置

真实密钥和本地配置不进入 Git。首次运行时复制示例文件：

```powershell
Copy-Item .env.example .env
Copy-Item config.example.json config.json
```

默认使用 OpenAI：

```env
OPENAI_API_KEY="sk-your-api-key"
```

切到 DeepSeek 时，改 `config.json`：

```json
{
  "BASE_URL": "https://api.deepseek.com/v1",
  "MODEL": "deepseek-chat",
  "API_KEY_ENV": "DEEPSEEK_API_KEY"
}
```

常用配置都在 `config.example.json`，包括端口、日志文件、模型、温度、最大 token、重试、系统提示词和默认对话上下文。

## 运行

本机 Python 使用 `uv` 管理：

```powershell
uv sync
uv run python app.py
```

如果只想沿用 `requirements.txt`：

```powershell
uv venv
uv pip install -r requirements.txt
uv run python app.py
```

## 接口

- `GET /health`
- `POST /chat`
- `POST /v1/chat/completions`

`/v1/chat/completions` 接收 OpenAI Chat Completions 形状的非流式请求。
