"""Triggers REST resource.

M006: Project-scoped triggers, action chains, actions, and execution history.
All endpoints enforce project ownership (project.user_id == current_user.id).
Ownership violations return 403 (distinguishable from 404 not-found).
"""
import asyncio
import uuid as uuid_mod
from typing import Any

from fastapi import APIRouter, HTTPException
from sqlmodel import select

from app.api.deps import CurrentUser, SessionDep
from app.models import (
    Action,
    ActionChain,
    ActionChainCreate,
    ActionChainPublic,
    ActionChainsPublic,
    ActionCreate,
    ActionPublic,
    ActionsPublic,
    Message,
    Project,
    Trigger,
    TriggerCreate,
    TriggerExecution,
    TriggerExecutionPublic,
    TriggerExecutionsPublic,
    TriggerPublic,
    TriggerUpdate,
    TriggersPublic,
)

from app.relay.connection_manager import manager
from app.triggers.evaluator import evaluate_triggers
from app.triggers.executor import _get_primary_machine_id

projects_router = APIRouter(prefix="/projects", tags=["triggers"])
triggers_router = APIRouter(prefix="/triggers", tags=["triggers"])
chains_router = APIRouter(prefix="/chains", tags=["triggers"])
actions_router = APIRouter(prefix="/actions", tags=["triggers"])


# --- helpers ---


def _get_project_owned(
    project_id: uuid_mod.UUID, session: SessionDep, current_user: CurrentUser
) -> Project:
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if project.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    return project


def _get_trigger_owned(
    trigger_id: uuid_mod.UUID, session: SessionDep, current_user: CurrentUser
) -> Trigger:
    trigger = session.get(Trigger, trigger_id)
    if not trigger:
        raise HTTPException(status_code=404, detail="Trigger not found")
    project = session.get(Project, trigger.project_id)
    if not project or project.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    return trigger


def _get_chain_owned(
    chain_id: uuid_mod.UUID, session: SessionDep, current_user: CurrentUser
) -> ActionChain:
    chain = session.get(ActionChain, chain_id)
    if not chain:
        raise HTTPException(status_code=404, detail="Chain not found")
    _get_trigger_owned(chain.trigger_id, session, current_user)
    return chain


def _get_action_owned(
    action_id: uuid_mod.UUID, session: SessionDep, current_user: CurrentUser
) -> Action:
    action = session.get(Action, action_id)
    if not action:
        raise HTTPException(status_code=404, detail="Action not found")
    _get_chain_owned(action.chain_id, session, current_user)
    return action


# --- projects_router ---


@projects_router.post("/{project_id}/triggers", response_model=TriggerPublic, status_code=201)
def create_trigger(
    project_id: uuid_mod.UUID,
    body: TriggerCreate,
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    _get_project_owned(project_id, session, current_user)
    trigger = Trigger(
        project_id=project_id,
        name=body.name,
        event_type=body.event_type,
        conditions=body.conditions,
        enabled=body.enabled,
        cooldown_seconds=body.cooldown_seconds,
    )
    session.add(trigger)
    session.commit()
    session.refresh(trigger)
    return TriggerPublic.model_validate(trigger)


@projects_router.get("/{project_id}/triggers", response_model=TriggersPublic)
def list_triggers(
    project_id: uuid_mod.UUID,
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    _get_project_owned(project_id, session, current_user)
    triggers = list(
        session.exec(
            select(Trigger).where(Trigger.project_id == project_id)
        ).all()
    )
    return TriggersPublic(
        data=[TriggerPublic.model_validate(t) for t in triggers],
        count=len(triggers),
    )


# --- triggers_router ---


@triggers_router.get("/{trigger_id}", response_model=TriggerPublic)
def get_trigger(
    trigger_id: uuid_mod.UUID,
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    trigger = _get_trigger_owned(trigger_id, session, current_user)
    return TriggerPublic.model_validate(trigger)


@triggers_router.patch("/{trigger_id}", response_model=TriggerPublic)
def update_trigger(
    trigger_id: uuid_mod.UUID,
    body: TriggerUpdate,
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    trigger = _get_trigger_owned(trigger_id, session, current_user)
    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(trigger, field, value)
    session.add(trigger)
    session.commit()
    session.refresh(trigger)
    return TriggerPublic.model_validate(trigger)


@triggers_router.delete("/{trigger_id}", response_model=Message)
def delete_trigger(
    trigger_id: uuid_mod.UUID,
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    trigger = _get_trigger_owned(trigger_id, session, current_user)
    session.delete(trigger)
    session.commit()
    return Message(message="Trigger deleted")


@triggers_router.get("/{trigger_id}/chains", response_model=ActionChainsPublic)
def list_chains(
    trigger_id: uuid_mod.UUID,
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    _get_trigger_owned(trigger_id, session, current_user)
    chains = list(
        session.exec(
            select(ActionChain).where(ActionChain.trigger_id == trigger_id)
        ).all()
    )
    return ActionChainsPublic(
        data=[ActionChainPublic.model_validate(c) for c in chains],
        count=len(chains),
    )


@triggers_router.post("/{trigger_id}/chains", response_model=ActionChainPublic, status_code=201)
def create_chain(
    trigger_id: uuid_mod.UUID,
    body: ActionChainCreate,
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    _get_trigger_owned(trigger_id, session, current_user)
    chain = ActionChain(
        trigger_id=trigger_id,
        name=body.name,
        display_order=body.display_order,
    )
    session.add(chain)
    session.commit()
    session.refresh(chain)
    return ActionChainPublic.model_validate(chain)


@triggers_router.get("/{trigger_id}/executions", response_model=TriggerExecutionsPublic)
def list_executions(
    trigger_id: uuid_mod.UUID,
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    _get_trigger_owned(trigger_id, session, current_user)
    executions = list(
        session.exec(
            select(TriggerExecution)
            .where(TriggerExecution.trigger_id == trigger_id)
            .order_by(TriggerExecution.fired_at.desc())  # type: ignore[union-attr]
            .limit(50)
        ).all()
    )
    return TriggerExecutionsPublic(
        data=[TriggerExecutionPublic.model_validate(e) for e in executions],
        count=len(executions),
    )


@triggers_router.post("/{trigger_id}/fire-test", response_model=TriggerExecutionPublic)
async def fire_test(
    trigger_id: uuid_mod.UUID,
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    """Dev endpoint: force-fire this trigger's action chains and return the execution record."""
    trigger = _get_trigger_owned(trigger_id, session, current_user)

    # Pre-check: require a connected primary node (run_bash/git_push actions need it)
    machine_id = _get_primary_machine_id(trigger.project_id)
    if not machine_id or not manager.is_node_online(machine_id):
        raise HTTPException(
            status_code=422,
            detail="No primary node connected for this project",
        )

    await evaluate_triggers(
        session_id=None,
        event_type=trigger.event_type,
        event_payload={"test": True},
        project_id=trigger.project_id,
    )

    # Query the most-recent execution created for this trigger
    execution = session.exec(
        select(TriggerExecution)
        .where(TriggerExecution.trigger_id == trigger_id)
        .order_by(TriggerExecution.fired_at.desc())  # type: ignore[union-attr]
        .limit(1)
    ).first()

    if not execution:
        raise HTTPException(
            status_code=422,
            detail="No matching enabled trigger chains found for this trigger",
        )

    return TriggerExecutionPublic.model_validate(execution)


# --- chains_router ---


@chains_router.delete("/{chain_id}", response_model=Message)
def delete_chain(
    chain_id: uuid_mod.UUID,
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    chain = _get_chain_owned(chain_id, session, current_user)
    session.delete(chain)
    session.commit()
    return Message(message="Chain deleted")


@chains_router.get("/{chain_id}/actions", response_model=ActionsPublic)
def list_actions(
    chain_id: uuid_mod.UUID,
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    _get_chain_owned(chain_id, session, current_user)
    actions = list(
        session.exec(
            select(Action).where(Action.chain_id == chain_id)
        ).all()
    )
    return ActionsPublic(
        data=[ActionPublic.model_validate(a) for a in actions],
        count=len(actions),
    )


@chains_router.post("/{chain_id}/actions", response_model=ActionPublic, status_code=201)
def create_action(
    chain_id: uuid_mod.UUID,
    body: ActionCreate,
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    _get_chain_owned(chain_id, session, current_user)
    action = Action(
        chain_id=chain_id,
        action_type=body.action_type,
        config=body.config,
        sequence_order=body.sequence_order,
    )
    session.add(action)
    session.commit()
    session.refresh(action)
    return ActionPublic.model_validate(action)


# --- actions_router ---


@actions_router.delete("/{action_id}", response_model=Message)
def delete_action(
    action_id: uuid_mod.UUID,
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    action = _get_action_owned(action_id, session, current_user)
    session.delete(action)
    session.commit()
    return Message(message="Action deleted")
