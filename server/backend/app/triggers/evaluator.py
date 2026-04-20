"""Trigger evaluator.

Resolves project_id from a session, queries matching enabled triggers,
enforces cooldown with SELECT FOR UPDATE, dispatches action chains,
and persists TriggerExecution rows with status/chain_results JSONB.
"""
import asyncio
import logging
import uuid as uuid_mod
from datetime import datetime, timezone

from sqlmodel import Session as DBSession, select

from app.core.db import engine
from app.models import (
    Action,
    ActionChain,
    ProjectNode,
    SessionModel,
    Trigger,
    TriggerExecution,
)
from app.triggers.executor import run_action

logger = logging.getLogger(__name__)


async def evaluate_triggers(
    session_id: str | None,
    event_type: str,
    event_payload: dict,
    project_id: uuid_mod.UUID | None = None,
) -> None:
    """Entry point: wraps inner logic in a broad try/except for observability."""
    try:
        await _evaluate_triggers_inner(session_id, event_type, event_payload, project_id)
    except Exception:
        logger.exception("evaluator error session_id=%s event_type=%s", session_id, event_type)


async def _evaluate_triggers_inner(
    session_id: str | None,
    event_type: str,
    event_payload: dict,
    project_id_override: uuid_mod.UUID | None,
) -> None:
    # 1. Resolve project_id
    if project_id_override is not None:
        resolved_project_id = project_id_override
    else:
        if not session_id:
            logger.warning("evaluate_triggers: session_id required when project_id not provided")
            return
        resolved_project_id = _resolve_project_id(session_id)
        if resolved_project_id is None:
            logger.warning(
                "evaluate_triggers: no project_id for session_id=%s", session_id
            )
            return

    # 2. Query matching enabled triggers
    with DBSession(engine) as db:
        triggers = list(
            db.exec(
                select(Trigger)
                .where(Trigger.project_id == resolved_project_id)
                .where(Trigger.event_type == event_type)
                .where(Trigger.enabled == True)  # noqa: E712
            ).all()
        )

    # 3. Fire each matching trigger
    for trigger in triggers:
        await _fire_trigger(trigger, resolved_project_id, event_payload)


def _resolve_project_id(session_id: str) -> uuid_mod.UUID | None:
    """Resolve project_id from session_id.

    Uses SessionModel.project_id directly when set; falls back to
    Project.node_id lookup via the session's node_id.
    """
    try:
        sid = uuid_mod.UUID(session_id)
    except (ValueError, AttributeError):
        return None

    with DBSession(engine) as db:
        sess = db.get(SessionModel, sid)
        if not sess:
            return None
        if sess.project_id:
            return sess.project_id
        # Fallback: find project via ProjectNode (node_id + cwd)
        pnode = db.exec(
            select(ProjectNode).where(
                ProjectNode.node_id == sess.node_id,
                ProjectNode.local_path == sess.cwd,
            )
        ).first()
        return pnode.project_id if pnode else None


async def _fire_trigger(
    trigger: Trigger,
    project_id: uuid_mod.UUID,
    event_payload: dict,
) -> None:
    now = datetime.now(timezone.utc)

    # 4. Cooldown check with SELECT FOR UPDATE (prevents double-fire under concurrency)
    with DBSession(engine) as db:
        locked = db.exec(
            select(Trigger).where(Trigger.id == trigger.id).with_for_update()
        ).first()
        if not locked:
            return

        if locked.last_fired_at is not None and locked.cooldown_seconds > 0:
            last_fired = locked.last_fired_at
            if last_fired.tzinfo is None:
                last_fired = last_fired.replace(tzinfo=timezone.utc)
            elapsed = (now - last_fired).total_seconds()
            if elapsed < locked.cooldown_seconds:
                logger.info(
                    "evaluate_triggers: trigger %s skipped (cooldown %.0fs remaining)",
                    trigger.id,
                    locked.cooldown_seconds - elapsed,
                )
                return

        locked.last_fired_at = now
        db.add(locked)
        db.commit()

    # 5. Create TriggerExecution with status RUNNING
    execution = TriggerExecution(
        trigger_id=trigger.id,
        fired_at=now,
        event_payload=event_payload,
        status="RUNNING",
    )
    with DBSession(engine) as db:
        db.add(execution)
        db.commit()
        db.refresh(execution)
        execution_id = execution.id

    # 6. Load chains and their actions (eagerly within one session)
    chains_with_actions: list[tuple[ActionChain, list[Action]]] = []
    with DBSession(engine) as db:
        chains = list(
            db.exec(
                select(ActionChain)
                .where(ActionChain.trigger_id == trigger.id)
                .order_by(ActionChain.display_order)  # type: ignore[union-attr]
            ).all()
        )
        for chain in chains:
            actions = list(
                db.exec(
                    select(Action)
                    .where(Action.chain_id == chain.id)
                    .order_by(Action.sequence_order)  # type: ignore[union-attr]
                ).all()
            )
            chains_with_actions.append((chain, actions))

    # 7. Execute all chains concurrently
    chain_results_list: list[dict] = await asyncio.gather(
        *[
            _run_chain(chain, actions, project_id, event_payload)
            for chain, actions in chains_with_actions
        ]
    )

    # 8. Compute overall status and persist
    if not chain_results_list:
        overall_status = "SUCCESS"
    elif all(r.get("ok") for r in chain_results_list):
        overall_status = "SUCCESS"
    elif not any(r.get("ok") for r in chain_results_list):
        overall_status = "FAILED"
    else:
        overall_status = "PARTIAL"

    chain_results = {str(i): r for i, r in enumerate(chain_results_list)}

    with DBSession(engine) as db:
        execution_row = db.get(TriggerExecution, execution_id)
        if execution_row:
            execution_row.status = overall_status
            execution_row.chain_results = chain_results
            db.add(execution_row)
            db.commit()

    logger.info(
        "evaluate_triggers: trigger %s fired status=%s chains=%d",
        trigger.id,
        overall_status,
        len(chain_results_list),
    )


async def _run_chain(
    chain: ActionChain,
    actions: list[Action],
    project_id: uuid_mod.UUID,
    event_payload: dict,
) -> dict:
    """Execute actions sequentially; stop on first failure."""
    result: dict = {"chain_id": str(chain.id), "ok": True, "actions": []}

    for i, action in enumerate(actions):
        try:
            action_result = await run_action(action, project_id, event_payload)
        except Exception as exc:
            action_result = {"ok": False, "error": str(exc)}

        result["actions"].append({"action_id": str(action.id), **action_result})

        if not action_result.get("ok"):
            result["ok"] = False
            result["failed_action_index"] = i
            result["error"] = action_result.get("error", "action failed")
            break

    return result
