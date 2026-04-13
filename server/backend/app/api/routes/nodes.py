"""Node pairing REST endpoints.

D-01: Tokens are long-lived and revocable.
D-02: Token is revealed once on generation (like GitHub PATs).
D-03: Revocation is immediate disconnect -- server closes the WebSocket,
      marks token revoked, and sends taskError to all active browser sessions.
D-04: Tokens are scoped to a user account.
"""
import asyncio
import logging
import uuid as uuid_mod
from typing import Any

from fastapi import APIRouter, HTTPException, Query

from app import crud
from app.api.deps import CurrentUser, SessionDep, VerifiedOrGraceDep
from app.core.config import settings
from app.models import (
    NodeCodeRequest,
    NodeCodeResponse,
    NodeCreateRequest,
    NodePairResponse,
    NodePublic,
    NodesPublic,
)
from app.relay.connection_manager import manager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/nodes", tags=["nodes"])


@router.post("/", response_model=NodePairResponse)
def create_node_token(
    session: SessionDep,
    current_user: CurrentUser,
    body: NodeCreateRequest,
    _verified: VerifiedOrGraceDep,
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


@router.post("/code", response_model=NodeCodeResponse)
async def generate_pairing_code_endpoint(
    body: NodeCodeRequest, current_user: CurrentUser, _verified: VerifiedOrGraceDep
) -> Any:
    """Generate a 6-char pairing code stored in Redis with 10-min TTL."""
    from app.core.pairing import generate_pairing_code, get_redis, store_pairing_code

    r = await get_redis()
    if r is None:
        raise HTTPException(status_code=503, detail="Redis unavailable")
    for _ in range(3):  # retry on NX collision
        code = generate_pairing_code()
        stored = await store_pairing_code(r, code, str(current_user.id), body.name)
        if stored:
            return NodeCodeResponse(code=code)
    raise HTTPException(status_code=503, detail="Failed to generate unique code")


@router.get("/", response_model=NodesPublic)
def list_nodes(session: SessionDep, current_user: CurrentUser) -> Any:
    """List all nodes belonging to the current user. Token hash is never exposed."""
    nodes = crud.get_nodes_by_user(session=session, user_id=current_user.id)
    return NodesPublic(
        data=[NodePublic.model_validate(n) for n in nodes], count=len(nodes)
    )


@router.get("/{node_id}", response_model=NodePublic)
def get_node(
    node_id: str, session: SessionDep, current_user: CurrentUser
) -> Any:
    """Return a single node owned by the authenticated user.

    T-07-01: Returns 404 for both not-found and not-owned (no info leak).
    UUID parsing with try/except prevents SQL injection and gives clean 404.
    """
    try:
        nid = uuid_mod.UUID(node_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Node not found")
    node = crud.get_node_by_id(session=session, node_id=nid, user_id=current_user.id)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    return NodePublic.model_validate(node)


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
        # Find all sessions bound to this node before disconnecting.
        # Hold _lock for the entire read+snapshot block to avoid races with
        # concurrent bind/unbind operations on the same in-memory state.
        async with manager._lock:
            active_session_ids = [
                sid for sid, mid in manager._session_to_node.items()
                if mid == node.machine_id
            ]
            browser_snapshot = dict(manager._browsers)

        # Send taskError to each browser channel with active sessions on this node
        for sid in active_session_ids:
            for channel_id, browser_conn in list(browser_snapshot.items()):
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


async def _get_owned_online_node(
    node_id: str, session: Any, current_user: Any
) -> Any:
    """Shared helper: look up node by id, verify ownership and online status.

    Returns the Node ORM object.
    Raises HTTPException on any failure (404, 400, 503).
    """
    try:
        nid = uuid_mod.UUID(node_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Node not found")

    node = crud.get_node_by_id(session=session, node_id=nid, user_id=current_user.id)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    if node.is_revoked:
        raise HTTPException(status_code=400, detail="Node is revoked")
    if not node.machine_id or not manager.is_node_online(str(node.machine_id)):
        raise HTTPException(status_code=503, detail="Node is offline")
    return node


@router.get("/{node_id}/fs")
async def browse_node_fs(
    node_id: str,
    session: SessionDep,
    current_user: CurrentUser,
    path: str = Query(default="/"),
) -> Any:
    """T-04-16/T-04-18: Proxy browseDir to node with 5s timeout.

    Path param comes from user; node ownership is validated before relay.
    asyncio.wait_for enforces 5s timeout (T-04-18 mitigated).
    """
    node = await _get_owned_online_node(node_id, session, current_user)
    machine_id = str(node.machine_id)

    request_id = str(uuid_mod.uuid4())
    msg = {
        "type": "browseDir",
        "requestId": request_id,
        "channelId": request_id,  # use requestId as channelId for one-shot request-response
        "machineId": machine_id,
        "path": path,
    }

    future = manager.register_response(request_id)
    sent = await manager.send_to_node(machine_id, msg)
    if not sent:
        manager.resolve_response(request_id, {})  # clean up
        raise HTTPException(status_code=503, detail="Node is offline")

    try:
        result = await asyncio.wait_for(future, timeout=5.0)
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="Node did not respond")

    if not result.get("ok", False):
        raise HTTPException(
            status_code=400, detail=result.get("error", "Browse failed")
        )
    return {"entries": result.get("entries", [])}


@router.get("/{node_id}/file")
async def read_node_file(
    node_id: str,
    session: SessionDep,
    current_user: CurrentUser,
    path: str = Query(...),
) -> Any:
    """T-04-17/T-04-18: Proxy readFile to node with 5s timeout.

    File content is returned as plain text in a JSON envelope.
    """
    node = await _get_owned_online_node(node_id, session, current_user)
    machine_id = str(node.machine_id)

    request_id = str(uuid_mod.uuid4())
    msg = {
        "type": "readFile",
        "requestId": request_id,
        "channelId": request_id,
        "machineId": machine_id,
        "path": path,
    }

    future = manager.register_response(request_id)
    sent = await manager.send_to_node(machine_id, msg)
    if not sent:
        manager.resolve_response(request_id, {})  # clean up
        raise HTTPException(status_code=503, detail="Node is offline")

    try:
        result = await asyncio.wait_for(future, timeout=5.0)
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="Node did not respond")

    if not result.get("ok", False):
        raise HTTPException(
            status_code=400, detail=result.get("error", "Read failed")
        )
    return {
        "content": result.get("content", ""),
        "truncated": result.get("truncated", False),
    }
