"""Node daemon WebSocket endpoint.

Daemon connects at /ws/node?token=<pairing_token>&machineId=<id>
Flow: accept -> receive hello -> verify token -> register in ConnectionManager ->
      update DB (connected_at) -> send welcome -> message loop

Per RESEARCH Pitfall 2: use fresh Session(engine) per DB operation.
Per RESEARCH Pitfall 3: accept token from query param (daemon builds it into URL).
"""
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import ValidationError
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
    await websocket.accept()

    # 1. Extract token from query params
    token = websocket.query_params.get("token", "")
    if not token:
        # Fallback: check Authorization header
        auth = websocket.headers.get("authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        await websocket.close(code=1008, reason="Missing authentication")
        return

    # 2. Wait for hello message (first frame per PROTOCOL.md)
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

    # 3. Verify token against DB (fresh session per Pitfall 2)
    with DBSession(engine) as db:
        node = crud.verify_node_token(session=db, token=token)
        if not node:
            await websocket.close(code=1008, reason="Invalid token")
            return

        # 4. Update node with hello metadata
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

    # 5. Register in ConnectionManager
    await manager.register_node(machine_id, user_id, websocket)

    # 6. Build welcome message with acked sequences
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

    # 7. Message loop
    try:
        while True:
            msg = await websocket.receive_json()
            msg_type = msg.get("type")

            if msg_type == "heartbeat":
                # D-12: update last_seen in DB
                with DBSession(engine) as db:
                    n = db.exec(
                        select(Node).where(Node.machine_id == machine_id)
                    ).first()
                    if n:
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

                # Persist event if it has a sequence number
                session_id = msg.get("sessionId")
                seq = msg.get("sequenceNumber")
                if session_id and seq is not None:
                    with DBSession(engine) as db:
                        event = SessionEvent(
                            session_id=session_id,
                            sequence_number=seq,
                            event_type=msg_type,
                            payload=msg,
                        )
                        db.add(event)
                        db.commit()
                    # D-10: ack after DB write confirms
                    await websocket.send_json(
                        {
                            "type": "ack",
                            "sessionId": session_id,
                            "sequenceNumber": seq,
                        }
                    )

                # Update session status for lifecycle events
                if msg_type == "taskStarted" and session_id:
                    with DBSession(engine) as db:
                        crud.update_session_status(
                            session=db,
                            session_id=session_id,
                            status="running",
                            started_at=datetime.now(timezone.utc),
                        )
                elif msg_type == "taskComplete" and session_id:
                    with DBSession(engine) as db:
                        crud.update_session_status(
                            session=db,
                            session_id=session_id,
                            status="completed",
                            completed_at=datetime.now(timezone.utc),
                            claude_session_id=msg.get("claudeSessionId"),
                        )
                elif msg_type == "taskError" and session_id:
                    with DBSession(engine) as db:
                        crud.update_session_status(
                            session=db,
                            session_id=session_id,
                            status="error",
                            completed_at=datetime.now(timezone.utc),
                        )

            elif msg_type in ("browseDirResult", "readFileResult"):
                # Forward file browsing results to browser
                channel_id = msg.get("channelId", "")
                if channel_id:
                    await manager.send_to_browser(channel_id, msg)

    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.exception("Node WS error for machine_id=%s: %s", machine_id, e)
    finally:
        await manager.unregister_node(machine_id)
        with DBSession(engine) as db:
            n = db.exec(
                select(Node).where(Node.machine_id == machine_id)
            ).first()
            if n:
                n.disconnected_at = datetime.now(timezone.utc)
                db.add(n)
                db.commit()
