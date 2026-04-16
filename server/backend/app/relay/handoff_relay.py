"""Relay routing for handoffReady and handoffAck protocol messages.

handoffReady: Node A signals it has pushed a checkpoint branch. Server
    validates node_a ownership, updates pair state, and forwards a
    handoffSignal to Node B.

handoffAck: Node B signals it has received the handoff. Server validates
    active_node ownership and updates last_handoff_at.
"""
import logging
from datetime import datetime, timezone

from sqlmodel import Session, select

from app.core.db import engine
from app.models import HandoffPair, Node
from app.relay.connection_manager import manager
from sqlmodel import Session as DBSession

logger = logging.getLogger(__name__)


async def route_handoff_ready(msg: dict, authenticated_node: Node) -> None:
    """Route a handoffReady message from Node A to Node B as a handoffSignal."""
    pair_id = msg.get("pairId")
    branch_ref = msg.get("branchRef", "")
    commit_sha = msg.get("commitSha", "")
    session_id = msg.get("sessionId", "")

    with DBSession(engine) as db:
        pair = db.exec(select(HandoffPair).where(HandoffPair.id == pair_id)).first()
        if not pair:
            logger.warning("handoffReady: pair not found pair_id=%s", pair_id)
            return
        if str(pair.node_a_id) != str(authenticated_node.id):
            logger.warning(
                "handoffReady: sender is not node_a pair_id=%s node=%s",
                pair_id,
                authenticated_node.id,
            )
            return
        node_b = db.exec(select(Node).where(Node.id == pair.node_b_id)).first()
        if not node_b:
            logger.warning("handoffReady: node_b not found pair_id=%s", pair_id)
            return

        pair.last_branch_ref = branch_ref
        pair.active_node_id = pair.node_b_id
        db.add(pair)
        db.commit()
        node_b_machine_id = node_b.machine_id

    handoff_signal = {
        "type": "handoffSignal",
        "pairId": str(pair_id),
        "branchRef": branch_ref,
        "commitSha": commit_sha,
        "sessionId": session_id,
    }
    await manager.send_to_node(node_b_machine_id, handoff_signal)
    logger.info(
        "handoffReady: forwarded HandoffSignal to node_b machine_id=%s pair_id=%s",
        node_b_machine_id,
        pair_id,
    )


async def route_handoff_ack(msg: dict, authenticated_node: Node) -> None:
    """Record that Node B acknowledged receipt of a handoff."""
    pair_id = msg.get("pairId")

    with DBSession(engine) as db:
        pair = db.exec(select(HandoffPair).where(HandoffPair.id == pair_id)).first()
        if not pair:
            logger.warning("handoffAck: pair not found pair_id=%s", pair_id)
            return
        if str(pair.active_node_id) != str(authenticated_node.id):
            logger.warning(
                "handoffAck: sender is not active_node pair_id=%s node=%s",
                pair_id,
                authenticated_node.id,
            )
            return
        pair.last_handoff_at = datetime.now(timezone.utc)
        db.add(pair)
        db.commit()
        logger.info("handoffAck: updated last_handoff_at for pair %s", pair_id)
