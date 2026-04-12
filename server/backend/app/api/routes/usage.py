"""Usage tracking REST endpoints (COST-02).

GET /api/v1/usage/ -- paginated list of session-level usage records
GET /api/v1/usage/summary -- aggregate totals, per-node breakdown, daily chart data

Both endpoints filter by authenticated user_id (T-12-01: no cross-user data).
Period filtering: 7d/30d/90d/all with regex validation (T-12-02).
"""
import math
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import func
from sqlmodel import col, select

from app.api.deps import CurrentUser, SessionDep
from app.models import Node, SessionModel, UsageRecord

router = APIRouter(prefix="/usage", tags=["usage"])

PAGE_SIZE = 25


def _cutoff(period: str) -> datetime | None:
    """Map period string to a UTC cutoff datetime, or None for 'all'."""
    mapping = {"7d": 7, "30d": 30, "90d": 90}
    days = mapping.get(period)
    if days is None:
        return None
    return datetime.now(timezone.utc) - timedelta(days=days)


@router.get("/")
def list_usage(
    session: SessionDep,
    current_user: CurrentUser,
    period: str = Query(default="30d", pattern="^(7d|30d|90d|all)$"),
    page: int = Query(default=1, ge=1),
) -> dict:
    """Return paginated usage records for the authenticated user."""
    # Base query: join UsageRecord -> Session -> Node for node_name
    base = (
        select(
            UsageRecord.id,
            UsageRecord.session_id,
            UsageRecord.input_tokens,
            UsageRecord.output_tokens,
            UsageRecord.cost_usd,
            UsageRecord.duration_ms,
            UsageRecord.created_at,
            Node.name.label("node_name"),  # type: ignore[attr-defined]
        )
        .join(SessionModel, UsageRecord.session_id == SessionModel.id)
        .join(Node, SessionModel.node_id == Node.id)
        .where(UsageRecord.user_id == current_user.id)
    )

    cutoff = _cutoff(period)
    if cutoff is not None:
        base = base.where(col(UsageRecord.created_at) >= cutoff)

    # Count total
    count_stmt = select(func.count()).select_from(base.subquery())
    total = session.exec(count_stmt).one()

    # Paginate
    offset = (page - 1) * PAGE_SIZE
    data_stmt = base.order_by(col(UsageRecord.created_at).desc()).offset(offset).limit(PAGE_SIZE)
    rows = session.exec(data_stmt).all()

    total_pages = max(1, math.ceil(total / PAGE_SIZE))

    return {
        "data": [
            {
                "id": str(row.id),
                "session_id": str(row.session_id),
                "node_name": row.node_name,
                "input_tokens": row.input_tokens,
                "output_tokens": row.output_tokens,
                "cost_usd": row.cost_usd,
                "duration_ms": row.duration_ms,
                "created_at": row.created_at.isoformat() if row.created_at else None,
            }
            for row in rows
        ],
        "total": total,
        "page": page,
        "page_size": PAGE_SIZE,
        "total_pages": total_pages,
    }


@router.get("/summary")
def get_usage_summary(
    session: SessionDep,
    current_user: CurrentUser,
    period: str = Query(default="30d", pattern="^(7d|30d|90d|all)$"),
) -> dict:
    """Return aggregate usage totals, per-node breakdown, and daily chart data."""
    cutoff = _cutoff(period)

    # Build base filter
    base_filter = [UsageRecord.user_id == current_user.id]
    if cutoff is not None:
        base_filter.append(col(UsageRecord.created_at) >= cutoff)

    # 1. Total aggregates
    totals_stmt = select(
        func.coalesce(func.sum(UsageRecord.cost_usd), 0.0).label("total_cost_usd"),
        func.coalesce(func.sum(UsageRecord.input_tokens), 0).label("total_input_tokens"),
        func.coalesce(func.sum(UsageRecord.output_tokens), 0).label("total_output_tokens"),
        func.count(UsageRecord.id).label("total_sessions"),
    ).where(*base_filter)
    totals = session.exec(totals_stmt).one()

    # 2. Per-node breakdown
    node_stmt = (
        select(
            Node.id.label("node_id"),  # type: ignore[attr-defined]
            Node.name.label("node_name"),  # type: ignore[attr-defined]
            func.coalesce(func.sum(UsageRecord.cost_usd), 0.0).label("cost_usd"),
            func.count(UsageRecord.id).label("session_count"),
        )
        .join(SessionModel, UsageRecord.session_id == SessionModel.id)
        .join(Node, SessionModel.node_id == Node.id)
        .where(*base_filter)
        .group_by(Node.id, Node.name)
    )
    by_node = session.exec(node_stmt).all()

    # 3. Daily breakdown
    daily_stmt = (
        select(
            func.date(UsageRecord.created_at).label("date"),
            func.coalesce(func.sum(UsageRecord.cost_usd), 0.0).label("cost_usd"),
        )
        .where(*base_filter)
        .group_by(func.date(UsageRecord.created_at))
        .order_by(func.date(UsageRecord.created_at).asc())
    )
    daily = session.exec(daily_stmt).all()

    return {
        "total_cost_usd": float(totals.total_cost_usd),
        "total_input_tokens": int(totals.total_input_tokens),
        "total_output_tokens": int(totals.total_output_tokens),
        "total_sessions": int(totals.total_sessions),
        "by_node": [
            {
                "node_id": str(row.node_id),
                "node_name": row.node_name,
                "cost_usd": float(row.cost_usd),
                "session_count": int(row.session_count),
            }
            for row in by_node
        ],
        "daily": [
            {
                "date": str(row.date),
                "cost_usd": float(row.cost_usd),
            }
            for row in daily
        ],
    }


@router.get("/session/{session_id}")
def get_session_usage(
    session_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUser,
) -> dict:
    """Return usage record for a specific session. 404 if not found or not owned by user."""
    record = session.exec(
        select(UsageRecord).where(
            UsageRecord.session_id == session_id,
            UsageRecord.user_id == current_user.id,
        )
    ).first()
    if not record:
        raise HTTPException(status_code=404, detail="Usage record not found")
    return {
        "id": str(record.id),
        "session_id": str(record.session_id),
        "input_tokens": record.input_tokens,
        "output_tokens": record.output_tokens,
        "cost_usd": record.cost_usd,
        "duration_ms": record.duration_ms,
        "created_at": record.created_at.isoformat() if record.created_at else None,
    }
