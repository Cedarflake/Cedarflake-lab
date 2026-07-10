from __future__ import annotations

from dotenv import load_dotenv
from flask import Flask, jsonify, request
from nya_chat.chat import OpenAICompatibleChat
from nya_chat.utils import get_bool, get_int, get_str, load_config, resolve_api_key, setup_logging

load_dotenv()
config = load_config()
logger = setup_logging(config)

try:
    api_key = resolve_api_key(config)
except RuntimeError as error:
    logger.error(str(error))
    raise SystemExit(str(error)) from error

chat_service = OpenAICompatibleChat(api_key=api_key, config=config)
app = Flask(__name__)


def _json_payload() -> dict[str, object]:
    payload = request.get_json(silent=True)
    if isinstance(payload, dict):
        return payload
    return {}


@app.post("/chat")
def chat():
    payload = _json_payload()
    user_input = payload.get("input") or payload.get("message")
    if not isinstance(user_input, str) or not user_input.strip():
        return jsonify({"error": "input is required"}), 400

    relationship = payload.get("relationship", config.get("DEFAULT_RELATIONSHIP_LEVEL"))
    context_info = payload.get("context", config.get("DEFAULT_CONTEXT_INFO"))

    try:
        reply = chat_service.get_response(
            message=user_input,
            relationship_level=int(relationship),
            context_info=str(context_info or ""),
            stream=False,
        )
    except Exception as error:
        logger.exception("处理对话请求时出错。")
        return jsonify({"error": str(error)}), 500

    return jsonify({"model": chat_service.model, "response": reply})


@app.post("/v1/chat/completions")
def chat_completions():
    payload = _json_payload()
    messages = payload.get("messages")
    if not isinstance(messages, list):
        return jsonify({"error": {"message": "messages must be an array"}}), 400

    stream = bool(payload.get("stream", False))
    if stream:
        return jsonify(
            {
                "error": {
                    "message": "streaming responses are not supported by this local endpoint yet"
                }
            }
        ), 400

    model = payload.get("model")
    temperature = payload.get("temperature")
    max_tokens = payload.get("max_tokens")

    try:
        response = chat_service.create_completion(
            messages=[item for item in messages if isinstance(item, dict)],
            model=str(model) if isinstance(model, str) and model else None,
            temperature=float(temperature) if isinstance(temperature, int | float) else None,
            max_tokens=int(max_tokens) if isinstance(max_tokens, int | float) else None,
            stream=False,
        )
    except Exception as error:
        logger.exception("处理 OpenAI-compatible 请求时出错。")
        return jsonify({"error": {"message": str(error)}}), 500

    return jsonify(chat_service.serialize_response(response))


@app.get("/health")
def health():
    return jsonify({"base_url": chat_service.base_url, "model": chat_service.model, "status": "ok"})


if __name__ == "__main__":
    app.run(
        host=get_str(config, "HOST"),
        port=get_int(config, "PORT"),
        debug=get_bool(config, "DEBUG"),
    )
