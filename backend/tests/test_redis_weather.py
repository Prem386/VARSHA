"""Unit and integration tests for WeatherRedisClient."""
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch
import pytest
from redis.exceptions import ConnectionError, RedisError

from app.schemas.common import Coordinate
from app.schemas.rainfall import (
    CurrentRainfall,
    ModelSourceMetadata,
    PrecipitationStep,
    RainfallProviderStatus,
    RainfallResponse,
    RainfallSummary,
)
from app.services.weather.redis_client import WeatherRedisClient


def _make_sample_response(cell_id: str = "nerul") -> RainfallResponse:
    """Construct a complete validated RainfallResponse for testing."""
    now = datetime(2026, 11, 8, 12, 0, 0, tzinfo=timezone.utc)
    return RainfallResponse(
        provider=RainfallProviderStatus(
            provider="open_meteo",
            status="ok",
            is_cached=False,
            is_stale=False,
            retrieved_at=now,
            error_message=None,
            endpoint_url=f"https://api.open-meteo.com/v1/forecast?cell={cell_id}",
        ),
        requested_coordinate=Coordinate(latitude=19.033, longitude=73.0297),
        data_type="forecast_model",
        is_model_derived=True,
        is_physical_observation=False,
        model_metadata=ModelSourceMetadata(
            source="Open-Meteo Weather Forecast API",
            grid_latitude=19.04,
            grid_longitude=73.04,
            cell_id=cell_id,
        ),
        current=CurrentRainfall(
            timestamp=now,
            interval_seconds=900,
            precipitation_mm=0.5,
            unit="mm",
            is_model_derived=True,
            is_physical_observation=False,
        ),
        hourly=[
            PrecipitationStep(
                timestamp=now,
                precipitation_mm=1.0,
                precipitation_probability_pct=40.0,
                interval_minutes=60,
                unit="mm",
                is_model_derived=True,
            )
        ],
        summary=RainfallSummary(
            forecast_hours=24,
            total_precipitation_mm=1.0,
            max_hourly_precipitation_mm=1.0,
            max_probability_pct=40.0,
        ),
    )


@pytest.mark.anyio
async def test_redis_client_init_and_close_without_url() -> None:
    """Client handles empty or unset REDIS_URL gracefully."""
    client = WeatherRedisClient()
    await client.init_pool(None)
    assert client.is_available is False
    assert await client.ping() is False
    await client.close()
    assert client.is_available is False


@pytest.mark.anyio
async def test_redis_client_connection_failure_handled() -> None:
    """Unreachable Redis host does not raise exception; flags client unavailable."""
    client = WeatherRedisClient()
    # Invalid port / host
    await client.init_pool("redis://127.0.0.1:59999/0")
    assert client.is_available is False
    assert await client.ping() is False
    await client.close()


@pytest.mark.anyio
async def test_redis_snapshot_store_and_retrieve_mocked() -> None:
    """Snapshot serializes to JSON in Redis and deserializes back into validated model."""
    client = WeatherRedisClient()
    mock_redis = AsyncMock()
    stored_data = {}

    async def mock_get(key: str):
        return stored_data.get(key)

    async def mock_set(key: str, val: str, ex=None):
        stored_data[key] = val
        return True

    mock_redis.get = AsyncMock(side_effect=mock_get)
    mock_redis.set = AsyncMock(side_effect=mock_set)
    mock_redis.ping = AsyncMock(return_value=True)

    client._client = mock_redis
    client._is_available = True

    sample = _make_sample_response("vashi")

    # 1. Store snapshot
    ok = await client.set_snapshot("vashi", sample, ttl_seconds=3600)
    assert ok is True
    assert "weather:rainfall:vashi" in stored_data

    # 2. Retrieve snapshot
    retrieved = await client.get_snapshot("vashi")
    assert retrieved is not None
    assert retrieved.model_metadata.cell_id == "vashi"
    assert retrieved.current.precipitation_mm == 0.5
    assert len(retrieved.hourly) == 1
    assert retrieved.hourly[0].precipitation_mm == 1.0

    # 3. Missing snapshot returns None
    missing = await client.get_snapshot("unknown_cell")
    assert missing is None


@pytest.mark.anyio
async def test_redis_read_write_error_handled_gracefully() -> None:
    """Redis errors during get/set do not raise unhandled exceptions."""
    client = WeatherRedisClient()
    mock_redis = AsyncMock()
    mock_redis.get = AsyncMock(side_effect=RedisError("Connection reset by peer"))
    mock_redis.set = AsyncMock(side_effect=ConnectionError("Cannot assign requested address"))

    client._client = mock_redis
    client._is_available = True

    # Read error returns None
    resp = await client.get_snapshot("nerul")
    assert resp is None
    assert client.is_available is False  # Degraded on Redis error

    # Write error returns False
    sample = _make_sample_response("nerul")
    ok = await client.set_snapshot("nerul", sample)
    assert ok is False


@pytest.mark.anyio
async def test_distributed_lock_acquire_and_release() -> None:
    """Distributed lock acquires with NX PX and safely releases via Lua script."""
    client = WeatherRedisClient()
    mock_redis = AsyncMock()
    locks = {}

    async def mock_set(key: str, val: str, nx=False, px=None):
        if nx and key in locks:
            return None
        locks[key] = val
        return True

    async def mock_eval(script: str, numkeys: int, key: str, token: str):
        if locks.get(key) == token:
            del locks[key]
            return 1
        return 0

    mock_redis.set = AsyncMock(side_effect=mock_set)
    mock_redis.eval = AsyncMock(side_effect=mock_eval)

    client._client = mock_redis
    client._is_available = True

    lock_key = "weather:lock:test"
    worker_a = "worker-uuid-1"
    worker_b = "worker-uuid-2"

    # Worker A acquires lock
    assert await client.acquire_lock(lock_key, worker_a, timeout_ms=30000) is True

    # Worker B tries to acquire same lock and fails
    assert await client.acquire_lock(lock_key, worker_b, timeout_ms=30000) is False

    # Worker B cannot release Worker A's lock
    assert await client.release_lock(lock_key, worker_b) is False
    assert lock_key in locks

    # Worker A releases own lock
    assert await client.release_lock(lock_key, worker_a) is True
    assert lock_key not in locks

    # Worker B can now acquire lock
    assert await client.acquire_lock(lock_key, worker_b, timeout_ms=30000) is True


@pytest.mark.anyio
async def test_distributed_lock_renew() -> None:
    """Distributed lock renews lease via Lua script only if token matches."""
    client = WeatherRedisClient()
    mock_redis = AsyncMock()
    locks = {"weather:lock:test": "worker-token-1"}

    async def mock_eval(script: str, numkeys: int, key: str, token: str, timeout_ms: int = 0):
        if locks.get(key) == token:
            return 1
        return 0

    mock_redis.eval = AsyncMock(side_effect=mock_eval)
    client._client = mock_redis
    client._is_available = True

    lock_key = "weather:lock:test"

    # Owner renews successfully
    assert await client.renew_lock(lock_key, "worker-token-1", 120000) is True

    # Imposter cannot renew
    assert await client.renew_lock(lock_key, "worker-token-imposter", 120000) is False
