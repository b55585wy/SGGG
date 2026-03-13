import json
import os
import time
import urllib.request
import urllib.error
from typing import Optional
from openai import RateLimitError
from prompt import SYSTEM_PROMPT, build_user_prompt


def _post_json(uri: str, payload: dict, api_key: str) -> dict:
    print(f"[INFO] LLM request start uri={uri}")
    headers = {"Content-Type": "application/json"}
    if "openai.azure.com" in uri:
        headers["api-key"] = api_key
    else:
        headers["Authorization"] = f"Bearer {api_key}"
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(uri, data=data, headers=headers, method="POST")
    base_timeout_sec = int(os.getenv("STORYTEXT_OPENAI_TIMEOUT_SEC", "120"))
    max_timeout_sec = int(os.getenv("STORYTEXT_OPENAI_TIMEOUT_MAX_SEC", "600"))
    max_total_sec = int(os.getenv("STORYTEXT_OPENAI_MAX_TOTAL_SEC", "7200"))
    backoff_sec = float(os.getenv("STORYTEXT_OPENAI_BACKOFF_SEC", "2"))
    backoff_max_sec = float(os.getenv("STORYTEXT_OPENAI_BACKOFF_MAX_SEC", "60"))

    start_ts = time.time()
    timeout_sec = base_timeout_sec
    attempt = 0
    while True:
        attempt += 1
        try:
            with urllib.request.urlopen(req, timeout=timeout_sec) as resp:
                body = resp.read().decode("utf-8")
            print("[INFO] LLM request done")
            return json.loads(body) if body else {}
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8")
            if e.code in (429, 503, 504):
                if time.time() - start_ts > max_total_sec:
                    if e.code == 429:
                        raise RateLimitError("请求频率超限，请稍后重试。", response=None, body=None)
                    raise RuntimeError(f"LLM request failed ({e.code}): {body}")
                time.sleep(min(backoff_sec, backoff_max_sec))
                backoff_sec = min(backoff_sec * 1.7, backoff_max_sec)
                continue
            raise RuntimeError(f"LLM request failed ({e.code}): {body}")
        except Exception as e:
            if time.time() - start_ts > max_total_sec:
                raise
            msg = str(e)
            timeout_like = "timed out" in msg.lower() or "timeout" in msg.lower()
            if timeout_like:
                timeout_sec = min(int(timeout_sec * 1.5), max_timeout_sec)
            time.sleep(min(backoff_sec, backoff_max_sec))
            backoff_sec = min(backoff_sec * 1.7, backoff_max_sec)


_fake_delay_sec: float = 0.0


def set_storytext_fake_delay(seconds: float) -> None:
    global _fake_delay_sec
    _fake_delay_sec = max(0.0, float(seconds))


def generate_story_content(
    child_profile: dict,
    meal_context: dict,
    story_config: dict,
    dissatisfaction_reason: Optional[str] = None,
) -> dict:
    """Call OpenAI GPT and return parsed story dict (book_meta + pages + ending)."""
    env_delay = os.getenv("STORYTEXT_FAKE_DELAY_SEC")
    delay_sec = float(env_delay) if env_delay is not None and env_delay.strip() != "" else _fake_delay_sec
    if delay_sec > 0:
        time.sleep(delay_sec)
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
