import asyncio
import io
import os
import uuid as _uuid
from typing import Any

import edge_tts

BACKEND_BASE_URL = os.getenv("BACKEND_BASE_URL", "http://localhost:8000")
_AUDIO_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static", "audio")

# edge-tts 中文神经网络声音，无需 API Key
VOICE_MAP = {
    "zhimiao": "zh-CN-XiaoxiaoNeural",  # 温柔女声（默认，绘本推荐）
    "zhiying": "zh-CN-XiaohanNeural",   # 活泼女声
    "zhishuo": "zh-CN-YunxiNeural",     # 自然男声
}
DEFAULT_VOICE = "zhimiao"


async def synthesize_audio_bytes(text: str, voice_key: str = DEFAULT_VOICE) -> bytes:
    voice = VOICE_MAP.get(voice_key, VOICE_MAP[DEFAULT_VOICE])
    communicate = edge_tts.Communicate(text, voice=voice, rate="-10%")
    buf = io.BytesIO()
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            buf.write(chunk["data"])
    audio = buf.getvalue()
    if not audio:
        raise RuntimeError(f"edge-tts 合成失败，voice={voice}")
    return audio


def _synthesize_audio_bytes_sync(text: str, voice_key: str, timeout_sec: int = 20) -> bytes:
    return asyncio.run(asyncio.wait_for(synthesize_audio_bytes(text, voice_key), timeout=timeout_sec))


def _save_audio_locally(audio: bytes) -> str:
    os.makedirs(_AUDIO_DIR, exist_ok=True)
    audio_name = _uuid.uuid4().hex + ".mp3"
    path = os.path.join(_AUDIO_DIR, audio_name)
    with open(path, "wb") as f:
        f.write(audio)
    return f"{BACKEND_BASE_URL}/static/audio/{audio_name}"


def synthesize_audio_url(text: str, voice_key: str = DEFAULT_VOICE) -> str | None:
    cleaned = (text or "").strip()
    if not cleaned:
        return None
    try:
        audio = _synthesize_audio_bytes_sync(cleaned, voice_key)
        return _save_audio_locally(audio)
    except Exception as e:
        print(f"[TTS-PREGEN] 合成失败: {e}")
        return None


def _choice_options_text(branch_choices: list[dict[str, Any]]) -> str:
    labels: list[str] = []
    for idx, c in enumerate(branch_choices, start=1):
        label = str(c.get("label", "")).strip()
        if label:
            labels.append(f"选项{idx}：{label}")
    return "。".join(labels) + ("。" if labels else "")


def generate_audio_for_pages(
    pages: list[dict[str, Any]],
    voice_key: str = DEFAULT_VOICE,
    include_interaction: bool = True,
) -> None:
    if not pages:
        return
    total = len(pages)
    ok = 0
    for i, page in enumerate(pages, start=1):
        page_id = page.get("page_id", f"p{i:02d}")
        text = str(page.get("text", "")).strip()
        if text:
            url = synthesize_audio_url(text, voice_key)
            if url:
                page["audio_url"] = url
                ok += 1

        if not include_interaction:
            continue
        interaction = page.get("interaction", {}) if isinstance(page.get("interaction"), dict) else {}
        instruction = str(interaction.get("instruction", "")).strip()
        if instruction:
            i_url = synthesize_audio_url(instruction, voice_key)
            if i_url:
                page["interaction_audio_url"] = i_url

        if interaction.get("type") == "choice":
            choices = page.get("branch_choices", [])
            if isinstance(choices, list) and choices:
                options_text = _choice_options_text([c for c in choices if isinstance(c, dict)])
                if options_text:
                    o_url = synthesize_audio_url(options_text, voice_key)
                    if o_url:
                        page["choice_options_audio_url"] = o_url
        print(f"[TTS-PREGEN] page {i}/{total} done page_id={page_id}")

    print(f"[TTS-PREGEN] 页面正文预生成完成: {ok}/{total}")
