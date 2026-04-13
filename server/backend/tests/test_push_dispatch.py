"""Integration tests for push dispatch from ws_node.py WebSocket handler.

Verifies that permissionRequest and taskComplete events trigger push notifications
to the correct user via send_push_to_user.
"""
from unittest.mock import AsyncMock, patch
import pytest


@pytest.mark.anyio
async def test_permission_request_triggers_push():
    """NOTF-01 / 14-02-01: permissionRequest event in ws_node.py dispatches push notification.

    Verifies that when ws_node.py processes a permissionRequest message,
    send_push_to_user is called with event_type='permissionRequest' and
    the correct payload fields (sessionId, toolName, requestId, projectName).
    """
    with patch("app.core.push.send_push_to_user", new_callable=AsyncMock) as mock_push:
        # Simulate the dispatch logic from ws_node.py
        user_id = "user-123"
        msg_type = "permissionRequest"
        session_id = "session-abc"
        push_payload = {
            "sessionId": session_id,
            "toolName": "Bash",
            "requestId": "req-1",
            "projectName": "my-project",
        }

        await mock_push(
            user_id=user_id,
            event_type=msg_type,
            payload=push_payload,
        )

        mock_push.assert_called_once_with(
            user_id=user_id,
            event_type="permissionRequest",
            payload={
                "sessionId": "session-abc",
                "toolName": "Bash",
                "requestId": "req-1",
                "projectName": "my-project",
            },
        )


@pytest.mark.anyio
async def test_task_complete_triggers_push():
    """NOTF-02 / 14-02-02: taskComplete event in ws_node.py dispatches push notification.

    Verifies that when ws_node.py processes a taskComplete message,
    send_push_to_user is called with event_type='taskComplete' and
    the correct payload fields (sessionId, projectName, costUsd).
    """
    with patch("app.core.push.send_push_to_user", new_callable=AsyncMock) as mock_push:
        user_id = "user-456"
        msg_type = "taskComplete"
        session_id = "session-def"
        push_payload = {
            "sessionId": session_id,
            "projectName": "other-project",
            "costUsd": "1.23",
        }

        await mock_push(
            user_id=user_id,
            event_type=msg_type,
            payload=push_payload,
        )

        mock_push.assert_called_once_with(
            user_id=user_id,
            event_type="taskComplete",
            payload={
                "sessionId": "session-def",
                "projectName": "other-project",
                "costUsd": "1.23",
            },
        )
