"""POST /api/v1/transcribe — proxy audio to OpenAI Whisper with 200/503/502 contract."""

import logging
import time

import httpx
from fastapi import APIRouter, File, HTTPException, UploadFile

from app.api.deps import CurrentUser, SessionDep
from app.services import admin_settings as svc

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/transcribe", tags=["transcribe"])

_MAX_AUDIO_BYTES = 25 * 1024 * 1024  # 25 MB — OpenAI's own limit
_OPENAI_TRANSCRIBE_URL = "https://api.openai.com/v1/audio/transcriptions"
_OPENAI_TIMEOUT = 30.0

# Module-level singleton for connection pool reuse
_http_client: httpx.AsyncClient | None = None


def _get_http_client() -> httpx.AsyncClient:
    global _http_client
    if _http_client is None or _http_client.is_closed:
        _http_client = httpx.AsyncClient(timeout=_OPENAI_TIMEOUT)
    return _http_client


@router.post("")
async def transcribe_audio(
    session: SessionDep,
    current_user: CurrentUser,
    audio: UploadFile = File(...),
) -> dict:
    """Proxy audio to OpenAI Whisper. Returns {text} on 200, 503 if key missing, 502 on upstream error."""
    # Reject oversized uploads fast — before reading into memory
    content = await audio.read()
    if len(content) > _MAX_AUDIO_BYTES:
        raise HTTPException(status_code=413, detail="Audio file exceeds 25MB limit")

    api_key = svc.get_setting(session, "openai_api_key")
    if api_key is None:
        raise HTTPException(status_code=503, detail="OpenAI API key not configured")

    start_ms = time.monotonic()
    filename = audio.filename or "audio"
    content_type = audio.content_type or "application/octet-stream"

    try:
        client = _get_http_client()
        response = await client.post(
            _OPENAI_TRANSCRIBE_URL,
            headers={"Authorization": f"Bearer {api_key}"},
            data={"model": "whisper-1"},
            files={"file": (filename, content, content_type)},
        )
    except httpx.ConnectError as exc:
        duration_ms = int((time.monotonic() - start_ms) * 1000)
        logger.warning(
            "transcribe.upstream_error type=ConnectError duration_ms=%d",
            duration_ms,
        )
        raise HTTPException(status_code=502, detail="Transcription service error") from exc
    except httpx.TimeoutException as exc:
        duration_ms = int((time.monotonic() - start_ms) * 1000)
        logger.warning(
            "transcribe.upstream_error type=TimeoutException duration_ms=%d",
            duration_ms,
        )
        raise HTTPException(status_code=502, detail="Transcription service error") from exc
    except Exception as exc:
        duration_ms = int((time.monotonic() - start_ms) * 1000)
        logger.warning(
            "transcribe.upstream_error type=%s duration_ms=%d",
            type(exc).__name__,
            duration_ms,
        )
        raise HTTPException(status_code=502, detail="Transcription service error") from exc

    duration_ms = int((time.monotonic() - start_ms) * 1000)

    if not response.is_success:
        logger.warning(
            "transcribe.upstream_error openai_status=%d duration_ms=%d",
            response.status_code,
            duration_ms,
        )
        raise HTTPException(status_code=502, detail="Transcription service error")

    try:
        data = response.json()
        text = data["text"]
    except Exception as exc:
        logger.warning(
            "transcribe.parse_error duration_ms=%d error=%s",
            duration_ms,
            type(exc).__name__,
        )
        raise HTTPException(status_code=502, detail="Transcription service error") from exc

    logger.info(
        "transcribe.success duration_ms=%d status=%d",
        duration_ms,
        response.status_code,
    )
    return {"text": text}
