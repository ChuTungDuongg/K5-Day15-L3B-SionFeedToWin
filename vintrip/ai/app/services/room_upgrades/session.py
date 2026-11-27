"""Staff-and-hotel scoped session store for Room Upgrades follow-up turns.

Stores ONLY non-authoritative intent slots (bookingCode, targetRoomTypeId, effectiveAt, etc.)
with strict ownerUserId + hotelId verification so one staff member or hotel can never read or
overwrite another session. Never caches authoritative quotes, roles, tokens, or raw guest PII.
"""

import logging
import time
from collections.abc import Callable
from datetime import UTC, datetime
from uuid import UUID

from redis import asyncio as aioredis
from redis.exceptions import RedisError

from app.services.room_upgrades.schemas import RoomUpgradeSessionContext, StoredSession

logger = logging.getLogger(__name__)
SESSION_KEY_PREFIX = "room_upgrade:session:"


class SessionScopeMismatchError(Exception):
    """Raised when a caller attempts to access a session owned by another staff user or hotel."""


class RoomUpgradeSessionStore:
    def __init__(
        self,
        redis_client: aioredis.Redis | None = None,
        *,
        ttl_seconds: int = 1800,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._redis = redis_client
        self._ttl_seconds = ttl_seconds
        self._clock = clock
        self._memory: dict[str, tuple[str, float]] = {}

    def _key(self, session_id: UUID) -> str:
        return f"{SESSION_KEY_PREFIX}{session_id}"

    async def _read_raw(self, key: str) -> str | None:
        if self._redis is not None:
            try:
                raw = await self._redis.get(key)
                if raw is not None:
                    return str(raw)
            except (RedisError, OSError):
                logger.warning("room_upgrades.session.redis_read_failed")
        entry = self._memory.get(key)
        if entry is None:
            return None
        payload, expires_at = entry
        if expires_at <= self._clock():
            self._memory.pop(key, None)
            return None
        return payload

    async def _write_raw(self, key: str, payload: str) -> None:
        self._memory[key] = (payload, self._clock() + self._ttl_seconds)
        if self._redis is not None:
            try:
                await self._redis.set(key, payload, ex=self._ttl_seconds)
            except (RedisError, OSError):
                logger.warning("room_upgrades.session.redis_write_failed")

    async def load(self, session_id: UUID, *, user_id: str, hotel_id: str) -> StoredSession | None:
        raw = await self._read_raw(self._key(session_id))
        if raw is None:
            return None
        stored = StoredSession.model_validate_json(raw)
        if stored.owner_user_id != user_id or stored.hotel_id != hotel_id:
            raise SessionScopeMismatchError(
                "Session belongs to a different staff account or hotel."
            )
        return stored

    async def save(
        self,
        session_id: UUID,
        *,
        user_id: str,
        hotel_id: str,
        context: RoomUpgradeSessionContext,
    ) -> StoredSession:
        # Re-verify ownership before writing so replayed requests cannot hijack a session.
        existing = await self._read_raw(self._key(session_id))
        if existing is not None:
            prior = StoredSession.model_validate_json(existing)
            if prior.owner_user_id != user_id or prior.hotel_id != hotel_id:
                raise SessionScopeMismatchError(
                    "Session belongs to a different staff account or hotel."
                )
        record = StoredSession(
            owner_user_id=user_id,
            hotel_id=hotel_id,
            context=context,
            updated_at=datetime.now(UTC),
        )
        await self._write_raw(self._key(session_id), record.model_dump_json(by_alias=True))
        return record

    async def aclose(self) -> None:
        if self._redis is not None:
            await self._redis.aclose()
            self._redis = None
