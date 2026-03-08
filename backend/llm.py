import json
import os
import urllib.request
import urllib.error
from typing import Optional
from openai import RateLimitError
from prompt import SYSTEM_PROMPT, build_user_prompt


def _post_json(uri: str, payload: dict, api_key: str) -> dict:
    headers = {"Content-Type": "application/json"}
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


def generate_story_content(
    child_profile: dict,
    meal_context: dict,
    story_config: dict,
    dissatisfaction_reason: Optional[str] = None,
) -> dict:
    """Call OpenAI GPT and return parsed story dict (book_meta + pages + ending)."""
    user_prompt = build_user_prompt(child_profile, meal_context, story_config, dissatisfaction_reason)
    uri = os.getenv("STORYTEXT_OPENAI_URI")
    api_key = os.getenv("STORYTEXT_OPENAI_API_KEY")
    model = os.getenv("STORYTEXT_OPENAI_MODEL")
    if not uri:
        raise RuntimeError("STORYTEXT_OPENAI_URI not set")
    if not api_key:
        raise RuntimeError("STORYTEXT_OPENAI_API_KEY not set")
    if not model:
        raise RuntimeError("STORYTEXT_OPENAI_MODEL not set")

    response = _post_json(
        uri,
        {
            "model": model,
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            "response_format": {"type": "json_object"},
        },
        api_key,
    )
    raw = response.get("choices", [{}])[0].get("message", {}).get("content")
    print("[LLM] raw response (first 200 chars):", raw[:200] if raw else "EMPTY")
    return json.loads(raw)
