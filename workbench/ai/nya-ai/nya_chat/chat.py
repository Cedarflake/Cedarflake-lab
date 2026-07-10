from __future__ import annotations

import bisect
import json
import logging
import time
from collections.abc import Generator
from functools import lru_cache
from pathlib import Path

from openai import APIError, OpenAI

from .utils import get_float, get_int, get_str, get_str_list

logger = logging.getLogger(__name__)


class OpenAICompatibleChat:
    def __init__(
        self,
        api_key: str,
        config: dict[str, object],
        history_file: str | None = None,
    ) -> None:
        self.config = config
        self.model = get_str(config, "MODEL")
        self.base_url = get_str(config, "BASE_URL")
        self.temperature = get_float(config, "TEMPERATURE")
        self.max_tokens = get_int(config, "MAX_TOKENS")
        self.max_retries = get_int(config, "MAX_RETRIES")
        self.retry_delay = get_float(config, "RETRY_DELAY")
        self.history_file = Path(history_file or get_str(config, "HISTORY_FILE"))
        self.system_prompt = get_str(config, "SYSTEM_PROMPT")
        self.relationship_levels = self._get_relationship_levels()
        self.relationship_tones = get_str_list(config, "RELATIONSHIP_TONES")
        self.relationship_emojis = get_str_list(config, "RELATIONSHIP_EMOJIS")
        self.client = OpenAI(
            api_key=api_key,
            base_url=self.base_url,
            timeout=get_float(config, "TIMEOUT_SECONDS"),
        )
        self.conversation_history = self.load_history()
        if not self.conversation_history:
            self.conversation_history = [{"role": "system", "content": self.system_prompt}]
            self.save_history()

    def _get_relationship_levels(self) -> list[int]:
        values = self.config.get("RELATIONSHIP_LEVELS", [30, 70])
        if not isinstance(values, list):
            return [30, 70]
        return [int(value) for value in values]

    def load_history(self) -> list[dict[str, object]]:
        if not self.history_file.exists():
            return []

        try:
            history = json.loads(self.history_file.read_text(encoding="utf-8"))
        except Exception as error:
            logger.warning("加载历史记录失败：%s", error)
            return []

        if isinstance(history, list):
            return [item for item in history if isinstance(item, dict)]
        return []

    def save_history(self) -> None:
        try:
            self.history_file.write_text(
                json.dumps(self.conversation_history, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
        except Exception as error:
            logger.exception("保存历史记录失败：%s", error)

    def clear_history(self) -> None:
        self.conversation_history = [{"role": "system", "content": self.system_prompt}]
        self.save_history()
        logger.info("历史记录已清空。")

    def get_relationship_tone_and_emoji(self, relationship_level: int) -> tuple[str, str]:
        if not 0 <= relationship_level <= 100:
            raise ValueError("relationship must be between 0 and 100")

        index = bisect.bisect_right(self.relationship_levels, relationship_level)
        tone = self.relationship_tones[index] if index < len(self.relationship_tones) else ""
        emoji = self.relationship_emojis[index] if index < len(self.relationship_emojis) else ""
        return tone, emoji

    def generate_prompt(self, message: str, relationship_level: int, context_info: str = "") -> str:
        if not message.strip():
            raise ValueError("input cannot be empty")

        tone, emoji = self.get_relationship_tone_and_emoji(relationship_level)
        prompt = f"用户输入：{message}\n请以{tone}的语气回复。"
        if emoji:
            prompt += f" 可以自然加入这个表达倾向：{emoji}。"
        if context_info:
            prompt += f"\n额外背景信息：{context_info}"
        return prompt

    def add_message(self, role: str, message: str) -> None:
        self.conversation_history.append({"role": role, "content": message})
        self.save_history()

    def create_completion(
        self,
        messages: list[dict[str, object]],
        model: str | None = None,
        temperature: float | None = None,
        max_tokens: int | None = None,
        stream: bool = False,
    ) -> object:
        return self._call_api(
            messages=messages,
            model=model or self.model,
            temperature=self.temperature if temperature is None else temperature,
            max_tokens=self.max_tokens if max_tokens is None else max_tokens,
            stream=stream,
        )

    def _call_api(
        self,
        messages: list[dict[str, object]],
        model: str,
        temperature: float,
        max_tokens: int,
        stream: bool,
    ) -> object:
        last_exception: Exception | None = None
        params: dict[str, object] = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
            "stream": stream,
        }
        if max_tokens > 0:
            params["max_tokens"] = max_tokens

        for attempt in range(self.max_retries):
            try:
                return self.client.chat.completions.create(**params)
            except (APIError, TimeoutError, Exception) as error:
                last_exception = error
                logger.exception(
                    "API 调用失败（尝试 %s/%s），稍候重试。", attempt + 1, self.max_retries
                )
                time.sleep(self.retry_delay)

        if last_exception is None:
            raise RuntimeError("API 调用失败。")
        raise last_exception

    def get_response(
        self,
        message: str,
        relationship_level: int,
        context_info: str = "",
        stream: bool = False,
    ) -> str | Generator[str, None, None]:
        prompt = self.generate_prompt(message, relationship_level, context_info)
        self.add_message("user", prompt)
        response = self.create_completion(self.conversation_history, stream=stream)
        if stream:
            return self._stream_response(response, message)

        reply = response.choices[0].message.content.strip()
        self.add_message("assistant", reply)
        logger.info("User: %s -> Assistant: %s...", message, reply[:50])
        return reply

    def _stream_response(self, response: object, message: str) -> Generator[str, None, None]:
        final_content = ""
        try:
            for chunk in response:
                delta = chunk.choices[0].delta
                content = getattr(delta, "content", None)
                if content:
                    final_content += content
                    yield content
        finally:
            self.add_message("assistant", final_content)
            logger.debug("User: %s -> Assistant: %s...", message, final_content[:200])

    @lru_cache(maxsize=100)
    def get_cached_response(
        self, message: str, relationship_level: int, context_info: str = ""
    ) -> str:
        response = self.get_response(message, relationship_level, context_info, stream=False)
        if not isinstance(response, str):
            return "".join(response)
        return response

    @staticmethod
    def serialize_response(response: object) -> dict[str, object]:
        if hasattr(response, "model_dump"):
            return response.model_dump()
        if hasattr(response, "to_dict"):
            return response.to_dict()
        if hasattr(response, "model_dump_json"):
            return json.loads(response.model_dump_json())
        raise TypeError("Unsupported OpenAI response object")
