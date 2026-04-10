"""Node pairing REST endpoints.

D-01: Tokens are long-lived and revocable.
D-02: Token is revealed once on generation (like GitHub PATs).
D-03: Revocation is immediate disconnect -- server closes the WebSocket,
      marks token revoked, and sends taskError to all active browser sessions.
D-04: Tokens are scoped to a user account.
"""
import logging
import uuid as uuid_mod
from typing import Any

from fastapi import APIRouter, HTTPException

from app import crud
from app.api.deps import CurrentUser, SessionDep
from app.core.config import settings
from app.models import NodeCreateRequest, NodePairResponse, NodePublic, NodesPublic
from app.relay.connection_manager import manager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/nodes", tags=["nodes"])


@router.post("/", response_model=NodePairResponse)
def create_node_token(
    session: SessionDep, current_user: CurrentUser, body: NodeCreateRequest
) -> Any:
    """Create a node pairing token. Token is returned once only (D-02)."""
    node, raw_token = crud.create_node_token(
        session=session, user_id=current_user.id, name=body.name
    )
    # Build relay URL -- use FRONTEND_HOST domain or fall back to path-only
    relay_url = "/ws/node"
    if hasattr(settings, "FRONTEND_HOST") and settings.FRONTEND_HOST:
        try:
            from urllib.parse import urlparse

            parsed = urlparse(settings.FRONTEND_HOST)
            host = parsed.hostname or "localhost"
            scheme = "wss" if parsed.scheme == "https" else "ws"
            port_part = f":{parsed.port}" if parsed.port and parsed.port not in (80, 443) else ""
            relay_url = f"{scheme}://{host}{port_part}/ws/node"
        except Exception:
            relay_url = "/ws/node"
    return NodePairResponse(
        node_id=node.id,
        token=raw_token,
        relay_url=relay_url,
    )


@router.get("/", response_model=NodesPublic)
def list_nodes(session: SessionDep, current_user: CurrentUser) -> Any:
    """List all nodes belonging to the current user. Token hash is never exposed."""
    nodes = crud.get_nodes_by_user(session=session, user_id=current_user.id)
    return NodesPublic(
        data=[NodePublic.model_validate(n) for n in nodes], count=len(nodes)
    )


@router.post("/{node_id}/revoke", response_model=NodePublic)
async def revoke_node(
    node_id: str, session: SessionDep, current_user: CurrentUser
) -> Any:
    """D-03: Revocation is immediate disconnect.

    1. Mark token revoked in DB
    2. Disconnect the node's WebSocket (close with 1008)
    3. Send taskError to all active browser sessions on this node
    """
    try:
        nid = uuid_mod.UUID(node_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Node not found")

    node = crud.revoke_node(session=session, node_id=nid, user_id=current_user.id)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")

    # D-03: If the node has a machine_id (was connected at some point),
    # disconnect its WebSocket and notify affected browser sessions
    if node.machine_id:
        # Find all sessions bound to this node before disconnecting
        active_session_ids = manager.get_sessions_for_node(node.machine_id)

        # Send taskError to each browser channel with active sessions on this node
        for sid in active_session_ids:
            for channel_id, browser_conn in list(manager._browsers.items()):
                try:
                    await browser_conn.websocket.send_json({
                        "type": "taskError",
                        "taskId": "",
                        "sessionId": sid,
                        "channelId": channel_id,
                        "error": "Node revoked",
                    })
                except Exception:
                    logger.warning(
                        "Failed to send taskError to channel %s", channel_id
                    )

            # Unbind the session from the node
            manager.unbind_session(sid)

        # Close the node's WebSocket connection
        await manager.disconnect_node(node.machine_id)

    return NodePublic.model_validate(node)
