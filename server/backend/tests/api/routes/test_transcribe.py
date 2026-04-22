"""Integration tests for POST /api/v1/transcribe.

Test matrix (7 cases):
(a) no key set → 503
(b) key set + OpenAI 200 → 200 with forwarded text
(c) key set + OpenAI 500 → 502
(d) key set + httpx.ConnectError → 502
(e) oversized upload → 413
(f) missing file field → 422
(g) unauthenticated request → 401

Run: cd server/backend && uv run pytest tests/api/routes/test_transcribe.py -v
"""

import io
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

from app.core.config import settings
from app.models import AdminSetting
from app.services import admin_settings as svc

TRANSCRIBE_URL = f"{settings.API_V1_STR}/transcribe"
TEST_KEY = "openai_api_key"
TEST_OPENAI_KEY = "sk-test-transcribe-key"


def _cleanup(db: Session) -> None:
    row = db.get(AdminSetting, TEST_KEY)
    if row:
        db.delete(row)
        db.commit()


def _set_key(db: Session) -> None:
    svc.set_setting(db, TEST_KEY, TEST_OPENAI_KEY)


def _audio_file() -> tuple[str, bytes, str]:
    return ("test.wav", b"RIFF fake wav content", "audio/wav")


def _mock_openai_response(status_code: int, json_body: dict) -> MagicMock:
    """Build a fake httpx.Response."""
    mock_resp = MagicMock(spec=httpx.Response)
    mock_resp.status_code = status_code
    mock_resp.is_success = (200 <= status_code < 300)
    mock_resp.json.return_value = json_body
    return mock_resp


# ---------------------------------------------------------------------------
# (a) No key set → 503
# ---------------------------------------------------------------------------

def test_transcribe_no_key_returns_503(
    client: TestClient,
    db: Session,
    normal_user_token_headers: dict[str, str],
) -> None:
    _cleanup(db)
    resp = client.post(
        TRANSCRIBE_URL,
        headers=normal_user_token_headers,
        files={"audio": _audio_file()},
    )
    assert resp.status_code == 503
    assert "not configured" in resp.json()["detail"]


# ---------------------------------------------------------------------------
# (b) Key set + OpenAI 200 → 200 with forwarded text
# ---------------------------------------------------------------------------

def test_transcribe_openai_200_returns_text(
    client: TestClient,
    db: Session,
    normal_user_token_headers: dict[str, str],
) -> None:
    _cleanup(db)
    _set_key(db)

    mock_resp = _mock_openai_response(200, {"text": "Hello world"})

    with patch(
        "app.api.routes.transcribe._get_http_client",
    ) as mock_get_client:
        mock_async_client = AsyncMock()
        mock_async_client.post = AsyncMock(return_value=mock_resp)
        mock_get_client.return_value = mock_async_client

        resp = client.post(
            TRANSCRIBE_URL,
            headers=normal_user_token_headers,
            files={"audio": _audio_file()},
        )

    assert resp.status_code == 200
    data = resp.json()
    assert data["text"] == "Hello world"

    _cleanup(db)


# ---------------------------------------------------------------------------
# (c) Key set + OpenAI 500 → 502
# ---------------------------------------------------------------------------

def test_transcribe_openai_500_returns_502(
    client: TestClient,
    db: Session,
    normal_user_token_headers: dict[str, str],
) -> None:
    _cleanup(db)
    _set_key(db)

    mock_resp = _mock_openai_response(500, {"error": "internal server error"})

    with patch(
        "app.api.routes.transcribe._get_http_client",
    ) as mock_get_client:
        mock_async_client = AsyncMock()
        mock_async_client.post = AsyncMock(return_value=mock_resp)
        mock_get_client.return_value = mock_async_client

        resp = client.post(
            TRANSCRIBE_URL,
            headers=normal_user_token_headers,
            files={"audio": _audio_file()},
        )

    assert resp.status_code == 502
    assert resp.json()["detail"] == "Transcription service error"

    _cleanup(db)


# ---------------------------------------------------------------------------
# (d) Key set + httpx.ConnectError → 502
# ---------------------------------------------------------------------------

def test_transcribe_connect_error_returns_502(
    client: TestClient,
    db: Session,
    normal_user_token_headers: dict[str, str],
) -> None:
    _cleanup(db)
    _set_key(db)

    with patch(
        "app.api.routes.transcribe._get_http_client",
    ) as mock_get_client:
        mock_async_client = AsyncMock()
        mock_async_client.post = AsyncMock(
            side_effect=httpx.ConnectError("connection refused")
        )
        mock_get_client.return_value = mock_async_client

        resp = client.post(
            TRANSCRIBE_URL,
            headers=normal_user_token_headers,
            files={"audio": _audio_file()},
        )

    assert resp.status_code == 502
    assert resp.json()["detail"] == "Transcription service error"

    _cleanup(db)


# ---------------------------------------------------------------------------
# (e) Oversized upload → 413
# ---------------------------------------------------------------------------

def test_transcribe_oversized_returns_413(
    client: TestClient,
    db: Session,
    normal_user_token_headers: dict[str, str],
) -> None:
    _cleanup(db)
    _set_key(db)

    # 26 MB — just over the 25 MB limit
    oversized_content = b"x" * (26 * 1024 * 1024)

    resp = client.post(
        TRANSCRIBE_URL,
        headers=normal_user_token_headers,
        files={"audio": ("big.wav", oversized_content, "audio/wav")},
    )

    assert resp.status_code == 413

    _cleanup(db)


# ---------------------------------------------------------------------------
# (f) Missing file field → 422
# ---------------------------------------------------------------------------

def test_transcribe_missing_file_returns_422(
    client: TestClient,
    normal_user_token_headers: dict[str, str],
) -> None:
    # Send form data without the 'audio' file field
    resp = client.post(
        TRANSCRIBE_URL,
        headers=normal_user_token_headers,
        data={"not_audio": "something"},
    )
    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# (g) Unauthenticated request → 401
# ---------------------------------------------------------------------------

def test_transcribe_unauthenticated_returns_401(client: TestClient) -> None:
    resp = client.post(
        TRANSCRIBE_URL,
        files={"audio": _audio_file()},
    )
    assert resp.status_code == 401
