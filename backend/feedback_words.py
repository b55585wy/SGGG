import json
import os
import urllib.error
import urllib.request


def _prompt_file_path(name: str) -> str:
    here = os.path.dirname(os.path.abspath(__file__))
    prompts_dir = os.path.abspath(os.path.join(here, "prompts"))
    return os.path.abspath(os.path.join(prompts_dir, name))


def _load_prompt_parts(name: str) -> dict:
    path = _prompt_file_path(name)
    with open(path, "r", encoding="utf-8") as f:
        lines = f.readlines()

    parts: dict[str, list[str]] = {}
    current: str | None = None

    def start(key: str, line: str):
        nonlocal current
        current = key
        parts.setdefault(key, []).append(line)

    for raw in lines:
        line = raw.rstrip("\n")
        if line.startswith("SYSTEM_PROMPT="):
            start("system", line.split("=", 1)[1])
            continue
        if line.startswith("USER_PROMPT="):
            start("user_template", line.split("=", 1)[1])
            continue
        if current:
            parts[current].append(line)

    def normalize(key: str) -> str:
        buf = "\n".join(parts.get(key, [])).strip()
        if buf.startswith('"'):
            buf = buf[1:]
        if buf.endswith('"'):
            buf = buf[:-1]
        return buf.strip()

    return {
        "system": normalize("system"),
        "user_template": normalize("user_template"),
    }


def _fill_user_template(template: str, params: dict) -> str:
    if not template:
        return json.dumps(params, ensure_ascii=False, indent=2)
    phrases = params.get("recent_phrases") or []
    p1 = phrases[0] if len(phrases) > 0 else ""
    p2 = phrases[1] if len(phrases) > 1 else ""
    mapping = {
        "{nickname}": json.dumps(params.get("nickname", ""), ensure_ascii=False),
        "{picky_food}": json.dumps(params.get("picky_food", ""), ensure_ascii=False),
        "{self_rating}": json.dumps(params.get("self_rating", ""), ensure_ascii=False),
        "{self_description}": json.dumps(params.get("self_description", ""), ensure_ascii=False),
        "{recent_phrase1}": json.dumps(p1, ensure_ascii=False),
        "{recent_phrase2}": json.dumps(p2, ensure_ascii=False),
        "{seed}": json.dumps(params.get("seed", ""), ensure_ascii=False),
    }
    out = template
    for k, v in mapping.items():
        out = out.replace(k, v)
    return out


def _post_json(uri: str, payload: dict, api_key: str) -> dict:
    headers = {"Content-Type": "application/json"}
    if "openai.azure.com" in uri:
        headers["api-key"] = api_key
    else:
        headers["Authorization"] = f"Bearer {api_key}"
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(uri, data=data, headers=headers, method="POST")
    timeout_sec = int(os.getenv("FEEDBACK_OPENAI_TIMEOUT_SEC", "60"))
    try:
        with urllib.request.urlopen(req, timeout=timeout_sec) as resp:
            body = resp.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8")
        raise RuntimeError(f"LLM request failed ({e.code}): {body}")
    return json.loads(body) if body else {}


def generate_feedback_words(params: dict) -> str:
    uri = os.getenv("FEEDBACK_OPENAI_URI")
    api_key = os.getenv("FEEDBACK_OPENAI_API_KEY")
    model = os.getenv("FEEDBACK_OPENAI_MODEL")
    if not uri:
        raise RuntimeError("FEEDBACK_OPENAI_URI not set")
    if not api_key:
        raise RuntimeError("FEEDBACK_OPENAI_API_KEY not set")
    if not model:
        raise RuntimeError("FEEDBACK_OPENAI_MODEL not set")

    parts = _load_prompt_parts("feedback_words_prompt.md")
    system_prompt = parts.get("system", "")
    user_template = parts.get("user_template", "")
    if not system_prompt:
        raise RuntimeError("feedback_words_prompt.md invalid")

    user_content = _fill_user_template(user_template, params)

    payload: dict = {
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content},
        ],
    }
    if "/deployments/" not in uri:
        payload["model"] = model
    else:
        payload["model"] = model

    rsp = _post_json(uri, payload, api_key)
    raw = rsp.get("choices", [{}])[0].get("message", {}).get("content")
    text = raw.strip() if isinstance(raw, str) else ""
    if not text:
        raise RuntimeError("empty feedback response")
    return text

