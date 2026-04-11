"""Tests for email error surfacing (FIX-03).

Tests the hardened send_email() function and the HTTP error surfacing
in the test-email endpoint.
"""
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings


# ---------------------------------------------------------------------------
# Unit tests: send_email() raises on error conditions
# ---------------------------------------------------------------------------


def test_send_email_raises_value_error_when_emails_disabled():
    """send_email() raises ValueError when settings.emails_enabled is False."""
    from app.utils import send_email

    # Patch the emails_enabled property at the settings module level
    with patch("app.utils.settings") as mock_settings:
        mock_settings.emails_enabled = False
        with pytest.raises(ValueError, match="not configured"):
            send_email(
                email_to="test@example.com",
                subject="Test",
                html_content="<p>Test</p>",
            )


def test_send_email_raises_runtime_error_on_smtp_failure():
    """send_email() raises RuntimeError when SMTP response status_code is 550."""
    from app.utils import send_email

    mock_response = MagicMock()
    mock_response.status_code = 550

    with patch("app.utils.settings") as mock_settings:
        mock_settings.emails_enabled = True
        mock_settings.EMAILS_FROM_NAME = "Test"
        mock_settings.EMAILS_FROM_EMAIL = "from@example.com"
        mock_settings.SMTP_HOST = "localhost"
        mock_settings.SMTP_PORT = 587
        mock_settings.SMTP_TLS = False
        mock_settings.SMTP_SSL = False
        mock_settings.SMTP_USER = None
        mock_settings.SMTP_PASSWORD = None
        with patch("app.utils.emails.Message") as MockMessage:
            MockMessage.return_value.send.return_value = mock_response
            with pytest.raises(RuntimeError, match="Email send failed"):
                send_email(
                    email_to="test@example.com",
                    subject="Test",
                    html_content="<p>Test</p>",
                )


def test_send_email_succeeds_on_smtp_250():
    """send_email() does not raise when SMTP response status_code is 250."""
    from app.utils import send_email

    mock_response = MagicMock()
    mock_response.status_code = 250

    with patch("app.utils.settings") as mock_settings:
        mock_settings.emails_enabled = True
        mock_settings.EMAILS_FROM_NAME = "Test"
        mock_settings.EMAILS_FROM_EMAIL = "from@example.com"
        mock_settings.SMTP_HOST = "localhost"
        mock_settings.SMTP_PORT = 587
        mock_settings.SMTP_TLS = False
        mock_settings.SMTP_SSL = False
        mock_settings.SMTP_USER = None
        mock_settings.SMTP_PASSWORD = None
        with patch("app.utils.emails.Message") as MockMessage:
            MockMessage.return_value.send.return_value = mock_response
            # Should not raise
            send_email(
                email_to="test@example.com",
                subject="Test",
                html_content="<p>Test</p>",
            )


def test_send_email_succeeds_on_smtp_251():
    """send_email() does not raise when SMTP response status_code is 251."""
    from app.utils import send_email

    mock_response = MagicMock()
    mock_response.status_code = 251

    with patch("app.utils.settings") as mock_settings:
        mock_settings.emails_enabled = True
        mock_settings.EMAILS_FROM_NAME = "Test"
        mock_settings.EMAILS_FROM_EMAIL = "from@example.com"
        mock_settings.SMTP_HOST = "localhost"
        mock_settings.SMTP_PORT = 587
        mock_settings.SMTP_TLS = False
        mock_settings.SMTP_SSL = False
        mock_settings.SMTP_USER = None
        mock_settings.SMTP_PASSWORD = None
        with patch("app.utils.emails.Message") as MockMessage:
            MockMessage.return_value.send.return_value = mock_response
            send_email(
                email_to="test@example.com",
                subject="Test",
                html_content="<p>Test</p>",
            )


def test_send_email_no_assert_statement():
    """Verify assert statement is replaced with explicit if-check (Pitfall 5)."""
    import inspect
    from app import utils

    source = inspect.getsource(utils.send_email)
    assert "assert settings.emails_enabled" not in source, (
        "assert statement must be replaced with explicit if-check "
        "(assert is stripped in Python -O mode)"
    )
    assert "if not settings.emails_enabled:" in source, (
        "Must use explicit if-check instead of assert"
    )


# ---------------------------------------------------------------------------
# Integration tests: /api/v1/utils/test-email/ endpoint HTTP error surfacing
# ---------------------------------------------------------------------------


def test_test_email_endpoint_returns_503_when_not_configured(
    client: TestClient, superuser_token_headers: dict
):
    """POST /api/v1/utils/test-email/ returns 503 when emails_enabled is False."""
    with patch("app.api.routes.utils.send_email") as mock_send:
        mock_send.side_effect = ValueError("Email sending is not configured on this server")
        r = client.post(
            f"{settings.API_V1_STR}/utils/test-email/",
            params={"email_to": "test@example.com"},
            headers=superuser_token_headers,
        )
    assert r.status_code == 503
    assert "configured" in r.json()["detail"].lower()


def test_test_email_endpoint_returns_502_when_send_fails(
    client: TestClient, superuser_token_headers: dict
):
    """POST /api/v1/utils/test-email/ returns 502 when SMTP send fails."""
    with patch("app.api.routes.utils.send_email") as mock_send:
        mock_send.side_effect = RuntimeError("Email send failed with status 550")
        r = client.post(
            f"{settings.API_V1_STR}/utils/test-email/",
            params={"email_to": "test@example.com"},
            headers=superuser_token_headers,
        )
    assert r.status_code == 502
    assert "failed" in r.json()["detail"].lower()
