"""Pairing code utilities for node registration via 6-char codes.

D-01: Codes use a reduced alphabet (no 0/O/I/1/L) for readability.
D-02: Codes expire after 10 minutes via Redis TTL (or in-memory TTL when Redis
      is not configured — suitable for single-worker deployments).
D-03: Codes are single-use via GETDEL atomicity (Redis) or lock+pop (memory).
"""
import asyncio
import json
import secrets
import time

import redis.asyncio as aioredis

from app.core.config import settings

CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"  # excludes 0, O, I, 1, L
CODE_LENGTH = 6
CODE_TTL_SECONDS = 600  # 10 minutes per D-02


def generate_pairing_code() -> str:
    return "".join(secrets.choice(CODE_CHARS) for _ in range(CODE_LENGTH))


async def store_pairing_code(
    redis: aioredis.Redis, code: str, user_id: str, node_name: str
) -> bool:
    payload = json.dumps({"user_id": user_id, "node_name": node_name})
    result = await redis.set(f"pair:{code}", payload, ex=CODE_TTL_SECONDS, nx=True)
    return bool(result)


async def consume_pairing_code(redis: aioredis.Redis, code: str) -> dict | None:
    raw = await redis.getdel(f"pair:{code}")
    if raw is None:
        return None
    return json.loads(raw)


# ---------------------------------------------------------------------------
# In-memory fallback store (single-worker only — codes are lost on restart)
# ---------------------------------------------------------------------------

_mem_store: dict[str, tuple[str, float]] = {}  # key -> (payload_json, expires_at)
_mem_lock = asyncio.Lock()


async def store_pairing_code_mem(code: str, user_id: str, node_name: str) -> bool:
    """Store a pairing code in memory with TTL.  Returns False if code exists."""
    key = f"pair:{code}"
    payload = json.dumps({"user_id": user_id, "node_name": node_name})
    expires_at = time.monotonic() + CODE_TTL_SECONDS
    async with _mem_lock:
        existing = _mem_store.get(key)
        if existing is not None and existing[1] > time.monotonic():
            return False  # NX: key already exists and is not yet expired
        _mem_store[key] = (payload, expires_at)
        return True


async def consume_pairing_code_mem(code: str) -> dict | None:
    """Atomically retrieve and delete a pairing code from the in-memory store."""
    key = f"pair:{code}"
    async with _mem_lock:
        entry = _mem_store.pop(key, None)
    if entry is None:
        return None
    payload, expires_at = entry
    if time.monotonic() > expires_at:
        return None  # expired
    return json.loads(payload)


# ---------------------------------------------------------------------------
# Unified store/consume helpers used by endpoint handlers
# ---------------------------------------------------------------------------

async def store_code(code: str, user_id: str, node_name: str) -> bool:
    """Store a pairing code via Redis (preferred) or in-memory fallback."""
    r = await get_redis()
    if r is not None:
        return await store_pairing_code(r, code, user_id, node_name)
    return await store_pairing_code_mem(code, user_id, node_name)


async def consume_code(code: str) -> dict | None:
    """Consume a pairing code via Redis (preferred) or in-memory fallback."""
    r = await get_redis()
    if r is not None:
        return await consume_pairing_code(r, code)
    return await consume_pairing_code_mem(code)


# ---------------------------------------------------------------------------
# Redis client lifecycle
# ---------------------------------------------------------------------------

_redis_client: aioredis.Redis | None = None
_redis_initialized: bool = False


async def get_redis() -> aioredis.Redis | None:
    global _redis_client, _redis_initialized
    if not _redis_initialized:
        _redis_initialized = True
        if settings.REDIS_URL:
            try:
                _redis_client = aioredis.from_url(
                    str(settings.REDIS_URL), decode_responses=True
                )
                await _redis_client.ping()
            except Exception:
                _redis_client = None
    return _redis_client
