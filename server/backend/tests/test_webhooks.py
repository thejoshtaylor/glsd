"""Tests for POST /webhooks/github — R036, R038, R039."""
import hashlib
import hmac
import json
import uuid
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app

_SECRET = "test-webhook-secret"

_PULL_REQUEST_REVIEW_PAYLOAD = {
    "action": "submitted",
    "repository": {"full_name": "owner/repo"},
    "review": {"state": "approved"},
}


def _make_sig(body: bytes, secret: str = _SECRET) -> str:
    return "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


@pytest.fixture(scope="module")
def webhook_client():
    with TestClient(app) as c:
        yield c


@pytest.fixture(autouse=True)
def _patch_secret(monkeypatch):
    """Force GITHUB_WEBHOOK_SECRET to a known value for all tests."""
    monkeypatch.setattr(
        "app.api.routes.webhooks.settings",
        type("S", (), {"GITHUB_WEBHOOK_SECRET": _SECRET})(),
    )


class TestSignatureVerification:
    def test_valid_signature_returns_200(self, webhook_client: TestClient):
        """R036 + R039: valid sig → 200, evaluate_triggers dispatched via create_task."""
        body = json.dumps(_PULL_REQUEST_REVIEW_PAYLOAD).encode()
        sig = _make_sig(body)

        with patch(
            "app.api.routes.webhooks._resolve_project_ids",
            return_value=[uuid.uuid4()],
        ), patch(
            "app.api.routes.webhooks.evaluate_triggers",
            new_callable=AsyncMock,
        ) as mock_eval:
            resp = webhook_client.post(
                "/webhooks/github",
                content=body,
                headers={
                    "X-Hub-Signature-256": sig,
                    "X-GitHub-Event": "pull_request_review",
                    "Content-Type": "application/json",
                },
            )

        assert resp.status_code == 200
        # evaluate_triggers is wrapped in asyncio.create_task so it may not have
        # been awaited yet within the synchronous TestClient context, but it must
        # have been called at least once (create_task schedules the coroutine).
        mock_eval.assert_called_once()

    def test_invalid_signature_returns_401(self, webhook_client: TestClient):
        """R036: corrupted sig → 401, body never processed."""
        body = json.dumps(_PULL_REQUEST_REVIEW_PAYLOAD).encode()

        with patch(
            "app.api.routes.webhooks.evaluate_triggers",
            new_callable=AsyncMock,
        ) as mock_eval:
            resp = webhook_client.post(
                "/webhooks/github",
                content=body,
                headers={
                    "X-Hub-Signature-256": "sha256=deadbeef",
                    "X-GitHub-Event": "pull_request_review",
                    "Content-Type": "application/json",
                },
            )

        assert resp.status_code == 401
        mock_eval.assert_not_called()

    def test_missing_signature_returns_401(self, webhook_client: TestClient):
        """R036: no X-Hub-Signature-256 header → 401."""
        body = json.dumps(_PULL_REQUEST_REVIEW_PAYLOAD).encode()

        with patch(
            "app.api.routes.webhooks.evaluate_triggers",
            new_callable=AsyncMock,
        ) as mock_eval:
            resp = webhook_client.post(
                "/webhooks/github",
                content=body,
                headers={
                    "X-GitHub-Event": "pull_request_review",
                    "Content-Type": "application/json",
                },
            )

        assert resp.status_code == 401
        mock_eval.assert_not_called()


class TestEventMapping:
    def test_unknown_event_returns_200_no_trigger(self, webhook_client: TestClient):
        """Unknown X-GitHub-Event → 200, evaluate_triggers NOT called."""
        body = json.dumps({"action": "edited"}).encode()
        sig = _make_sig(body)

        with patch(
            "app.api.routes.webhooks.evaluate_triggers",
            new_callable=AsyncMock,
        ) as mock_eval:
            resp = webhook_client.post(
                "/webhooks/github",
                content=body,
                headers={
                    "X-Hub-Signature-256": sig,
                    "X-GitHub-Event": "gollum",
                    "Content-Type": "application/json",
                },
            )

        assert resp.status_code == 200
        mock_eval.assert_not_called()


class TestUrlNormalization:
    """R038: HTTPS and SSH GitHub URLs normalize to owner/repo slug."""

    def test_https_url_normalized(self):
        from app.api.routes.webhooks import _extract_slug

        assert _extract_slug("https://github.com/owner/repo.git") == "owner/repo"

    def test_ssh_url_normalized(self):
        from app.api.routes.webhooks import _extract_slug

        assert _extract_slug("git@github.com:owner/repo.git") == "owner/repo"

    def test_https_url_without_git_suffix(self):
        from app.api.routes.webhooks import _extract_slug

        assert _extract_slug("https://github.com/owner/repo") == "owner/repo"

    def test_invalid_url_returns_none(self):
        from app.api.routes.webhooks import _extract_slug

        assert _extract_slug("not-a-github-url") is None
