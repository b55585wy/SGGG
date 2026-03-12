import asyncio
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
from audio_gen import DEFAULT_VOICE, synthesize_audio_bytes

router = APIRouter(prefix="/api/v1/tts", tags=["tts"])


class TTSRequest(BaseModel):
    text: str
    voice: str = DEFAULT_VOICE


@router.post("")
async def synthesize(req: TTSRequest):
    try:
        audio = await asyncio.wait_for(synthesize_audio_bytes(req.text, req.voice), timeout=15)
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
