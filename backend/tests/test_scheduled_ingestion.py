"""Unit and integration tests for WeatherScheduler."""
import asyncio
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch
import httpx
import pytest

from app.schemas.rainfall import RainfallResponse
from app.services.weather.grid import NAVI_MUMBAI_CELLS, PilotCell
from app.services.weather.open_meteo import open_meteo_provider
from app.services.weather.redis_client import weather_redis_client
from app.services.weather.scheduler import WeatherScheduler

FIXTURES_DIR = Path(__file__).parent / "fixtures" / "open_meteo"


def _read_fixture_bytes(filename: str) -> bytes:
    return (FIXTURES_DIR / filename).read_bytes()


@pytest.fixture(autouse=True)
def clean_state():
    """Ensure clean in-memory cache and state for each scheduler test."""
    open_meteo_provider.cache.clear()
    yield
    open_meteo_provider.cache.clear()


@pytest.mark.anyio
async def test_scheduler_refresh_all_cells_success() -> None:
    """Scheduled refresh fetches all 5 pilot cells and saves snapshots to Redis and memory."""
    raw_bytes = _read_fixture_bytes("forecast_success.json")
    call_count = 0

    def mock_handler(request: httpx.Request) -> httpx.Response:
        nonlocal call_count
        call_count += 1
        return httpx.Response(200, content=raw_bytes, request=request)

    transport = httpx.MockTransport(mock_handler)
    async with httpx.AsyncClient(transport=transport) as client:
        scheduler = WeatherScheduler()
        saved_snapshots = {}

        mock_redis = AsyncMock()
        async def mock_set(key: str, val: str, ex=None):
            saved_snapshots[key] = val
            return True

        mock_redis.get = AsyncMock(return_value=None)
        mock_redis.set = AsyncMock(side_effect=mock_set)
        mock_redis.ping = AsyncMock(return_value=True)

        with patch.object(weather_redis_client, "_client", mock_redis), \
             patch.object(weather_redis_client, "_is_available", True):

            success_count = await scheduler.refresh_all_cells(client=client)

            assert success_count == 5
            assert call_count == 5
            # Verify all 5 cells are stored in Redis
            for cell_id in NAVI_MUMBAI_CELLS:
                assert f"weather:rainfall:{cell_id}" in saved_snapshots


@pytest.mark.anyio
async def test_scheduler_refresh_failure_preserves_existing_snapshot() -> None:
    """Failed upstream refresh logs warning and NEVER deletes or overwrites existing Redis snapshot."""
    scheduler = WeatherScheduler()
    test_cell = NAVI_MUMBAI_CELLS["vashi"]

    # Pre-populate Redis with an existing valid snapshot
    previous_snapshot = "PREVIOUS_VALID_SNAPSHOT_DATA"
    redis_store = {"weather:rainfall:vashi": previous_snapshot}

    mock_redis = AsyncMock()
    mock_redis.get = AsyncMock(side_effect=lambda k: redis_store.get(k))
    mock_redis.set = AsyncMock(side_effect=lambda k, v, ex=None: redis_store.update({k: v}))

    def failing_handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, content=b"Internal Server Error", request=request)

    transport = httpx.MockTransport(failing_handler)
    async with httpx.AsyncClient(transport=transport) as client:
        with patch.object(weather_redis_client, "_client", mock_redis), \
             patch.object(weather_redis_client, "_is_available", True):

            result = await scheduler.refresh_cell(test_cell, client=client)

            # Ingestion returned None on failure
            assert result is None
            # CRITICAL: Existing snapshot remains completely untouched in Redis
            assert redis_store["weather:rainfall:vashi"] == previous_snapshot


@pytest.mark.anyio
async def test_scheduler_skips_cell_when_daily_quota_429_active() -> None:
    """When daily quota 429 cooldown is active, scheduler skips upstream fetch."""
    scheduler = WeatherScheduler()
    test_cell = NAVI_MUMBAI_CELLS["panvel"]

    # Set an active failure in cooldown table
    cache_key = open_meteo_provider.cache.make_key(test_cell.latitude, test_cell.longitude, 24)
    now = datetime.now(timezone.utc)
    open_meteo_provider.cache.set_failure(
        cache_key,
        "Upstream forecast request failed: HTTP 429",
        failed_at=now,
        cooldown_seconds=3600.0,
    )

    call_count = 0
    def mock_handler(request: httpx.Request) -> httpx.Response:
        nonlocal call_count
        call_count += 1
        return httpx.Response(200, content=b"{}")

    transport = httpx.MockTransport(mock_handler)
    async with httpx.AsyncClient(transport=transport) as client:
        res = await scheduler.refresh_cell(test_cell, client=client)
        assert res is None
        # Upstream was not called due to cooldown protection
        assert call_count == 0


@pytest.mark.anyio
async def test_scheduler_lifecycle_start_and_stop() -> None:
    """Scheduler starts background task and stops cleanly upon request."""
    scheduler = WeatherScheduler()
    assert scheduler.is_running is False

    with patch.object(scheduler, "check_and_initialize_snapshots", new=AsyncMock()):
        await scheduler.start()
        assert scheduler.is_running is True

        await scheduler.stop()
        assert scheduler.is_running is False


@pytest.mark.anyio
async def test_scheduler_startup_recovery_refreshes_outdated_snapshots() -> None:
    """Startup recovery detects and refreshes snapshots older than refresh interval."""
    from datetime import timedelta
    from app.schemas.rainfall import RainfallProviderStatus

    scheduler = WeatherScheduler()
    refreshed_cells = []

    # Mock an outdated snapshot (1 hour old, e.g. after container sleeping)
    now = datetime.now(timezone.utc)
    old_time = now - timedelta(hours=1)
    mock_snapshot = MagicMock()
    mock_snapshot.provider = RainfallProviderStatus(
        provider="open_meteo",
        status="ok",
        is_cached=True,
        is_stale=False,
        retrieved_at=old_time,
        endpoint_url="https://api.open-meteo.com/v1/forecast",
    )

    with patch.object(weather_redis_client, "_is_available", True), \
         patch.object(weather_redis_client, "_client", MagicMock()), \
         patch.object(weather_redis_client, "get_snapshot", new=AsyncMock(return_value=mock_snapshot)), \
         patch.object(weather_redis_client, "acquire_lock", new=AsyncMock(return_value=True)), \
         patch.object(weather_redis_client, "renew_lock", new=AsyncMock(return_value=True)), \
         patch.object(weather_redis_client, "release_lock", new=AsyncMock(return_value=True)), \
         patch.object(scheduler, "refresh_cell", new=AsyncMock(side_effect=lambda c: refreshed_cells.append(c.cell_id))):

        await scheduler.check_and_initialize_snapshots()

        # All 5 cells were recognized as outdated and refreshed on wake-up
        assert len(refreshed_cells) == 5


@pytest.mark.anyio
async def test_shared_daily_quota_cooldown_in_redis() -> None:
    """Scheduler and provider respect shared Redis daily quota cooldown across workers."""
    scheduler = WeatherScheduler()
    test_cell = NAVI_MUMBAI_CELLS["vashi"]

    with patch.object(weather_redis_client, "_is_available", True), \
         patch.object(weather_redis_client, "_client", MagicMock()), \
         patch.object(weather_redis_client, "get_daily_quota_cooldown", new=AsyncMock(return_value="HTTP 429 Daily Limit")):

        # Provider skips upstream when shared daily quota is active
        res_provider = await open_meteo_provider.fetch_rainfall(test_cell.latitude, test_cell.longitude)
        assert res_provider.provider.status == "unavailable"
        assert "HTTP 429" in res_provider.provider.error_message

        # Scheduler skips refresh when shared daily quota is active
        res_scheduler = await scheduler.refresh_cell(test_cell)
        assert res_scheduler is None


@pytest.mark.anyio
async def test_scheduler_slow_upstream_renews_lock() -> None:
    """Slow upstream responses trigger distributed lock renewal before each cell."""
    raw_bytes = _read_fixture_bytes("forecast_success.json")
    scheduler = WeatherScheduler()
    renew_calls = []

    async def mock_handler(request: httpx.Request) -> httpx.Response:
        # Simulate slight upstream network delay
        await asyncio.sleep(0.05)
        return httpx.Response(200, content=raw_bytes, request=request)

    transport = httpx.MockTransport(mock_handler)
    async with httpx.AsyncClient(transport=transport) as client:
        with patch.object(weather_redis_client, "_is_available", True), \
             patch.object(weather_redis_client, "_client", MagicMock()), \
             patch.object(weather_redis_client, "set_snapshot", new=AsyncMock(return_value=True)), \
             patch.object(weather_redis_client, "get_daily_quota_cooldown", new=AsyncMock(return_value=None)), \
             patch.object(weather_redis_client, "renew_lock", new=AsyncMock(side_effect=lambda k, t, **kwargs: renew_calls.append(t))):

            count = await scheduler.refresh_all_cells(client=client)
            assert count == 5
            # Lock was renewed for each cell
            assert len(renew_calls) == 5


@pytest.mark.anyio
async def test_scheduled_ingestion_skips_upstream_when_redis_unavailable() -> None:
    """Scheduled ingestion skips upstream fetching when Redis is unavailable to prevent uncoordinated worker requests."""
    scheduler = WeatherScheduler()

    with patch.object(weather_redis_client, "_is_available", False), \
         patch.object(weather_redis_client, "_client", None), \
         patch.object(httpx.AsyncClient, "get", new_callable=AsyncMock) as mock_http_get:

        # 1. Startup recovery check skips immediately
        await scheduler.check_and_initialize_snapshots()
        mock_http_get.assert_not_called()

        # 2. refresh_all_cells skips immediately and returns 0
        refreshed = await scheduler.refresh_all_cells()
        assert refreshed == 0
        mock_http_get.assert_not_called()

        # 3. Individual cell refresh returns None
        test_cell = NAVI_MUMBAI_CELLS["vashi"]
        cell_res = await scheduler.refresh_cell(test_cell)
        assert cell_res is None
        mock_http_get.assert_not_called()


@pytest.mark.anyio
async def test_redis_recovery_allows_normal_scheduled_ingestion_to_resume() -> None:
    """When Redis recovers connectivity, scheduled ingestion resumes normal operation."""
    raw_bytes = _read_fixture_bytes("forecast_success.json")
    scheduler = WeatherScheduler()

    async def mock_handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=raw_bytes, request=request)

    transport = httpx.MockTransport(mock_handler)
    stored_snapshots = []

    async with httpx.AsyncClient(transport=transport) as client:
        # Step 1: Redis is down -> refresh skipped
        with patch.object(weather_redis_client, "_is_available", False), \
             patch.object(weather_redis_client, "_client", None):
            skipped = await scheduler.refresh_all_cells(client=client)
            assert skipped == 0

        # Step 2: Redis recovers -> ping succeeds, lock acquired, ingestion succeeds
        with patch.object(weather_redis_client, "_is_available", True), \
             patch.object(weather_redis_client, "_client", MagicMock()), \
             patch.object(weather_redis_client, "ping", new=AsyncMock(return_value=True)), \
             patch.object(weather_redis_client, "acquire_lock", new=AsyncMock(return_value=True)), \
             patch.object(weather_redis_client, "renew_lock", new=AsyncMock(return_value=True)), \
             patch.object(weather_redis_client, "release_lock", new=AsyncMock(return_value=True)), \
             patch.object(weather_redis_client, "get_daily_quota_cooldown", new=AsyncMock(return_value=None)), \
             patch.object(weather_redis_client, "set_snapshot", new=AsyncMock(side_effect=lambda cid, snap: stored_snapshots.append(cid))):

            resumed = await scheduler.refresh_all_cells(client=client)
            assert resumed == 5
            assert len(stored_snapshots) == 5
