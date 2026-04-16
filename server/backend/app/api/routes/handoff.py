"""HandoffPair REST endpoints."""
import uuid
from datetime import datetime
from typing import Any, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlmodel import select

from app.api.deps import CurrentUser, SessionDep
from app.models import HandoffPair, Node

router = APIRouter()

VALID_SCHEDULES = ("milestone", "30min", "1hr")


class HandoffPairCreate(BaseModel):
    node_a_id: uuid.UUID
    node_b_id: uuid.UUID
    schedule: str
    branch_prefix: str = "glsd/handoff"


class HandoffPairUpdate(BaseModel):
    active_node_id: Optional[uuid.UUID] = None
    last_handoff_at: Optional[datetime] = None
    last_branch_ref: Optional[str] = None


@router.post("/", response_model=HandoffPair)
def create_handoff_pair(
    body: HandoffPairCreate,
    db: SessionDep,
    current_user: CurrentUser,
) -> Any:
    """Create a handoff pair between two nodes owned by the current user."""
    if body.schedule not in VALID_SCHEDULES:
        raise HTTPException(
            status_code=400,
            detail=f"schedule must be one of {VALID_SCHEDULES}",
        )
    node_a = db.exec(
        select(Node).where(Node.id == body.node_a_id, Node.user_id == current_user.id)
    ).first()
    if not node_a:
        raise HTTPException(status_code=404, detail="node_a not found or not owned")
    node_b = db.exec(
        select(Node).where(Node.id == body.node_b_id, Node.user_id == current_user.id)
    ).first()
    if not node_b:
        raise HTTPException(status_code=404, detail="node_b not found or not owned")

    pair = HandoffPair(
        user_id=current_user.id,
        node_a_id=body.node_a_id,
        node_b_id=body.node_b_id,
        schedule=body.schedule,
        branch_prefix=body.branch_prefix,
    )
    db.add(pair)
    db.commit()
    db.refresh(pair)
    return pair


@router.get("/", response_model=list[HandoffPair])
def list_handoff_pairs(
    db: SessionDep,
    current_user: CurrentUser,
) -> Any:
    """List all handoff pairs belonging to the current user."""
    return db.exec(
        select(HandoffPair).where(HandoffPair.user_id == current_user.id)
    ).all()


@router.patch("/{pair_id}", response_model=HandoffPair)
def update_handoff_pair(
    pair_id: uuid.UUID,
    body: HandoffPairUpdate,
    db: SessionDep,
    current_user: CurrentUser,
) -> Any:
    """Update mutable fields on a handoff pair."""
    pair = db.exec(
        select(HandoffPair).where(
            HandoffPair.id == pair_id,
            HandoffPair.user_id == current_user.id,
        )
    ).first()
    if not pair:
        raise HTTPException(status_code=404, detail="HandoffPair not found")

    if body.active_node_id is not None:
        pair.active_node_id = body.active_node_id
    if body.last_handoff_at is not None:
        pair.last_handoff_at = body.last_handoff_at
    if body.last_branch_ref is not None:
        pair.last_branch_ref = body.last_branch_ref

    db.add(pair)
    db.commit()
    db.refresh(pair)
    return pair


@router.delete("/{pair_id}")
def delete_handoff_pair(
    pair_id: uuid.UUID,
    db: SessionDep,
    current_user: CurrentUser,
) -> Any:
    """Delete a handoff pair."""
    pair = db.exec(
        select(HandoffPair).where(
            HandoffPair.id == pair_id,
            HandoffPair.user_id == current_user.id,
        )
    ).first()
    if not pair:
        raise HTTPException(status_code=404, detail="HandoffPair not found")

    db.delete(pair)
    db.commit()
    return {"ok": True}
