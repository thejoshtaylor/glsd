"""Browser WebSocket endpoint for relay message routing.

D-06: Browser authenticates via JWT in query param: ws://.../ws/browser?token=<jwt>&channelId=<id>
D-05: Browser sends task messages for sessions already created via REST.
D-07: Stop messages forwarded to daemon; no optimistic status update.

Message routing:
- Browser -> server: task, stop, permissionResponse, questionResponse
- Server -> browser: stream, taskStarted, taskComplete, taskError, permissionRequest, question
- Routing key: channelId (browser) <-> sessionId (maps to node via ConnectionManager)
"""
import logging
import uuid as uuid_mod

import jwt as pyjwt
from jwt.exceptions import InvalidTokenError

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlmodel import Session as DBSession

from app.core.config import settings
from app.core import security
from app.core.db import engine
from app.models import User, SessionModel, Node
from app.relay.connection_manager import manager

logger = logging.getLogger(__name__)
router = APIRouter()


@router.websocket("/ws/browser")
async def ws_browser(websocket: WebSocket) -> None:
    # 1. Extract and validate JWT BEFORE accept (D-06, T-04-02, Pitfall 1)
    # Read from cookie first (D-04), fallback to query param for migration
    token = websocket.cookies.get("access_token", "")
    if not token:
        token = websocket.query_params.get("token", "")
    channel_id = websocket.query_params.get("channelId", "")

    if not token or not channel_id:
        await websocket.close(code=1008, reason="Missing token or channelId")
        return

    try:
        payload = pyjwt.decode(
            token, settings.SECRET_KEY, algorithms=[security.ALGORITHM]
        )
        user_id = payload.get("sub")
        if not user_id:
            await websocket.close(code=1008, reason="Invalid token payload")
            return
    except InvalidTokenError:
        await websocket.close(code=1008, reason="Invalid or expired token")
        return

    # Verify user exists and is active
    with DBSession(engine) as db:
        user = db.get(User, user_id)
        if not user or not user.is_active:
            await websocket.close(code=1008, reason="User not found or inactive")
            return

    # 2. Accept connection and register
    await websocket.accept()
    await manager.register_browser(channel_id, user_id, websocket)

    # 3. Message loop
    try:
        while True:
            msg = await websocket.receive_json()
            msg_type = msg.get("type")

            if msg_type == "task":
                # D-05: Validate session exists and belongs to user
                session_id = msg.get("sessionId")
                if not session_id:
                    await websocket.send_json(
                        {"type": "error", "error": "Missing sessionId"}
                    )
                    continue

                with DBSession(engine) as db:
                    try:
                        sid = uuid_mod.UUID(session_id)
                    except ValueError:
                        await websocket.send_json(
                            {"type": "error", "error": "Invalid sessionId"}
                        )
                        continue
                    sess = db.get(SessionModel, sid)
                    if not sess or str(sess.user_id) != user_id:
                        await websocket.send_json(
                            {"type": "error", "error": "Session not found"}
                        )
                        continue
                    node = db.get(Node, sess.node_id)
                    if not node or not node.machine_id:
                        await websocket.send_json(
                            {"type": "error", "error": "Node not connected"}
                        )
                        continue
                    machine_id = node.machine_id

                # T-03-19: Overwrite channelId to prevent spoofing
                msg["channelId"] = channel_id

                # Bind session to node in ConnectionManager for reverse routing
                manager.bind_session_to_node(session_id, machine_id)

                # Forward to node
                sent = await manager.send_to_node(machine_id, msg)
                if not sent:
                    await websocket.send_json(
                        {"type": "error", "error": "Node offline"}
                    )

            elif msg_type == "stop":
                # D-07: Forward stop to node
                session_id = msg.get("sessionId")
                if not session_id:
                    continue
                msg["channelId"] = channel_id
                machine_id = manager.get_node_for_session(session_id)
                if machine_id:
                    await manager.send_to_node(machine_id, msg)

            elif msg_type in ("permissionResponse", "questionResponse"):
                # Forward interactive responses to daemon
                session_id = msg.get("sessionId")
                if not session_id:
                    continue
                msg["channelId"] = channel_id
                machine_id = manager.get_node_for_session(session_id)
                if machine_id:
                    await manager.send_to_node(machine_id, msg)

            else:
                logger.warning("Unknown browser message type: %s", msg_type)

    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.exception("Browser WS error for channel=%s: %s", channel_id, e)
    finally:
        await manager.unregister_browser(channel_id)
