"""Pairing code utilities for node registration via 6-char codes.

D-01: Codes use a reduced alphabet (no 0/O/I/1/L) for readability.
D-02: Codes expire after 10 minutes via Redis TTL.
D-03: Codes are single-use via GETDEL atomicity.
"""
import json
import secrets

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
