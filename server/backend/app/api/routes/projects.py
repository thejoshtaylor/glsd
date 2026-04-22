"""Projects REST resource.

D-08: User-scoped project management. All queries filter by user_id.
Supports list, create, delete, and sub-resource (nodes, git-config) operations.
"""
import logging
import uuid as uuid_mod
from typing import Any

from fastapi import APIRouter, HTTPException
from sqlmodel import select

from app.api.deps import CurrentUser, SessionDep
from app.models import (
    Message,
    Node,
    Project,
    ProjectCreateRequest,
    ProjectGitConfig,
    ProjectGitConfigCreate,
    ProjectGitConfigPublic,
    ProjectGitConfigUpdate,
    ProjectNode,
    ProjectNodeCreate,
    ProjectNodePublic,
    ProjectPublic,
    ProjectsPublic,
)
from app.relay.connection_manager import manager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/projects", tags=["projects"])


def _get_project_or_404(
    session: SessionDep, project_id: str, user_id: uuid_mod.UUID
) -> Project:
    try:
        pid = uuid_mod.UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Project not found")
    project = session.exec(
        select(Project).where(Project.id == pid, Project.user_id == user_id)
    ).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.get("", response_model=ProjectsPublic)
def list_projects(session: SessionDep, current_user: CurrentUser) -> Any:
    """List all projects belonging to the current user."""
    projects = list(
        session.exec(
            select(Project).where(Project.user_id == current_user.id)
        ).all()
    )
    return ProjectsPublic(
        data=[ProjectPublic.model_validate(p) for p in projects],
        count=len(projects),
    )


@router.post("", response_model=ProjectPublic)
def create_project(
    session: SessionDep, current_user: CurrentUser, body: ProjectCreateRequest
) -> Any:
    """Create a new project scoped to the current user."""
    project = Project(
        user_id=current_user.id,
        name=body.name,
    )
    session.add(project)
    session.commit()
    session.refresh(project)
    return ProjectPublic.model_validate(project)


@router.get("/{project_id}", response_model=ProjectPublic)
def get_project(
    project_id: str, session: SessionDep, current_user: CurrentUser
) -> Any:
    """Get a single project by ID, scoped to the current user."""
    project = _get_project_or_404(session, project_id, current_user.id)
    return ProjectPublic.model_validate(project)


@router.delete("/{project_id}", response_model=Message)
def delete_project(
    project_id: str, session: SessionDep, current_user: CurrentUser
) -> Any:
    """Delete a project owned by the current user."""
    project = _get_project_or_404(session, project_id, current_user.id)
    session.delete(project)
    session.commit()
    return Message(message="Project deleted")


# --- /nodes sub-routes ---


@router.get("/{project_id}/nodes", response_model=list[ProjectNodePublic])
def list_project_nodes(
    project_id: str, session: SessionDep, current_user: CurrentUser
) -> Any:
    """List ProjectNode rows for a project owned by the current user."""
    project = _get_project_or_404(session, project_id, current_user.id)
    nodes = list(
        session.exec(
            select(ProjectNode).where(ProjectNode.project_id == project.id)
        ).all()
    )
    return [ProjectNodePublic.model_validate(n) for n in nodes]


@router.post("/{project_id}/nodes", response_model=ProjectNodePublic)
async def create_project_node(
    project_id: str,
    session: SessionDep,
    current_user: CurrentUser,
    body: ProjectNodeCreate,
) -> Any:
    """Create a ProjectNode. If a ProjectGitConfig exists for the project,
    emit GitClone to the node and set clone_status='cloning'.
    If the relay send fails (node offline or error), set clone_status='failed'
    and still return 201 — attach is best-effort for the clone side.
    """
    project = _get_project_or_404(session, project_id, current_user.id)

    # Check for ProjectGitConfig before creating the row
    git_cfg = session.exec(
        select(ProjectGitConfig).where(ProjectGitConfig.project_id == project.id)
    ).first()

    initial_clone_status: str | None = None
    if git_cfg:
        initial_clone_status = "cloning"

    node = ProjectNode(
        project_id=project.id,
        node_id=body.node_id,
        local_path=body.local_path,
        is_primary=body.is_primary,
        clone_status=initial_clone_status,
    )
    session.add(node)
    session.commit()
    session.refresh(node)

    if git_cfg:
        # Look up the node's machine_id so we can address it via relay
        db_node = session.get(Node, body.node_id)
        machine_id = db_node.machine_id if db_node else None

        sent = False
        if machine_id:
            git_clone_msg = {
                "type": "gitClone",
                "projectId": str(project.id),
                "nodeId": str(body.node_id),
                "repoUrl": git_cfg.repo_url,
                "localPath": body.local_path,
                "branch": git_cfg.pull_from_branch,
            }
            try:
                sent = await manager.send_to_node(machine_id, git_clone_msg)
            except Exception:
                logger.warning(
                    "clone_status: relay send_to_node raised exception "
                    "project_id=%s node_id=%s machine_id=%s",
                    project.id,
                    body.node_id,
                    machine_id,
                    exc_info=True,
                )

        if not sent:
            # Node is offline or send failed — mark failed immediately
            logger.warning(
                "clone_status: relay offline or send failed, setting failed "
                "project_id=%s node_id=%s machine_id=%s",
                project.id,
                body.node_id,
                machine_id,
            )
            node.clone_status = "failed"
            session.add(node)
            session.commit()
            session.refresh(node)
        else:
            logger.info(
                "clone_status: null->cloning project_id=%s node_id=%s machine_id=%s",
                project.id,
                body.node_id,
                machine_id,
            )

    return ProjectNodePublic.model_validate(node)


@router.delete("/{project_id}/nodes/{node_id}", response_model=Message)
def delete_project_node(
    project_id: str,
    node_id: str,
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    """Delete a ProjectNode row."""
    project = _get_project_or_404(session, project_id, current_user.id)
    try:
        nid = uuid_mod.UUID(node_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="ProjectNode not found")
    pnode = session.exec(
        select(ProjectNode).where(
            ProjectNode.id == nid,
            ProjectNode.project_id == project.id,
        )
    ).first()
    if not pnode:
        raise HTTPException(status_code=404, detail="ProjectNode not found")
    session.delete(pnode)
    session.commit()
    return Message(message="ProjectNode deleted")


# --- /git-config sub-routes ---


@router.get("/{project_id}/git-config", response_model=ProjectGitConfigPublic)
def get_git_config(
    project_id: str, session: SessionDep, current_user: CurrentUser
) -> Any:
    """Get ProjectGitConfig for a project. 404 if none exists."""
    project = _get_project_or_404(session, project_id, current_user.id)
    cfg = session.exec(
        select(ProjectGitConfig).where(ProjectGitConfig.project_id == project.id)
    ).first()
    if not cfg:
        raise HTTPException(status_code=404, detail="GitConfig not found")
    return ProjectGitConfigPublic.model_validate(cfg)


@router.post("/{project_id}/git-config", response_model=ProjectGitConfigPublic)
def create_git_config(
    project_id: str,
    session: SessionDep,
    current_user: CurrentUser,
    body: ProjectGitConfigCreate,
) -> Any:
    """Create ProjectGitConfig for a project."""
    project = _get_project_or_404(session, project_id, current_user.id)
    existing = session.exec(
        select(ProjectGitConfig).where(ProjectGitConfig.project_id == project.id)
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="GitConfig already exists; use PATCH to update")
    cfg = ProjectGitConfig(
        project_id=project.id,
        repo_url=body.repo_url,
        pull_from_branch=body.pull_from_branch,
        push_to_branch=body.push_to_branch,
        merge_mode=body.merge_mode,
        pr_target_branch=body.pr_target_branch,
    )
    session.add(cfg)
    session.commit()
    session.refresh(cfg)
    return ProjectGitConfigPublic.model_validate(cfg)


@router.patch("/{project_id}/git-config", response_model=ProjectGitConfigPublic)
def update_git_config(
    project_id: str,
    session: SessionDep,
    current_user: CurrentUser,
    body: ProjectGitConfigUpdate,
) -> Any:
    """Update ProjectGitConfig for a project."""
    project = _get_project_or_404(session, project_id, current_user.id)
    cfg = session.exec(
        select(ProjectGitConfig).where(ProjectGitConfig.project_id == project.id)
    ).first()
    if not cfg:
        raise HTTPException(status_code=404, detail="GitConfig not found")
    update_data = body.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(cfg, key, value)
    session.add(cfg)
    session.commit()
    session.refresh(cfg)
    return ProjectGitConfigPublic.model_validate(cfg)


@router.delete("/{project_id}/git-config", response_model=Message)
def delete_git_config(
    project_id: str, session: SessionDep, current_user: CurrentUser
) -> Any:
    """Delete ProjectGitConfig for a project."""
    project = _get_project_or_404(session, project_id, current_user.id)
    cfg = session.exec(
        select(ProjectGitConfig).where(ProjectGitConfig.project_id == project.id)
    ).first()
    if not cfg:
        raise HTTPException(status_code=404, detail="GitConfig not found")
    session.delete(cfg)
    session.commit()
    return Message(message="GitConfig deleted")
