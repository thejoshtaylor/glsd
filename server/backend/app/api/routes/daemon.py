"""Daemon pairing endpoint.

CRITICAL: Route path is /api/daemon/pair -- NOT under /api/v1.
The daemon client hardcodes this path in pair.go:52.
"""
import logging
import uuid
from typing import Any

from fastapi import APIRouter, HTTPException
from sqlmodel import select as sql_select

from app import crud
from app.api.deps import SessionDep
from app.core.config import settings
from app.core.pairing import consume_code
from app.models import DaemonPairRequest, DaemonPairResponse, Node

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/daemon", tags=["daemon"])


@router.post("/pair", response_model=DaemonPairResponse)
async def daemon_pair(body: DaemonPairRequest, session: SessionDep) -> Any:
    """Exchange a valid pairing code for node credentials.

    T-15-01: Code brute-force mitigated by 34-char alphabet + 10min TTL.
    T-15-02: Input validated via Pydantic. Code uppercased server-side.
    T-15-03: Returns 404 for both nonexistent and expired codes (no info leak).
    T-15-06: user_id comes from pairing store, not from daemon request.
    """
    pair_data = await consume_code(body.code.upper())
    if pair_data is None:
        raise HTTPException(status_code=404, detail="Invalid or expired code")

    user_id = uuid.UUID(pair_data["user_id"])
    node, raw_token = crud.create_node_token(
        session=session, user_id=user_id, name=pair_data["node_name"]
    )

    # If another node already holds this machine_id (e.g. a previously revoked
    # node), clear it first to avoid the unique constraint on re-pair.
    existing = session.exec(
        sql_select(Node).where(
            Node.machine_id == body.hostname,
            Node.id != node.id,
        )
    ).first()
    if existing is not None:
        existing.machine_id = None
        session.add(existing)
        session.flush()

    node.machine_id = body.hostname
    node.os = body.os
    node.arch = body.arch
    node.daemon_version = body.daemonVersion
    session.add(node)
    session.commit()
    session.refresh(node)

    # Build relay URL
    relay_url = "/ws/node"
    if hasattr(settings, "FRONTEND_HOST") and settings.FRONTEND_HOST:
        try:
            from urllib.parse import urlparse

            parsed = urlparse(settings.FRONTEND_HOST)
            host = parsed.hostname or "localhost"
            scheme = "wss" if parsed.scheme == "https" else "ws"
            port_part = (
                f":{parsed.port}"
                if parsed.port and parsed.port not in (80, 443)
                else ""
            )
            relay_url = f"{scheme}://{host}{port_part}/ws/node"
        except Exception:
            relay_url = "/ws/node"

    return DaemonPairResponse(
        machineId=str(node.id),
        authToken=raw_token,
        relayUrl=relay_url,
    )
