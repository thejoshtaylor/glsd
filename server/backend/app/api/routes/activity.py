"""Activity feed endpoints: REST initial load + SSE live stream.

D-08: Event types shown: task, taskComplete, taskError, permissionRequest,
question, session_created, session_stopped. Raw stream deltas excluded.
D-09: SSE at GET /api/v1/activity/stream, independent of session WS.
"""
import asyncio
import json
import logging

from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse
from sqlmodel import col, select

from app.api.deps import CurrentUser, SessionDep
from app.models import SessionEvent, SessionModel, UsageRecord
from app.relay.broadcaster import ACTIVITY_EVENT_TYPES, broadcaster

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/activity", tags=["activity"])


@router.get("")
def get_activity(
    current_user: CurrentUser,
    session: SessionDep,
    limit: int = Query(default=50, le=200, ge=1),
) -> list[dict]:
    """Return recent activity events for the authenticated user's sessions.
    Filters to D-08 event types only."""
    user_sessions = session.exec(
        select(SessionModel.id).where(
            SessionModel.user_id == current_user.id
        )
    ).all()
    if not user_sessions:
        return []
    events = session.exec(
        select(SessionEvent)
        .where(col(SessionEvent.session_id).in_(user_sessions))
        .where(col(SessionEvent.event_type).in_(ACTIVITY_EVENT_TYPES))
        .order_by(col(SessionEvent.created_at).desc())
        .limit(limit)
    ).all()
    # Collect session_ids of taskComplete events for usage enrichment (D-09)
    tc_session_ids = [
        e.session_id for e in events if e.event_type == "taskComplete"
    ]
    usage_by_session: dict = {}
    if tc_session_ids:
        usage_rows = session.exec(
            select(UsageRecord).where(
                col(UsageRecord.session_id).in_(tc_session_ids)
            )
        ).all()
        for ur in usage_rows:
            usage_by_session[ur.session_id] = ur

    result = []
    for e in events:
        item: dict = {
            "session_id": str(e.session_id),
            "sequence_number": e.sequence_number,
            "event_type": e.event_type,
            "payload": e.payload,
            "created_at": e.created_at.isoformat() if e.created_at else None,
        }
        # Enrich taskComplete items with cost data from usage_record
        if e.event_type == "taskComplete" and e.session_id in usage_by_session:
            ur = usage_by_session[e.session_id]
            item["input_tokens"] = ur.input_tokens
            item["output_tokens"] = ur.output_tokens
            item["cost_usd"] = ur.cost_usd
            item["duration_ms"] = ur.duration_ms
        result.append(item)
    return result


@router.get("/stream")
async def activity_stream(current_user: CurrentUser) -> StreamingResponse:
    """SSE stream of live activity events for the authenticated user."""
    queue = await broadcaster.subscribe(str(current_user.id))

    async def generate():
        try:
            while True:
                event = await queue.get()
                data = json.dumps(event)
                yield f"data: {data}\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            broadcaster.unsubscribe(queue)

    return StreamingResponse(generate(), media_type="text/event-stream")
