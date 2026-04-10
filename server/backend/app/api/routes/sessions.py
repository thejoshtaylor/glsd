"""Session lifecycle REST endpoints.

D-05: Sessions created REST-first. Browser calls POST /api/v1/sessions,
server creates DB record, returns sessionId. Browser then opens WS.
D-07: Session stop is forward-only. Server forwards stop to daemon via WS.
"""
import uuid as uuid_mod
from typing import Any

from fastapi import APIRouter, HTTPException

from app import crud
from app.api.deps import CurrentUser, SessionDep
from app.models import Node, SessionCreateRequest, SessionPublic, SessionsPublic
from app.relay.connection_manager import manager

router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.post("/", response_model=SessionPublic)
def create_session(
    session: SessionDep, current_user: CurrentUser, body: SessionCreateRequest
) -> Any:
    sess = crud.create_session(
        session=session,
        user_id=current_user.id,
        node_id=body.node_id,
        cwd=body.cwd,
    )
    if not sess:
        raise HTTPException(
            status_code=404, detail="Node not found or not owned by user"
        )
    return SessionPublic.model_validate(sess)


@router.get("/", response_model=SessionsPublic)
def list_sessions(session: SessionDep, current_user: CurrentUser) -> Any:
    sessions = crud.get_sessions_by_user(session=session, user_id=current_user.id)
    return SessionsPublic(
        data=[SessionPublic.model_validate(s) for s in sessions],
        count=len(sessions),
    )


@router.get("/{session_id}", response_model=SessionPublic)
def get_session(
    session_id: str, session: SessionDep, current_user: CurrentUser
) -> Any:
    try:
        sid = uuid_mod.UUID(session_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Session not found")
    sess = crud.get_session(session=session, session_id=sid)
    if not sess or sess.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Session not found")
    return SessionPublic.model_validate(sess)


@router.post("/{session_id}/stop", response_model=SessionPublic)
async def stop_session(
    session_id: str, session: SessionDep, current_user: CurrentUser
) -> Any:
    """D-07: Forward-only stop. Server sends stop to node via WS.
    DB status is NOT updated here -- it updates when taskComplete/taskError arrives."""
    try:
        sid = uuid_mod.UUID(session_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Session not found")
    sess = crud.get_session(session=session, session_id=sid)
    if not sess or sess.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Session not found")
    # Guard against stopping already-terminal sessions (WR-01)
    if sess.status in ("completed", "error"):
        raise HTTPException(status_code=409, detail="Session already completed")
    # Forward stop to node via ConnectionManager
    node = session.get(Node, sess.node_id)
    if node and node.machine_id:
        await manager.send_to_node(
            node.machine_id,
            {
                "type": "stop",
                "sessionId": str(sess.id),
                "channelId": "",  # channelId set by browser WS handler
            },
        )
    return SessionPublic.model_validate(sess)
