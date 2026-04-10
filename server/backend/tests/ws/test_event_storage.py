"""Event storage and ack timing test stubs for SESS-06, RELY-03.

Marked xfail until Plans 03-04 implement event persistence.
"""
import pytest
from fastapi.testclient import TestClient


@pytest.mark.xfail(reason="Plan 03-04 not yet implemented", strict=False)
def test_stream_event_persisted(client: TestClient) -> None:
    """RELY-03 / D-08: stream event written to session_events table."""
    pass


@pytest.mark.xfail(reason="Plan 03-04 not yet implemented", strict=False)
def test_event_persisted_before_ack(client: TestClient) -> None:
    """D-10: ack sent AFTER DB write confirms -- event exists when ack received."""
    pass


@pytest.mark.xfail(reason="Plan 03-04 not yet implemented", strict=False)
def test_control_events_stored(client: TestClient) -> None:
    """D-08: taskStarted, taskComplete, taskError all create session_event rows."""
    pass


@pytest.mark.xfail(reason="Plan 03-04 not yet implemented", strict=False)
def test_multiple_sessions_event_isolation(client: TestClient) -> None:
    """SESS-06: Events for two sessions on same node stored independently."""
    pass
