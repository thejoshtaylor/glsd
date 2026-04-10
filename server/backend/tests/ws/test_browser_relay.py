"""Browser WebSocket relay test stubs for RELY-02, RELY-03.

Marked xfail until Plan 04 implements the browser WebSocket endpoint.
"""
import pytest
from fastapi.testclient import TestClient


@pytest.mark.xfail(reason="Plan 04 not yet implemented", strict=False)
def test_browser_ws_jwt_auth(client: TestClient) -> None:
    """RELY-03 / D-06: Browser WS with valid JWT connects; invalid JWT rejected."""
    with pytest.raises(Exception):
        with client.websocket_connect("/ws/browser?token=invalid&channelId=ch1") as ws:
            pass


@pytest.mark.xfail(reason="Plan 04 not yet implemented", strict=False)
def test_browser_ws_missing_channel_id(client: TestClient) -> None:
    """RELY-03: Browser WS with missing channelId gets close(1008)."""
    with pytest.raises(Exception):
        with client.websocket_connect("/ws/browser?token=sometoken") as ws:
            pass


@pytest.mark.xfail(reason="Plan 04 not yet implemented", strict=False)
def test_browser_ws_task_validates_session_ownership(client: TestClient) -> None:
    """RELY-02: Task message for session NOT owned by user returns error."""
    pass


@pytest.mark.xfail(reason="Plan 04 not yet implemented", strict=False)
def test_browser_ws_task_forwarding(client: TestClient) -> None:
    """RELY-02: Task message is forwarded to correct node via channelId."""
    pass


@pytest.mark.xfail(reason="Plan 04 not yet implemented", strict=False)
def test_multiple_sessions_same_node(client: TestClient) -> None:
    """SESS-06: Multiple sessions on same node route independently."""
    pass
