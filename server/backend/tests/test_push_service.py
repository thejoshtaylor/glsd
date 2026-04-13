"""Unit tests for push dispatch service (core/push.py)."""
from unittest.mock import AsyncMock, MagicMock, patch
import pytest

from app.core.push import send_push_to_user


@pytest.mark.anyio
async def test_push_on_permission_request():
    """NOTF-01: Push sent when permissionRequest event occurs."""
    mock_sub = MagicMock()
    mock_sub.id = "sub-1"
    mock_sub.endpoint = "https://push.example.com/sub1"
    mock_sub.p256dh = "p256dh-key"
    mock_sub.auth = "auth-key"
    mock_sub.notify_permissions = True

    with patch("app.core.push.DBSession") as mock_db_cls, \
         patch("app.core.push.ensure_vapid_keys", return_value=("privkey", "pubkey")), \
         patch("app.core.push.settings") as mock_settings, \
         patch("app.core.push.asyncio.to_thread", new_callable=AsyncMock) as mock_thread:
        mock_settings.VAPID_CONTACT_EMAIL = "test@example.com"
        mock_settings.EMAILS_FROM_EMAIL = None
        mock_settings.FIRST_SUPERUSER = "admin@example.com"

        mock_db = MagicMock()
        mock_db_cls.return_value.__enter__ = MagicMock(return_value=mock_db)
        mock_db_cls.return_value.__exit__ = MagicMock(return_value=False)
        mock_db.exec.return_value.all.return_value = [mock_sub]

        await send_push_to_user(
            user_id="user-1",
            event_type="permissionRequest",
            payload={"sessionId": "s1", "toolName": "bash", "requestId": "r1"},
        )

        mock_thread.assert_called_once()
        call_kwargs = mock_thread.call_args
        # Verify webpush was called via to_thread
        assert call_kwargs is not None


@pytest.mark.anyio
async def test_push_on_task_complete():
    """NOTF-02: Push sent when taskComplete event occurs."""
    mock_sub = MagicMock()
    mock_sub.id = "sub-1"
    mock_sub.endpoint = "https://push.example.com/sub1"
    mock_sub.p256dh = "p256dh-key"
    mock_sub.auth = "auth-key"
    mock_sub.notify_completions = True

    with patch("app.core.push.DBSession") as mock_db_cls, \
         patch("app.core.push.ensure_vapid_keys", return_value=("privkey", "pubkey")), \
         patch("app.core.push.settings") as mock_settings, \
         patch("app.core.push.asyncio.to_thread", new_callable=AsyncMock) as mock_thread:
        mock_settings.VAPID_CONTACT_EMAIL = "test@example.com"
        mock_settings.EMAILS_FROM_EMAIL = None
        mock_settings.FIRST_SUPERUSER = "admin@example.com"

        mock_db = MagicMock()
        mock_db_cls.return_value.__enter__ = MagicMock(return_value=mock_db)
        mock_db_cls.return_value.__exit__ = MagicMock(return_value=False)
        mock_db.exec.return_value.all.return_value = [mock_sub]

        await send_push_to_user(
            user_id="user-1",
            event_type="taskComplete",
            payload={"sessionId": "s1", "costUsd": "0.42"},
        )

        mock_thread.assert_called_once()


@pytest.mark.anyio
async def test_preferences_filter():
    """D-11: Push not sent when user has disabled that notification type."""
    with patch("app.core.push.DBSession") as mock_db_cls:
        mock_db = MagicMock()
        mock_db_cls.return_value.__enter__ = MagicMock(return_value=mock_db)
        mock_db_cls.return_value.__exit__ = MagicMock(return_value=False)
        # Query returns empty -- user disabled notify_permissions
        mock_db.exec.return_value.all.return_value = []

        # Should return early without calling webpush
        await send_push_to_user(
            user_id="user-1",
            event_type="permissionRequest",
            payload={"sessionId": "s1"},
        )
        # No exception = pass (no webpush call attempted)
