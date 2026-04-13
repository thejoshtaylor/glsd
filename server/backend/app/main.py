from contextlib import asynccontextmanager

import sentry_sdk
from fastapi import FastAPI
from fastapi.routing import APIRoute
from starlette.middleware.cors import CORSMiddleware

from app.api.main import api_router
from app.core.config import settings
from app.relay.connection_manager import manager


def custom_generate_unique_id(route: APIRoute) -> str:
    return f"{route.tags[0]}-{route.name}"


if settings.SENTRY_DSN and settings.ENVIRONMENT != "local":
    sentry_sdk.init(dsn=str(settings.SENTRY_DSN), enable_tracing=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await manager.start_subscriber()
    yield
    await manager.stop_subscriber()


app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    generate_unique_id_function=custom_generate_unique_id,
    lifespan=lifespan,
)

# Set all CORS enabled origins
if settings.all_cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.all_cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

app.include_router(api_router, prefix=settings.API_V1_STR)

# WebSocket routes mounted at app root (not under /api/v1 prefix)
from app.api.routes import ws_node  # noqa: E402
from app.api.routes import ws_browser  # noqa: E402

app.include_router(ws_node.router)
app.include_router(ws_browser.router)

# Daemon pairing route at /api/daemon (NOT under /api/v1 -- daemon hardcodes this path)
from app.api.routes import daemon  # noqa: E402

app.include_router(daemon.router)

# Install script route at /install (unauthenticated, returns shell script)
from app.api.routes import install  # noqa: E402

app.include_router(install.router)
