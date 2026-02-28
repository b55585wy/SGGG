import json
import os
from openai import OpenAI, RateLimitError
from prompt import SYSTEM_PROMPT, build_user_prompt

_client: OpenAI | None = None


def get_client() -> OpenAI:
    global _client
    if _client is None:
        api_key = os.getenv("DEEPSEEK_API_KEY")
        if not api_key:
            raise RuntimeError("DEEPSEEK_API_KEY not set")
        _client = OpenAI(
            api_key=api_key,
            base_url="https://api.deepseek.com",
        )
    return _client


def generate_story_content(
    child_profile: dict,
    meal_context: dict,
    story_config: dict,
    dissatisfaction_reason: str | None = None,
) -> dict:
    """Call DeepSeek and return parsed story dict (book_meta + pages + ending)."""
    client = get_client()
    user_prompt = build_user_prompt(child_profile, meal_context, story_config, dissatisfaction_reason)

    try:
        response = client.chat.completions.create(
            model="deepseek-chat",
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            response_format={"type": "json_object"},
            temperature=0.7,
        )
    except RateLimitError:
        raise RateLimitError("请求频率超限，请稍后重试。", response=None, body=None)

    raw = response.choices[0].message.content
    print("[LLM] raw response (first 200 chars):", raw[:200] if raw else "EMPTY")
    return json.loads(raw)
