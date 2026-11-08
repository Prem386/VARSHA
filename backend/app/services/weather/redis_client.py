"""Asynchronous Redis client and weather snapshot storage layer.

Provides connection pooling, snapshot serialization, health checks, and
distributed locking for periodic background ingestion.

RESILIENCE GUARANTEES:
- Gracefully handles missing, unreachable, or failing Redis instances.
- Never raises unhandled Redis exceptions to API callers or FastAPI request handlers.
- Safe atomic distributed locks using Lua scripts for worker coordination.
"""
import logging
from typing import Optional

import redis.asyncio as aioredis
from redis.exceptions import RedisError

from app.core.config import settings
from app.schemas.rainfall import RainfallResponse

logger = logging.getLogger(__name__)

# Atomic release script: only deletes if the lock token matches
_RELEASE_LOCK_LUA = """
if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
else
    return 0
end
"""

# Atomic renew script: only extends TTL if the lock token matches
_RENEW_LOCK_LUA = """
if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("pexpire", KEYS[1], ARGV[2])
else
    return 0
end
"""


class WeatherRedisClient:
    """Centralized asynchronous Redis client for VARSHA weather service."""

    def __init__(self) -> None:
        self._client: Optional[aioredis.Redis] = None
        self._pool: Optional[aioredis.ConnectionPool] = None
        self._is_available: bool = False

    @staticmethod
    def snapshot_key(cell_id: str) -> str:
        """Construct canonical Redis key for a geographic cell weather snapshot."""
        return f"weather:rainfall:{cell_id}"

    async def init_pool(self, redis_url: Optional[str] = None) -> None:
        """Initialize connection pool from configured REDIS_URL."""
        url = redis_url if redis_url is not None else settings.REDIS_URL
        if not url or not url.strip():
            logger.info("REDIS_URL not configured. Weather service will use in-memory cache.")
            self._is_available = False
            return

        try:
            timeout = settings.REDIS_CONNECT_TIMEOUT_SECONDS
            self._pool = aioredis.ConnectionPool.from_url(
                url.strip(),
                socket_connect_timeout=timeout,
                socket_timeout=timeout,
                max_connections=10,
                decode_responses=True,
            )
            self._client = aioredis.Redis(connection_pool=self._pool)
            await self._client.ping()
            self._is_available = True
            logger.info("Redis connection established successfully.")
        except Exception as exc:
            self._is_available = False
            logger.warning("Failed to connect to Redis at startup: %s. Using in-memory fallback.", exc)

    async def close(self) -> None:
        """Gracefully close Redis client and connection pool."""
        if self._client is not None:
            try:
                await self._client.aclose()
            except Exception as exc:
                logger.debug("Error closing Redis client: %s", exc)
            self._client = None

        if self._pool is not None:
            try:
                await self._pool.disconnect()
            except Exception as exc:
                logger.debug("Error disconnecting Redis pool: %s", exc)
            self._pool = None

        self._is_available = False

    @property
    def is_available(self) -> bool:
        """Check if Redis connection is active."""
        return self._is_available and self._client is not None

    async def ping(self) -> bool:
        """Actively verify Redis connectivity."""
        if self._client is None:
            if settings.REDIS_URL and settings.REDIS_URL.strip():
                try:
                    await self.init_pool()
                    return self._is_available
                except Exception:
                    return False
            return False
        try:
            res = await self._client.ping()
            self._is_available = bool(res)
            return self._is_available
        except Exception as exc:
            self._is_available = False
            logger.warning("Redis ping failed: %s", exc)
            return False

    async def get_snapshot(self, cell_id: str) -> Optional[RainfallResponse]:
        """Retrieve and deserialize normalized weather snapshot from Redis."""
        if not self.is_available or self._client is None:
            return None

        key = self.snapshot_key(cell_id)
        try:
            raw_data = await self._client.get(key)
            if not raw_data:
                return None
            return RainfallResponse.model_validate_json(raw_data)
        except RedisError as exc:
            logger.warning("Redis read error for key '%s': %s", key, exc)
            self._is_available = False
            return None
        except Exception as exc:
            logger.error("Failed to parse cached snapshot for '%s': %s", key, exc)
            return None

    async def set_snapshot(
        self,
        cell_id: str,
        response: RainfallResponse,
        ttl_seconds: Optional[int] = None,
    ) -> bool:
        """Store normalized weather snapshot in Redis with configurable retention TTL."""
        if not self.is_available or self._client is None:
            return False

        key = self.snapshot_key(cell_id)
        ttl = ttl_seconds if ttl_seconds is not None else settings.WEATHER_SNAPSHOT_TTL_SECONDS
        try:
            serialized = response.model_dump_json()
            if ttl > 0:
                await self._client.set(key, serialized, ex=ttl)
            else:
                await self._client.set(key, serialized)
            return True
        except RedisError as exc:
            logger.warning("Redis write error for key '%s': %s", key, exc)
            self._is_available = False
            return False

    async def acquire_lock(self, lock_key: str, token: str, timeout_ms: int = 60000) -> bool:
        """Acquire a distributed lease lock using SET NX PX."""
        if not self.is_available or self._client is None:
            return False

        try:
            result = await self._client.set(lock_key, token, nx=True, px=timeout_ms)
            return bool(result)
        except RedisError as exc:
            logger.warning("Redis lock acquire error for '%s': %s", lock_key, exc)
            return False

    async def release_lock(self, lock_key: str, token: str) -> bool:
        """Atomically release distributed lock if token matches."""
        if not self.is_available or self._client is None:
            return False

        try:
            result = await self._client.eval(_RELEASE_LOCK_LUA, 1, lock_key, token)
            return bool(result)
        except RedisError as exc:
            logger.warning("Redis lock release error for '%s': %s", lock_key, exc)
            return False

    async def renew_lock(self, lock_key: str, token: str, timeout_ms: int = 120000) -> bool:
        """Atomically renew distributed lock lease if token matches."""
        if not self.is_available or self._client is None:
            return False

        try:
            result = await self._client.eval(_RENEW_LOCK_LUA, 1, lock_key, token, timeout_ms)
            return bool(result)
        except RedisError as exc:
            logger.warning("Redis lock renew error for '%s': %s", lock_key, exc)
            return False

    async def set_daily_quota_cooldown(self, cooldown_seconds: float, reason: str) -> bool:
        """Store shared Open-Meteo HTTP 429 daily quota cooldown in Redis."""
        if not self.is_available or self._client is None:
            return False

        key = "weather:cooldown:daily_quota"
        ex = max(1, int(cooldown_seconds))
        try:
            await self._client.set(key, reason, ex=ex)
            logger.warning("Stored shared daily quota cooldown in Redis for %d seconds.", ex)
            return True
        except RedisError as exc:
            logger.warning("Failed to store daily quota cooldown in Redis: %s", exc)
            return False

    async def get_daily_quota_cooldown(self) -> Optional[str]:
        """Check if a shared Open-Meteo daily quota cooldown is active in Redis."""
        if not self.is_available or self._client is None:
            return None

        key = "weather:cooldown:daily_quota"
        try:
            return await self._client.get(key)
        except RedisError as exc:
            logger.warning("Failed to read daily quota cooldown from Redis: %s", exc)
            return None


# Global singleton client instance
weather_redis_client = WeatherRedisClient()
