import io
import asyncio
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
import edge_tts

router = APIRouter(prefix="/api/v1/tts", tags=["tts"])

# edge-tts 中文神经网络声音，无需 API Key
VOICE_MAP = {
    "zhimiao":  "zh-CN-XiaoxiaoNeural",   # 温柔女声（默认，绘本推荐）
    "zhiying":  "zh-CN-XiaohanNeural",    # 活泼女声
    "zhishuo":  "zh-CN-YunxiNeural",      # 自然男声
}
DEFAULT_VOICE = "zhimiao"


class TTSRequest(BaseModel):
    text: str
    voice: str = DEFAULT_VOICE


async def _synthesize(text: str, voice_key: str) -> bytes:
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


@router.post("")
async def synthesize(req: TTSRequest):
    try:
        audio = await asyncio.wait_for(_synthesize(req.text, req.voice), timeout=15)
    except asyncio.TimeoutError:
        raise HTTPException(
            504,
            detail={"error": {"code": "TTS_TIMEOUT", "message": "TTS 合成超时"}},
        )
    except Exception as e:
        raise HTTPException(
            500,
            detail={"error": {"code": "TTS_ERROR", "message": str(e)}},
        )
    return Response(content=audio, media_type="audio/mpeg")
