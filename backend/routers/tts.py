import os
import asyncio
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
import dashscope
from dashscope.audio.tts import SpeechSynthesizer

router = APIRouter(prefix="/api/v1/tts", tags=["tts"])

# 可用声音列表（需账号已开通对应模型）
VOICE_MODEL_MAP = {
    "zhimiao":  "sambert-zhimiao-emo-v1",   # 情感女声（默认，绘本推荐）
    "zhiying":  "sambert-zhiying-v1",        # 标准女声
    "zhishuo":  "sambert-zhishuo-v1",        # 标准男声
}
DEFAULT_VOICE = "zhimiao"


class TTSRequest(BaseModel):
    text: str
    voice: str = DEFAULT_VOICE


def _synthesize(text: str, voice: str, api_key: str) -> bytes:
    dashscope.api_key = api_key
    model = VOICE_MODEL_MAP.get(voice, VOICE_MODEL_MAP[DEFAULT_VOICE])
    result = SpeechSynthesizer.call(
        model=model,
        text=text,
        sample_rate=48000,
        format="mp3",
    )
    audio = result.get_audio_data() if hasattr(result, "get_audio_data") else None
    if not audio:
        raise RuntimeError(f"TTS 合成失败，model={model}")
    return audio


@router.post("")
async def synthesize(req: TTSRequest):
    api_key = os.getenv("DASHSCOPE_API_KEY")
    if not api_key:
        raise HTTPException(
            503,
            detail={"error": {"code": "TTS_UNAVAILABLE", "message": "未配置 DASHSCOPE_API_KEY"}},
        )

    loop = asyncio.get_event_loop()
    try:
        audio = await loop.run_in_executor(
            None, _synthesize, req.text, req.voice, api_key
        )
    except Exception as e:
        raise HTTPException(
            500,
            detail={"error": {"code": "TTS_ERROR", "message": str(e)}},
        )

    return Response(content=audio, media_type="audio/mpeg")
