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


EXT_TO_CONTENT_TYPE = {
    "webm": "audio/webm",
    "m4a": "audio/mp4",
    "mp3": "audio/mpeg",
    "wav": "audio/wav",
    "ogg": "audio/ogg",
    "flac": "audio/flac",
    "aiff": "audio/aiff",
}

CONTENT_TYPE_TO_EXT = {
    "audio/webm": "webm",
    "audio/mp4": "m4a",
    "audio/x-m4a": "m4a",
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/mpga": "mp3",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/wave": "wav",
    "audio/ogg": "ogg",
    "audio/flac": "flac",
    "audio/aiff": "aiff",
}


def _extension_from_magic(file_bytes: bytes) -> str | None:
    if file_bytes.startswith(b"\x1a\x45\xdf\xa3"):
        return "webm"
    if len(file_bytes) >= 12 and file_bytes.startswith(b"RIFF") and file_bytes[8:12] == b"WAVE":
        return "wav"
    if file_bytes.startswith(b"OggS"):
        return "ogg"
    if file_bytes.startswith(b"fLaC"):
        return "flac"
    if len(file_bytes) >= 12 and file_bytes.startswith(b"FORM") and file_bytes[8:12] in {b"AIFF", b"AIFC"}:
        return "aiff"
    if len(file_bytes) >= 8 and file_bytes[4:8] == b"ftyp":
        return "m4a"
    if file_bytes.startswith(b"ID3"):
        return "mp3"
    if len(file_bytes) >= 2 and file_bytes[0] == 0xFF and (file_bytes[1] & 0xE0) == 0xE0:
        return "mp3"
    return None


def _extension_from_content_type(content_type: str | None) -> str | None:
    if not content_type:
        return None
    normalized = content_type.split(";", 1)[0].strip().lower()
    return CONTENT_TYPE_TO_EXT.get(normalized)


def _extension_from_filename(filename: str | None) -> str | None:
    if not filename:
        return None
    _, ext = os.path.splitext(filename.lower())
    cleaned = ext.lstrip(".")
    if cleaned == "mp4":
        return "m4a"
    if cleaned in EXT_TO_CONTENT_TYPE:
        return cleaned
    return None


def _normalize_audio_meta(file_bytes: bytes, filename: str | None, content_type: str | None) -> tuple[str, str]:
    ext = (
        _extension_from_magic(file_bytes)
        or _extension_from_content_type(content_type)
        or _extension_from_filename(filename)
        or "webm"
    )
    normalized_filename = f"recording.{ext}"
    normalized_content_type = EXT_TO_CONTENT_TYPE.get(ext, "audio/webm")
    return normalized_filename, normalized_content_type


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
        filename, content_type = _normalize_audio_meta(
            data,
            file.filename,
            file.content_type,
        )
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
