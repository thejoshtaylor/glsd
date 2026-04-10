"""Projects REST resource.

D-08: User-scoped project management. All queries filter by user_id.
Supports list, create, and delete operations.
"""
import uuid as uuid_mod
from typing import Any

from fastapi import APIRouter, HTTPException
from sqlmodel import select

from app.api.deps import CurrentUser, SessionDep
from app.models import (
    Message,
    Project,
    ProjectCreateRequest,
    ProjectPublic,
    ProjectsPublic,
)

router = APIRouter(prefix="/projects", tags=["projects"])


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
        node_id=body.node_id,
        cwd=body.cwd,
    )
    session.add(project)
    session.commit()
    session.refresh(project)
    return ProjectPublic.model_validate(project)


@router.delete("/{project_id}", response_model=Message)
def delete_project(
    project_id: str, session: SessionDep, current_user: CurrentUser
) -> Any:
    """Delete a project owned by the current user. T-04-20: Verifies ownership."""
    try:
        pid = uuid_mod.UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Project not found")

    project = session.exec(
        select(Project).where(
            Project.id == pid, Project.user_id == current_user.id
        )
    ).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    session.delete(project)
    session.commit()
    return Message(message="Project deleted")
