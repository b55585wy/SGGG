import json
import os
import anthropic
from prompt import SYSTEM_PROMPT, build_user_prompt

_client: anthropic.Anthropic | None = None


def get_client() -> anthropic.Anthropic:
    global _client
    if _client is None:
        api_key = os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            raise RuntimeError("ANTHROPIC_API_KEY not set")
        _client = anthropic.Anthropic(api_key=api_key)
    return _client


def generate_story_content(
    child_profile: dict,
    meal_context: dict,
    story_config: dict,
    dissatisfaction_reason: str | None = None,
) -> dict:
    """Call Claude and return parsed story dict (book_meta + pages + ending)."""
    client = get_client()
    user_prompt = build_user_prompt(child_profile, meal_context, story_config, dissatisfaction_reason)

    # Prefill assistant turn with "{" to force pure JSON output
    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=8192,
        system=SYSTEM_PROMPT,
        messages=[
            {"role": "user", "content": user_prompt},
            {"role": "assistant", "content": "{"},
        ],
    )

    raw = "{" + response.content[0].text
    return json.loads(raw)
