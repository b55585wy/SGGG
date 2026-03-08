import io
import os
import asyncio
import json
import uuid
import urllib.request
import urllib.error
from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import Response
from pydantic import BaseModel
import edge_tts

router = APIRouter(prefix="/api/v1", tags=["tts", "transcribe"])

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


@router.post("/tts")
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


def _build_multipart(file_bytes: bytes, filename: str, content_type: str, fields: dict) -> tuple[bytes, str]:
    boundary = uuid.uuid4().hex
    lines: list[bytes] = []
    for key, value in fields.items():
        lines.append(f"--{boundary}\r\n".encode())
        lines.append(f'Content-Disposition: form-data; name="{key}"\r\n\r\n'.encode())
        lines.append(str(value).encode())
        lines.append(b"\r\n")
    lines.append(f"--{boundary}\r\n".encode())
    lines.append(f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'.encode())
    lines.append(f"Content-Type: {content_type}\r\n\r\n".encode())
    lines.append(file_bytes)
    lines.append(b"\r\n")
    lines.append(f"--{boundary}--\r\n".encode())
    body = b"".join(lines)
    return body, f"multipart/form-data; boundary={boundary}"


@router.post("/voice/transcribe")
async def transcribe(file: UploadFile = File(...)):
    uri = os.getenv("TRANSCIBE_OPENAI_URI")
    api_key = os.getenv("TRANSCIBE_OPENAI_API_KEY")
    model = os.getenv("TRANSCIBE_OPENAI_MODEL")
    if not uri:
        raise HTTPException(503, detail={"error": {"code": "TRANSCRIBE_URI_NOT_SET", "message": "TRANSCIBE_OPENAI_URI not set"}})
    if not api_key:
        raise HTTPException(503, detail={"error": {"code": "TRANSCRIBE_KEY_NOT_SET", "message": "TRANSCIBE_OPENAI_API_KEY not set"}})
    if not model:
        raise HTTPException(503, detail={"error": {"code": "TRANSCRIBE_MODEL_NOT_SET", "message": "TRANSCIBE_OPENAI_MODEL not set"}})
    data = await file.read()
    if not data:
        raise HTTPException(400, detail={"error": {"code": "EMPTY_AUDIO", "message": "empty audio file"}})
    try:
        filename = file.filename or "recording.webm"
        content_type = file.content_type or "audio/webm"
        body, content_type_header = _build_multipart(
            data,
            filename,
            content_type,
            {"model": model, "response_format": "json"},
        )
        headers = {"Content-Type": content_type_header}
        if "openai.azure.com" in uri:
            headers["api-key"] = api_key
        else:
            headers["Authorization"] = f"Bearer {api_key}"
        req = urllib.request.Request(uri, data=body, headers=headers, method="POST")
        with urllib.request.urlopen(req, timeout=60) as resp:
            text = resp.read().decode("utf-8")
        payload = json.loads(text) if text else {}
        return {"text": payload.get("text", "")}
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8")
        raise HTTPException(502, detail={"error": {"code": "TRANSCRIBE_FAILED", "message": f"{e.code}: {detail}"}})
    except Exception as e:
        raise HTTPException(502, detail={"error": {"code": "TRANSCRIBE_FAILED", "message": str(e)}})
