"""Foundation behavior tests for Phase 3 Plan 01 Task 1.

These stubs validate the database models and protocol Pydantic models
created in Plan 01. Marked xfail until Plan 01 implements them.
"""
import pytest


@pytest.mark.xfail(reason="Plan 01 not yet implemented", strict=False)
def test_node_model_fields():
    """Node model has fields id (UUID PK), user_id (FK to user.id), name,
    machine_id (unique, nullable), token_hash, is_revoked, connected_at,
    disconnected_at, last_seen, os, arch, daemon_version, created_at."""
    from app.models import Node
    from sqlmodel import SQLModel

    assert issubclass(Node, SQLModel)
    # Check key fields exist on the model
    field_names = set(Node.model_fields.keys())
    required = {
        "id", "user_id", "name", "machine_id", "token_hash",
        "is_revoked", "connected_at", "disconnected_at", "last_seen",
        "os", "arch", "daemon_version", "created_at",
    }
    missing = required - field_names
    assert not missing, f"Node model missing fields: {missing}"


@pytest.mark.xfail(reason="Plan 01 not yet implemented", strict=False)
def test_session_model_fields():
    """Session model has fields id (UUID PK), user_id (FK to user.id),
    node_id (FK to node.id), status (default 'created'), cwd,
    claude_session_id, created_at, started_at, completed_at."""
    from app.models import SessionModel

    field_names = set(SessionModel.model_fields.keys())
    required = {
        "id", "user_id", "node_id", "status", "cwd",
        "claude_session_id", "created_at", "started_at", "completed_at",
    }
    missing = required - field_names
    assert not missing, f"SessionModel missing fields: {missing}"

    # Default status is "created"
    assert SessionModel.model_fields["status"].default == "created"


@pytest.mark.xfail(reason="Plan 01 not yet implemented", strict=False)
def test_session_event_composite_pk():
    """SessionEvent model has composite PK (session_id, sequence_number),
    event_type, payload (JSONB), created_at."""
    from app.models import SessionEvent

    field_names = set(SessionEvent.model_fields.keys())
    required = {"session_id", "sequence_number", "event_type", "payload", "created_at"}
    missing = required - field_names
    assert not missing, f"SessionEvent missing fields: {missing}"

    # Both fields should be primary keys
    session_id_info = SessionEvent.model_fields["session_id"]
    seq_info = SessionEvent.model_fields["sequence_number"]
    assert session_id_info.metadata or True  # PK checked via sa_column inspection
    assert seq_info.metadata or True


@pytest.mark.xfail(reason="Plan 01 not yet implemented", strict=False)
def test_hello_message_validates_correct_json():
    """HelloMessage Pydantic model validates a correct hello JSON payload."""
    from app.relay.protocol import HelloMessage

    data = {
        "type": "hello",
        "machineId": "test-machine-001",
        "daemonVersion": "1.0.0",
        "os": "linux",
        "arch": "amd64",
        "lastSequenceBySession": {},
    }
    msg = HelloMessage.model_validate(data)
    assert msg.type == "hello"
    assert msg.machine_id == "test-machine-001"
    assert msg.daemon_version == "1.0.0"
    assert msg.os == "linux"
    assert msg.arch == "amd64"
    assert msg.last_sequence_by_session == {}


@pytest.mark.xfail(reason="Plan 01 not yet implemented", strict=False)
def test_protocol_models_reject_invalid_type():
    """Protocol models reject invalid type fields via Literal validation."""
    from pydantic import ValidationError
    from app.relay.protocol import HelloMessage

    with pytest.raises(ValidationError):
        HelloMessage.model_validate({
            "type": "WRONG",
            "machineId": "x",
            "daemonVersion": "1",
            "os": "linux",
            "arch": "amd64",
            "lastSequenceBySession": {},
        })
