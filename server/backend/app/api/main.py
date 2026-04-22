from fastapi import APIRouter

from app.api.routes import activity, admin_settings, github, handoff, items, login, nodes, private, projects, push, sessions, transcribe, usage, users, utils
from app.core.config import settings

api_router = APIRouter()
api_router.include_router(login.router)
api_router.include_router(users.router)
api_router.include_router(utils.router)
api_router.include_router(items.router)
api_router.include_router(nodes.router)
api_router.include_router(sessions.router)
api_router.include_router(projects.router)
api_router.include_router(activity.router)
api_router.include_router(usage.router)
api_router.include_router(push.router)
api_router.include_router(handoff.router, prefix="/handoff-pairs", tags=["handoff"])
api_router.include_router(github.router)
api_router.include_router(admin_settings.router)
api_router.include_router(transcribe.router)


if settings.ENVIRONMENT == "local":
    api_router.include_router(private.router)
