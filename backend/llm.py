import json
import os
import urllib.error
import urllib.request
from openai import RateLimitError
from prompt import SYSTEM_PROMPT, build_user_prompt


def _post_json(uri: str, payload: dict, api_key: str) -> dict:
    headers = {"Content-Type": "application/json"}
    # Azure OpenAI uses `api-key` header, while OpenAI-compatible endpoints use Bearer.
    if "openai.azure.com" in uri:
        headers["api-key"] = api_key
    else:
        headers["Authorization"] = f"Bearer {api_key}"

    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(uri, data=data, headers=headers, method="POST")
    timeout_sec = int(os.getenv("STORYTEXT_OPENAI_TIMEOUT_SEC", "120"))

    try:
        with urllib.request.urlopen(req, timeout=timeout_sec) as resp:
            body = resp.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8")
        if e.code == 429:
            raise RateLimitError("请求频率超限，请稍后重试。", response=None, body=None)
        raise RuntimeError(f"LLM request failed ({e.code}): {body}")

    return json.loads(body) if body else {}


def _resolve_llm_config() -> tuple[str, str, str]:
    story_uri = os.getenv("STORYTEXT_OPENAI_URI")
    story_api_key = os.getenv("STORYTEXT_OPENAI_API_KEY")
    story_model = os.getenv("STORYTEXT_OPENAI_MODEL")

    has_storytext_config = any([story_uri, story_api_key, story_model])
    if has_storytext_config:
        if not story_uri:
            raise RuntimeError("STORYTEXT_OPENAI_URI not set")
        if not story_api_key:
            raise RuntimeError("STORYTEXT_OPENAI_API_KEY not set")
        if not story_model:
            raise RuntimeError("STORYTEXT_OPENAI_MODEL not set")
        return story_uri, story_api_key, story_model

    # Backward compatibility with existing DeepSeek config.
    deepseek_api_key = os.getenv("DEEPSEEK_API_KEY")
    if not deepseek_api_key:
        raise RuntimeError("STORYTEXT_OPENAI_* not set and DEEPSEEK_API_KEY not set")

    deepseek_uri = os.getenv("DEEPSEEK_API_URI", "https://api.deepseek.com/chat/completions")
    deepseek_model = os.getenv("DEEPSEEK_MODEL", "deepseek-chat")
    return deepseek_uri, deepseek_api_key, deepseek_model


def generate_story_content(
    child_profile: dict,
    meal_context: dict,
    story_config: dict,
    dissatisfaction_reason: str | None = None,
    custom_prompt: str | None = None,
) -> dict:
    """Call OpenAI-compatible endpoint and return parsed story dict."""
    user_prompt = build_user_prompt(child_profile, meal_context, story_config, dissatisfaction_reason, custom_prompt)
    uri, api_key, model = _resolve_llm_config()

    response = _post_json(
        uri,
        {
            "model": model,
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            "response_format": {"type": "json_object"},
            "temperature": 0.7,
        },
        api_key,
    )
    raw = response.get("choices", [{}])[0].get("message", {}).get("content")
    print("[LLM] raw response (first 200 chars):", raw[:200] if raw else "EMPTY")
    if not raw:
        raise RuntimeError("LLM returned empty content")
    return json.loads(raw)
