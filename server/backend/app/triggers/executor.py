"""Trigger action executor.

Dispatches individual trigger actions to node daemons or push notifications.
One action at a time; concurrency is handled by the evaluator via asyncio.gather.
"""
import asyncio
import logging
import uuid as uuid_mod

from sqlmodel import Session as DBSession, select

from app.core.db import engine
from app.core.push import send_push_to_user
from app.models import Action, HandoffPair, Node, Project
from app.relay.connection_manager import manager

logger = logging.getLogger(__name__)


def _get_primary_machine_id(project_id: uuid_mod.UUID) -> str | None:
    """Return machine_id of the node for a project, or None."""
    with DBSession(engine) as db:
        project = db.exec(select(Project).where(Project.id == project_id)).first()
        if not project or not project.node_id:
            return None
        node = db.get(Node, project.node_id)
        if not node or not node.machine_id:
            return None
        return node.machine_id


async def run_action(
    action: Action,
    project_id: uuid_mod.UUID,
    event_payload: dict,
) -> dict:
    """Dispatch a single trigger action; return dict with 'ok' bool.

    Raises ValueError on unknown action_type.
    Logs action_type + result at INFO level.
    """
    config: dict = action.config or {}
    action_type = action.action_type

    logger.info(
        "run_action type=%s project_id=%s action_id=%s",
        action_type,
        project_id,
        action.id,
    )

    if action_type == "send_notification":
        with DBSession(engine) as db:
            project = db.exec(select(Project).where(Project.id == project_id)).first()
            if not project:
                logger.warning("run_action send_notification: project %s not found", project_id)
                return {"ok": False, "error": "project not found"}
            user_id = str(project.user_id)
        await send_push_to_user(user_id, "automation", config)
        logger.info("run_action type=send_notification ok=True")
        return {"ok": True}

    elif action_type in ("run_bash", "run_gsd2_command", "git_push"):
        machine_id = _get_primary_machine_id(project_id)
        if not machine_id:
            return {"ok": False, "error": "no primary node configured for project"}
        if not manager.is_node_online(machine_id):
            return {"ok": False, "error": f"node {machine_id} not connected"}

        request_id = str(uuid_mod.uuid4())
        future = manager.register_response(request_id)

        if action_type == "run_bash":
            msg: dict = {
                "type": "runBash",
                "requestId": request_id,
                "cmd": config.get("cmd", ""),
            }
        elif action_type == "run_gsd2_command":
            msg = {
                "type": "gsd2Query",
                "requestId": request_id,
                "command": config.get("command", ""),
            }
        else:  # git_push
            msg = {
                "type": "gitPush",
                "requestId": request_id,
                "path": config.get("path", ""),
                "branch": config.get("branch", "main"),
            }

        sent = await manager.send_to_node(machine_id, msg)
        if not sent:
            return {"ok": False, "error": f"failed to send to node {machine_id}"}

        try:
            result = await asyncio.wait_for(future, timeout=30.0)
        except asyncio.TimeoutError:
            return {"ok": False, "error": "timeout waiting for node response"}

        ok = bool(result.get("ok", False))
        logger.info("run_action type=%s ok=%s machine_id=%s", action_type, ok, machine_id)
        return {"ok": ok, "output": result.get("output", "")}

    elif action_type == "switch_node":
        pair_id_raw = config.get("pair_id")
        if not pair_id_raw:
            return {"ok": False, "error": "pair_id required for switch_node"}
        try:
            pair_id = uuid_mod.UUID(str(pair_id_raw))
        except (ValueError, AttributeError):
            return {"ok": False, "error": "invalid pair_id format"}

        with DBSession(engine) as db:
            pair = db.get(HandoffPair, pair_id)
            if not pair:
                return {"ok": False, "error": "handoff pair not found"}
            # Verify the pair's node_b belongs to the same project's node
            project = db.get(Project, project_id)
            if not project or pair.user_id != project.user_id:
                return {"ok": False, "error": "not authorized for this handoff pair"}
            node_b = db.get(Node, pair.node_b_id)
            if not node_b or not node_b.machine_id:
                return {"ok": False, "error": "node B has no machine_id"}
            machine_id_b = node_b.machine_id

        sent = await manager.send_to_node(machine_id_b, {"type": "handoffSignal"})
        logger.info("run_action type=switch_node ok=%s machine_id_b=%s", sent, machine_id_b)
        return {"ok": sent}

    else:
        raise ValueError(f"Unknown action_type: {action_type!r}")
