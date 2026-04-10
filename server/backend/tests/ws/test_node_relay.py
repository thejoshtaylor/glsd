"""Node daemon WebSocket test stubs for RELY-01, RELY-04.

Marked xfail until Plan 03 implements the WebSocket endpoint.
"""
import pytest
from fastapi.testclient import TestClient


@pytest.mark.xfail(reason="Plan 03 not yet implemented", strict=False)
def test_node_ws_no_token(client: TestClient) -> None:
    """RELY-01: Connect without token, expect close code 1008."""
    with pytest.raises(Exception):
        with client.websocket_connect("/ws/node") as ws:
            pass  # Should be closed by server


@pytest.mark.xfail(reason="Plan 03 not yet implemented", strict=False)
def test_node_ws_invalid_token(client: TestClient) -> None:
    """RELY-01: Connect with bad token, send hello, expect close."""
    with pytest.raises(Exception):
        with client.websocket_connect("/ws/node?token=invalid-token") as ws:
            ws.send_json({
                "type": "hello",
                "machineId": "test-machine",
                "daemonVersion": "1.0",
                "os": "linux",
                "arch": "amd64",
                "lastSequenceBySession": {},
            })


@pytest.mark.xfail(reason="Plan 03 not yet implemented", strict=False)
def test_node_ws_valid_hello_welcome(client: TestClient) -> None:
    """RELY-01: Valid token + hello receives welcome response."""
    # Requires a node with known raw token in DB
    # Plan 03 Task 2 will implement full test with token setup
    pass


@pytest.mark.xfail(reason="Plan 03 not yet implemented", strict=False)
def test_node_ws_heartbeat_updates_last_seen(client: TestClient) -> None:
    """RELY-04 / D-12: Heartbeat updates last_seen in DB."""
    pass
