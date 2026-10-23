"""Unit and integration tests for OpenMeteoProvider and OpenMeteoCache."""
import asyncio
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict
import httpx
import pytest

from app.schemas.rainfall import RainfallResponse
from app.services.weather.open_meteo import OpenMeteoCache, OpenMeteoProvider

FIXTURES_DIR = Path(__file__).parent / "fixtures" / "open_meteo"


def _read_fixture_bytes(filename: str) -> bytes:
    return (FIXTURES_DIR / filename).read_bytes()


def _read_fixture_json(filename: str) -> Dict[str, Any]:
    return json.loads((FIXTURES_DIR / filename).read_text(encoding="utf-8"))


# --- Cache Unit Tests ---

def test_cache_key_quantization() -> None:
    """Coordinates within ~1km quantize to the same cache key."""
    key1 = OpenMeteoCache.make_key(19.0760, 72.8777, 24)
    key2 = OpenMeteoCache.make_key(19.0790, 72.8781, 24)
    key3 = OpenMeteoCache.make_key(19.2000, 73.0000, 24)

    assert key1 == "19.08:72.88:24"
    assert key2 == "19.08:72.88:24"
    assert key1 == key2  # Quantized duplicate suppression
    assert key1 != key3  # Distant coordinates yield distinct keys


def test_cache_expiry_deterministic_without_sleeping() -> None:
    """Cache expiration test runs instantly by supplying custom 'now' datetime."""
    cache = OpenMeteoCache(ttl_seconds=900)
    key = "19.08:72.88:24"

    t0 = datetime(2026, 10, 23, 12, 0, 0, tzinfo=timezone.utc)
    # Mock minimal response
    data = _read_fixture_json("forecast_zero_rain.json")
    from app.services.weather.open_meteo import parse_open_meteo_response
    resp = parse_open_meteo_response(
        raw_data=data,
        requested_lat=19.08,
        requested_lon=72.88,
        forecast_hours=4,
        endpoint_url="https://api.open-meteo.com/v1/forecast",
        retrieved_at=t0,
    )

    cache.set(key, resp, "https://api.open-meteo.com/v1/forecast", cached_at=t0)
    assert cache.entry_count == 1

    # Check at t0 + 300s (fresh)
    t_fresh = t0 + timedelta(seconds=300)
    hit = cache.get(key, now=t_fresh)
    assert hit is not None
    _, is_stale, cached_at = hit
    assert is_stale is False
    assert cached_at == t0

    # Check at t0 + 901s (expired / stale)
    t_stale = t0 + timedelta(seconds=901)
    stale_hit = cache.get(key, now=t_stale)
    assert stale_hit is not None
    _, is_stale, _ = stale_hit
    assert is_stale is True


# --- Provider Unit & Mock Transport Tests ---

@pytest.mark.anyio
async def test_provider_successful_fetch() -> None:
    """Successful fetch populates cache, returns ok status and normalized data."""
    raw_bytes = _read_fixture_bytes("forecast_success.json")
    call_count = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal call_count
        call_count += 1
        return httpx.Response(200, content=raw_bytes)

    transport = httpx.MockTransport(handler)
    async with httpx.AsyncClient(transport=transport) as client:
        provider = OpenMeteoProvider(cache_ttl_seconds=900)

        res = await provider.fetch_rainfall(19.076, 72.8777, forecast_hours=24, client=client)

        assert isinstance(res, RainfallResponse)
        assert res.provider.status == "ok"
        assert res.provider.is_cached is False
        assert res.provider.is_stale is False
        assert res.requested_coordinate.latitude == 19.076
        assert len(res.hourly) == 24
        assert call_count == 1

        # Second call to quantized coordinate hits cache without new upstream request
        res_cached = await provider.fetch_rainfall(19.079, 72.878, forecast_hours=24, client=client)
        assert res_cached.provider.status == "ok"
        assert res_cached.provider.is_cached is True
        assert res_cached.provider.is_stale is False
        assert res_cached.requested_coordinate.latitude == 19.079
        assert call_count == 1  # No second HTTP call


@pytest.mark.anyio
async def test_provider_cold_start_failure() -> None:
    """Upstream error on cold start returns unavailable status, NOT zero-rainfall."""
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(503, content=b"Service Unavailable")

    transport = httpx.MockTransport(handler)
    async with httpx.AsyncClient(transport=transport) as client:
        provider = OpenMeteoProvider()
        res = await provider.fetch_rainfall(19.076, 72.8777, forecast_hours=24, client=client)

        assert res.provider.status == "unavailable"
        assert res.provider.is_cached is False
        assert res.provider.is_stale is False
        assert res.provider.retrieved_at is None
        assert "HTTPStatusError" in res.provider.error_message
        assert res.hourly == []
        assert res.current is None
        assert res.summary is None  # CRITICAL: not summary.total_precipitation_mm == 0.0


@pytest.mark.anyio
async def test_provider_stale_cache_fallback_on_upstream_failure() -> None:
    """Upstream failure after cache expiry serves stale cached data as degraded."""
    raw_bytes = _read_fixture_bytes("forecast_success.json")
    should_fail = False

    def handler(request: httpx.Request) -> httpx.Response:
        if should_fail:
            raise httpx.ConnectTimeout("Connection timed out")
        return httpx.Response(200, content=raw_bytes)

    transport = httpx.MockTransport(handler)
    async with httpx.AsyncClient(transport=transport) as client:
        provider = OpenMeteoProvider(cache_ttl_seconds=10)

        # 1. Initial success populates cache
        res1 = await provider.fetch_rainfall(19.076, 72.8777, forecast_hours=24, client=client)
        assert res1.provider.status == "ok"

        # 2. Simulate cache expiry by backdating the cached_at timestamp
        key = provider.cache.make_key(19.076, 72.8777, 24)
        old_time = datetime.now(timezone.utc) - timedelta(seconds=20)
        provider.cache._entries[key].cached_at = old_time

        # 3. Next upstream request fails
        should_fail = True
        res_stale = await provider.fetch_rainfall(19.076, 72.8777, forecast_hours=24, client=client)

        assert res_stale.provider.status == "degraded"
        assert res_stale.provider.is_cached is True
        assert res_stale.provider.is_stale is True
        assert res_stale.provider.retrieved_at == old_time
        assert "ConnectTimeout" in res_stale.provider.error_message
        assert len(res_stale.hourly) == 24  # Stale data preserved


@pytest.mark.anyio
async def test_provider_distinguishes_zero_rain_from_failure() -> None:
    """Zero rainfall returns status=ok, summary.total=0.0; failure returns unavailable."""
    zero_bytes = _read_fixture_bytes("forecast_zero_rain.json")

    def zero_handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=zero_bytes, request=request)

    transport_zero = httpx.MockTransport(zero_handler)
    async with httpx.AsyncClient(transport=transport_zero) as client:
        provider = OpenMeteoProvider()
        res_zero = await provider.fetch_rainfall(19.076, 72.8777, forecast_hours=4, client=client)
        assert res_zero.provider.status == "ok"
        assert res_zero.summary.total_precipitation_mm == 0.0

    def fail_handler(request: httpx.Request) -> httpx.Response:
        raise httpx.NetworkError("Network down")

    transport_fail = httpx.MockTransport(fail_handler)
    async with httpx.AsyncClient(transport=transport_fail) as client:
        provider_fail = OpenMeteoProvider()
        res_fail = await provider_fail.fetch_rainfall(19.076, 72.8777, forecast_hours=4, client=client)
        assert res_fail.provider.status == "unavailable"
        assert res_fail.summary is None


@pytest.mark.anyio
async def test_provider_concurrent_requests_no_duplicate_upstream() -> None:
    """Concurrent requests for the same coordinate do not trigger duplicate calls."""
    raw_bytes = _read_fixture_bytes("forecast_success.json")
    call_count = 0

    def slow_handler(request: httpx.Request) -> httpx.Response:
        nonlocal call_count
        call_count += 1
        return httpx.Response(200, content=raw_bytes, request=request)

    transport = httpx.MockTransport(slow_handler)
    async with httpx.AsyncClient(transport=transport) as client:
        provider = OpenMeteoProvider()

        # Fire 5 concurrent requests
        tasks = [
            provider.fetch_rainfall(19.076, 72.8777, forecast_hours=24, client=client)
            for _ in range(5)
        ]
        results = await asyncio.gather(*tasks)

        for r in results:
            assert r.provider.status == "ok"
            assert len(r.hourly) == 24
        # Lock and cache prevented duplicate fetches; only 1 upstream call made
        assert call_count == 1
