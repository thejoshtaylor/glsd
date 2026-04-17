"""GitHub webhook receiver.

POST /webhooks/github — HMAC-SHA256 signature verification, event-type
mapping, repo-slug-based project routing, and asyncio fire-and-forget
trigger evaluation.

Mounted directly on `app` (not under /api/v1) so GitHub's delivery URL
matches without a prefix.  No JWT auth — the HMAC signature is the only
authentication mechanism.
"""
import asyncio
import hashlib
import hmac
import json
import logging
import re
import uuid

from fastapi import APIRouter, Request
from starlette.responses import Response
from sqlmodel import Session, select

from app.core.config import settings
from app.core.db import engine
from app.models import ProjectGitConfig
from app.triggers.evaluator import evaluate_triggers

logger = logging.getLogger(__name__)

router = APIRouter(tags=["webhooks"])

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_SLUG_PATTERNS = [
    re.compile(r"^https?://github\.com/([^/]+/[^/]+?)(?:\.git)?/?$"),
    re.compile(r"^git@github\.com:([^/]+/[^/]+?)(?:\.git)?$"),
]


def _verify_signature(body: bytes, header: str | None) -> bool:
    """Return True when the X-Hub-Signature-256 header matches the body HMAC."""
    secret = settings.GITHUB_WEBHOOK_SECRET
    if not secret:
        # No secret configured — accept all (dev / misconfigured environments).
        return True
    if not header or not header.startswith("sha256="):
        logger.warning("webhook: missing or malformed X-Hub-Signature-256 header")
        return False
    expected = "sha256=" + hmac.new(
        secret.encode(), body, hashlib.sha256
    ).hexdigest()
    if not hmac.compare_digest(expected, header):
        logger.warning("webhook: signature mismatch")
        return False
    return True


def _map_event_type(github_event: str | None, payload: dict) -> str | None:
    """Map a GitHub X-GitHub-Event + payload action/conclusion to an internal event_type."""
    if github_event is None:
        return None
    action = payload.get("action", "")
    conclusion = payload.get("check_suite", {}).get("conclusion", "")

    if github_event == "pull_request_review" and action == "submitted":
        return "pull_request_review.submitted"
    if github_event == "check_suite" and action == "completed" and conclusion == "failure":
        return "check_suite.completed.failure"
    if github_event == "pull_request" and action == "closed":
        merged = payload.get("pull_request", {}).get("merged", False)
        if merged:
            return "pull_request.closed.merged"
    if github_event == "push":
        return "push"
    if github_event == "installation" and action == "created":
        return "github_app_installation.created"
    return None


def _extract_slug(url: str) -> str | None:
    """Normalize a GitHub repo URL to 'owner/repo'."""
    for pattern in _SLUG_PATTERNS:
        m = pattern.match(url.strip())
        if m:
            return m.group(1)
    return None


def _resolve_project_ids(repo_full_name: str) -> list[uuid.UUID]:
    """Return project_ids whose git config repo_url normalizes to repo_full_name."""
    matched: list[uuid.UUID] = []
    with Session(engine) as db:
        configs = db.exec(select(ProjectGitConfig)).all()
        for cfg in configs:
            slug = _extract_slug(cfg.repo_url)
            if slug == repo_full_name:
                matched.append(cfg.project_id)
    return matched


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------

@router.post("/webhooks/github", status_code=200)
async def github_webhook(request: Request) -> Response:
    # 1. Read raw body first — must precede any json() call (stream is consumed once).
    body = await request.body()

    # 2. Verify signature.
    sig_header = request.headers.get("X-Hub-Signature-256")
    if not _verify_signature(body, sig_header):
        return Response(status_code=401)

    # 3. Parse JSON.
    try:
        payload: dict = json.loads(body)
    except (json.JSONDecodeError, ValueError):
        return Response(status_code=400)

    # 4. Map to internal event_type — skip silently for unhandled events.
    github_event = request.headers.get("X-GitHub-Event")
    event_type = _map_event_type(github_event, payload)
    if event_type is None:
        return Response(status_code=200)

    # 5. Extract repo slug from payload.
    repo_full_name: str | None = payload.get("repository", {}).get("full_name")
    if not repo_full_name:
        return Response(status_code=200)

    # 6. Resolve matching projects.
    project_ids = _resolve_project_ids(repo_full_name)
    if not project_ids:
        logger.info("webhook: no projects matched repo=%s event=%s", repo_full_name, event_type)
        return Response(status_code=200)

    # 7. Fire-and-forget trigger evaluation for each project.
    for project_id in project_ids:
        asyncio.create_task(
            evaluate_triggers(
                session_id=None,
                event_type=event_type,
                event_payload=payload,
                project_id=project_id,
            )
        )

    # 8. Return 200 immediately.
    return Response(status_code=200)
