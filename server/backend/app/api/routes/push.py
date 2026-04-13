"""Push notification subscription management and permission respond endpoints.

Per D-08, D-09, D-10, D-11, D-13, NOTF-01.
"""
import logging

from fastapi import APIRouter, HTTPException
from fastapi.responses import PlainTextResponse
from sqlmodel import select

from app.api.deps import CurrentUser, SessionDep
from app.core.push import get_vapid_public_key
from app.models import (
    PushSubscription,
    PushSubscribeRequest,
    PushPreferencesUpdate,
    PushPermissionResponse,
)
from app.relay.connection_manager import manager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/push", tags=["push"])


@router.get("/vapid-key", response_class=PlainTextResponse)
def get_vapid_key(current_user: CurrentUser) -> str:
    """Return VAPID public key for PushManager.subscribe() applicationServerKey."""
    return get_vapid_public_key()


@router.post("/subscribe")
def subscribe(
    body: PushSubscribeRequest,
    session: SessionDep,
    current_user: CurrentUser,
) -> dict:
    """Subscribe to push notifications. Upserts by endpoint (D-13: one per device per user)."""
    existing = session.exec(
        select(PushSubscription)
        .where(PushSubscription.user_id == current_user.id)
        .where(PushSubscription.endpoint == body.endpoint)
    ).first()
    if existing:
        existing.p256dh = body.p256dh
        existing.auth = body.auth
        session.add(existing)
    else:
        sub = PushSubscription(
            user_id=current_user.id,
            endpoint=body.endpoint,
            p256dh=body.p256dh,
            auth=body.auth,
        )
        session.add(sub)
    session.commit()
    return {"status": "subscribed"}


@router.delete("/subscribe")
def unsubscribe(
    session: SessionDep,
    current_user: CurrentUser,
    endpoint: str | None = None,
) -> dict:
    """Unsubscribe from push notifications. If endpoint provided, remove that subscription; otherwise remove all."""
    stmt = select(PushSubscription).where(
        PushSubscription.user_id == current_user.id
    )
    if endpoint:
        stmt = stmt.where(PushSubscription.endpoint == endpoint)
    subs = session.exec(stmt).all()
    for sub in subs:
        session.delete(sub)
    session.commit()
    return {"status": "unsubscribed", "removed": len(subs)}


@router.patch("/preferences")
def update_preferences(
    body: PushPreferencesUpdate,
    session: SessionDep,
    current_user: CurrentUser,
) -> dict:
    """Update per-type notification preferences on all subscriptions (D-11)."""
    subs = session.exec(
        select(PushSubscription).where(
            PushSubscription.user_id == current_user.id
        )
    ).all()
    for sub in subs:
        if body.notify_permissions is not None:
            sub.notify_permissions = body.notify_permissions
        if body.notify_completions is not None:
            sub.notify_completions = body.notify_completions
        session.add(sub)
    session.commit()
    return {"status": "updated", "count": len(subs)}


@router.get("/subscriptions")
def list_subscriptions(
    session: SessionDep,
    current_user: CurrentUser,
) -> dict:
    """List current user's push subscriptions with preferences."""
    subs = session.exec(
        select(PushSubscription).where(
            PushSubscription.user_id == current_user.id
        )
    ).all()
    return {
        "subscriptions": [
            {
                "id": str(sub.id),
                "endpoint": sub.endpoint[:60] + "..."
                if len(sub.endpoint) > 60
                else sub.endpoint,
                "notify_permissions": sub.notify_permissions,
                "notify_completions": sub.notify_completions,
                "created_at": sub.created_at.isoformat()
                if sub.created_at
                else None,
            }
            for sub in subs
        ],
        "count": len(subs),
    }


@router.post("/respond")
async def push_permission_respond(
    body: PushPermissionResponse,
    current_user: CurrentUser,
) -> dict:
    """Service worker calls this with Bearer token from push payload (D-01, Pitfall 2).

    Routes permission response to the correct node via ConnectionManager.
    """
    machine_id = manager.get_node_for_session(body.session_id)
    if not machine_id:
        raise HTTPException(
            status_code=404, detail="Session not connected to any node"
        )
    msg = {
        "type": "permissionResponse",
        "sessionId": body.session_id,
        "requestId": body.request_id,
        "approved": body.approved,
    }
    sent = await manager.send_to_node(machine_id, msg)
    if not sent:
        raise HTTPException(status_code=502, detail="Node not connected")
    return {"status": "sent"}
