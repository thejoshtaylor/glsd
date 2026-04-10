"""Node daemon WebSocket endpoint.

Daemon connects at /ws/node?token=<pairing_token>&machineId=<id>
Flow: validate token -> accept -> receive hello -> register in ConnectionManager ->
      update DB (connected_at) -> send welcome -> message loop

Per RESEARCH Pitfall 2: use fresh Session(engine) per DB operation.
Per RESEARCH Pitfall 3: accept token from query param (daemon builds it into URL).
Per CR-02: token is validated BEFORE websocket.accept() to reject unauthenticated
callers before they can hold an open connection (mirrors ws_browser.py pattern).
Per WR-04: machine_id initialized before DB block so finally never NameErrors;
IntegrityError on machine_id unique constraint is caught and handled gracefully.
"""
import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import ValidationError
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session as DBSession, select

from app import crud
from app.core.db import engine
from app.models import Node, SessionEvent, SessionModel
from app.relay.connection_manager import manager
from app.relay.protocol import HelloMessage, WelcomeMessage

logger = logging.getLogger(__name__)
router = APIRouter()


@router.websocket("/ws/node")
async def ws_node(websocket: WebSocket) -> None:
    # 1. Extract token from query params BEFORE accepting (CR-02)
    token = websocket.query_params.get("token", "")
    if not token:
        # Fallback: check Authorization header
        auth = websocket.headers.get("authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        await websocket.close(code=1008, reason="Missing authentication")
        return

    # 2. Verify token against DB before accepting the connection (CR-02)
    with DBSession(engine) as db:
        node = crud.verify_node_token(session=db, token=token)
        if not node:
            await websocket.close(code=1008, reason="Invalid token")
            return
        # Capture node_id so we can re-fetch in a fresh session after accept
        node_id = node.id

    # 3. Token is valid — accept the connection
    await websocket.accept()

    # 4. Wait for hello message (first frame per PROTOCOL.md)
    try:
        raw = await websocket.receive_json()
    except Exception:
        await websocket.close(code=1008, reason="Expected hello message")
        return

    if raw.get("type") != "hello":
        await websocket.close(code=1008, reason="First message must be hello")
        return

    try:
        hello = HelloMessage.model_validate(raw)
    except ValidationError:
        await websocket.close(code=1008, reason="Invalid hello message")
        return

    # 5. Update node with hello metadata
    # machine_id defined before the DB block so the finally block never NameErrors (WR-04)
    machine_id = ""
    with DBSession(engine) as db:
        node = db.get(Node, node_id)
        if not node:
            await websocket.close(code=1008, reason="Node not found")
            return
        try:
            node.machine_id = hello.machine_id
            node.os = hello.os
            node.arch = hello.arch
            node.daemon_version = hello.daemon_version
            node.connected_at = datetime.now(timezone.utc)
            node.last_seen = datetime.now(timezone.utc)
            db.add(node)
            db.commit()
            db.refresh(node)
            user_id = str(node.user_id)
            machine_id = hello.machine_id
        except IntegrityError:
            db.rollback()
            await websocket.close(
                code=1008, reason="machine_id already registered to another token"
            )
            return

    # 6. Register in ConnectionManager
    await manager.register_node(machine_id, user_id, websocket)

    # 7. Build welcome message with acked sequences
    acked: dict[str, int] = {}
    with DBSession(engine) as db:
        # Find max sequence_number per session for this node's sessions
        statement = (
            select(SessionEvent.session_id, SessionEvent.sequence_number)
            .join(SessionModel, SessionEvent.session_id == SessionModel.id)
            .join(Node, SessionModel.node_id == Node.id)
            .where(Node.machine_id == machine_id)
        )
        rows = db.exec(statement).all()
        for session_id, seq in rows:
            sid = str(session_id)
            if sid not in acked or seq > acked[sid]:
                acked[sid] = seq

    welcome = WelcomeMessage(acked_sequences_by_session=acked)
    await websocket.send_json(welcome.model_dump(by_alias=True))

    # 8. Message loop
    msg_count = 0
    try:
        while True:
            msg = await websocket.receive_json()
            msg_type = msg.get("type")
            msg_count += 1

            if msg_type == "heartbeat":
                # D-12: update last_seen in DB; also check revocation as defense-in-depth
                # (WR-02: closes the race window between DB revoke and WS disconnect)
                with DBSession(engine) as db:
                    n = db.exec(
                        select(Node).where(Node.machine_id == machine_id)
                    ).first()
                    if n:
                        if n.is_revoked:
                            await websocket.close(code=1008, reason="Token revoked")
                            return
                        n.last_seen = datetime.now(timezone.utc)
                        db.add(n)
                        db.commit()

            elif msg_type in (
                "stream",
                "taskStarted",
                "taskComplete",
                "taskError",
                "permissionRequest",
                "question",
            ):
                # Forward to browser channel
                channel_id = msg.get("channelId", "")
                if channel_id:
                    await manager.send_to_browser(channel_id, msg)

                # Persist event if it has a session_id and sequence number (CR-03)
                session_id = msg.get("sessionId")
                seq = msg.get("sequenceNumber")
                if session_id and seq is not None:
                    # Validate session_id is a proper UUID (CR-03)
                    try:
                        sid_uuid = uuid.UUID(session_id)
                    except (ValueError, AttributeError):
                        logger.warning(
                            "Node %s sent invalid sessionId: %s", machine_id, session_id
                        )
                        continue  # skip persistence, do not ack

                    # Validate sequence_number is a non-negative integer (CR-03)
                    if not isinstance(seq, int) or seq < 0:
                        logger.warning(
                            "Node %s sent invalid sequenceNumber: %s", machine_id, seq
                        )
                        continue

                    with DBSession(engine) as db:
                        # Verify the session belongs to this node (CR-03: ownership check)
                        sess = db.exec(
                            select(SessionModel)
                            .join(Node, SessionModel.node_id == Node.id)
                            .where(SessionModel.id == sid_uuid)
                            .where(Node.machine_id == machine_id)
                        ).first()
                        if not sess:
                            logger.warning(
                                "Node %s attempted to write event for unowned session %s",
                                machine_id,
                                session_id,
                            )
                            continue  # do not ack; ownership denied

                        event = SessionEvent(
                            session_id=sid_uuid,
                            sequence_number=seq,
                            event_type=msg_type,
                            payload=msg,
                        )
                        db.add(event)
                        db.commit()
                    # D-10: ack only after successful DB write
                    await websocket.send_json(
                        {
                            "type": "ack",
                            "sessionId": session_id,
                            "sequenceNumber": seq,
                        }
                    )

                    # Update session status for lifecycle events
                    if msg_type == "taskStarted":
                        with DBSession(engine) as db:
                            crud.update_session_status(
                                session=db,
                                session_id=sid_uuid,
                                status="running",
                                started_at=datetime.now(timezone.utc),
                            )
                    elif msg_type == "taskComplete":
                        with DBSession(engine) as db:
                            crud.update_session_status(
                                session=db,
                                session_id=sid_uuid,
                                status="completed",
                                completed_at=datetime.now(timezone.utc),
                                claude_session_id=msg.get("claudeSessionId"),
                            )
                    elif msg_type == "taskError":
                        with DBSession(engine) as db:
                            crud.update_session_status(
                                session=db,
                                session_id=sid_uuid,
                                status="error",
                                completed_at=datetime.now(timezone.utc),
                            )

            elif msg_type in ("browseDirResult", "readFileResult"):
                # Resolve pending REST response future first (for /fs and /file endpoints)
                request_id = msg.get("requestId", "")
                if request_id:
                    manager.resolve_response(request_id, msg)
                # Also forward to browser channel if one is set
                channel_id = msg.get("channelId", "")
                if channel_id and channel_id != request_id:
                    await manager.send_to_browser(channel_id, msg)

    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.exception("Node WS error for machine_id=%s: %s", machine_id, e)
    finally:
        await manager.unregister_node(machine_id)
        if machine_id:
            with DBSession(engine) as db:
                n = db.exec(
                    select(Node).where(Node.machine_id == machine_id)
                ).first()
                if n:
                    n.disconnected_at = datetime.now(timezone.utc)
                    db.add(n)
                    db.commit()
