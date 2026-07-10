from __future__ import annotations

import json
import logging
import os
import sys
from pathlib import Path

DEFAULT_CONFIG: dict[str, object] = {
    "BASE_URL": "https://api.openai.com/v1",
    "MODEL": "gpt-4o-mini",
    "API_KEY": "",
    "API_KEY_ENV": "OPENAI_API_KEY",
    "API_KEY_ENV_FALLBACKS": ["DEEPSEEK_API_KEY"],
    "TEMPERATURE": 0.8,
    "MAX_TOKENS": 1200,
    "TIMEOUT_SECONDS": 60,
    "MAX_RETRIES": 3,
    "RETRY_DELAY": 1,
    "HISTORY_FILE": "conversation_history.json",
    "LOG_FILE": "logs/nya_ai.log",
    "LOG_LEVEL": "INFO",
    "CONSOLE_LOG_LEVEL": "WARNING",
    "HOST": "127.0.0.1",
    "PORT": 7200,
    "DEBUG": False,
    "DEFAULT_RELATIONSHIP_LEVEL": 100,
    "DEFAULT_CONTEXT_INFO": "夕阳下的露台",
    "RELATIONSHIP_LEVELS": [30, 70],
    "RELATIONSHIP_TONES": ["冷淡克制", "轻松调侃", "温柔亲近"],
    "RELATIONSHIP_EMOJIS": ["", "", ""],
    "SYSTEM_PROMPT": "你是 NyaAI，一个可配置的角色聊天助手。保持自然、简洁，并遵循用户给出的上下文。",
}


def load_config(config_path: str = "config.json") -> dict[str, object]:
    config = DEFAULT_CONFIG.copy()
    path = Path(config_path)
    if not path.exists():
        return config

    try:
        loaded = json.loads(path.read_text(encoding="utf-8"))
    except Exception as error:
        logging.getLogger(__name__).warning("加载配置文件失败：%s，将使用默认配置。", error)
        return config

    if not isinstance(loaded, dict):
        logging.getLogger(__name__).warning("配置文件根节点必须是对象，将使用默认配置。")
        return config

    config.update(loaded)
    return config


def get_str(config: dict[str, object], key: str) -> str:
    value = config.get(key, DEFAULT_CONFIG.get(key, ""))
    if isinstance(value, str):
        return value
    return str(value)


def get_int(config: dict[str, object], key: str) -> int:
    value = config.get(key, DEFAULT_CONFIG.get(key, 0))
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    if isinstance(value, str):
        return int(value)
    raise TypeError(f"{key} must be an integer")


def get_float(config: dict[str, object], key: str) -> float:
    value = config.get(key, DEFAULT_CONFIG.get(key, 0.0))
    if isinstance(value, bool):
        return float(value)
    if isinstance(value, int | float):
        return float(value)
    if isinstance(value, str):
        return float(value)
    raise TypeError(f"{key} must be a number")


def get_bool(config: dict[str, object], key: str) -> bool:
    value = config.get(key, DEFAULT_CONFIG.get(key, False))
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "on"}
    if isinstance(value, int | float):
        return bool(value)
    return False


def get_str_list(config: dict[str, object], key: str) -> list[str]:
    value = config.get(key, DEFAULT_CONFIG.get(key, []))
    if isinstance(value, list):
        return [str(item) for item in value]
    if isinstance(value, str):
        return [value]
    return []


def resolve_api_key(config: dict[str, object]) -> str:
    configured_key = get_str(config, "API_KEY").strip()
    if configured_key:
        return configured_key

    env_names = [get_str(config, "API_KEY_ENV"), *get_str_list(config, "API_KEY_ENV_FALLBACKS")]
    for env_name in env_names:
        if not env_name:
            continue
        value = os.getenv(env_name)
        if value:
            return value

    names = ", ".join(name for name in env_names if name)
    raise RuntimeError(
        f"未找到 API key，请在 .env 中设置 {names}，或在 config.json 中设置 API_KEY。"
    )


def setup_logging(config: dict[str, object]) -> logging.Logger:
    try:
        if hasattr(sys.stdout, "reconfigure"):
            sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

    logger = logging.getLogger()
    logger.handlers = []
    logger.setLevel(get_str(config, "LOG_LEVEL").upper())

    formatter = logging.Formatter("【%(asctime)s】%(message)s", datefmt="%Y-%m-%d %H:%M:%S")

    console_handler = logging.StreamHandler()
    console_handler.setLevel(get_str(config, "CONSOLE_LOG_LEVEL").upper())
    console_handler.setFormatter(formatter)
    logger.addHandler(console_handler)

    log_file = Path(get_str(config, "LOG_FILE"))
    log_file.parent.mkdir(parents=True, exist_ok=True)
    file_handler = logging.FileHandler(log_file, encoding="utf-8")
    file_handler.setLevel(get_str(config, "LOG_LEVEL").upper())
    file_handler.setFormatter(formatter)
    logger.addHandler(file_handler)

    return logger
