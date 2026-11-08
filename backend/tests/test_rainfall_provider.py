"""Unit and integration tests for OpenMeteoProvider and OpenMeteoCache."""
import asyncio
import json
import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict
import httpx
import pytest

from app.schemas.rainfall import RainfallResponse
from app.services.weather.open_meteo import (
    OpenMeteoCache,
    OpenMeteoProvider,
    calculate_daily_quota_cooldown_seconds,
)

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
        assert "HTTP 503" in res.provider.error_message
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


@pytest.mark.anyio
async def test_provider_failure_cooldown_on_429() -> None:
    """HTTP 429 triggers cooldown; second request within window does not call upstream."""
    call_count = 0

    def handler_429(request: httpx.Request) -> httpx.Response:
        nonlocal call_count
        call_count += 1
        return httpx.Response(429, content=b"Too Many Requests", request=request)

    transport = httpx.MockTransport(handler_429)
    async with httpx.AsyncClient(transport=transport) as client:
        provider = OpenMeteoProvider(failure_cooldown_seconds=60)

        # 1. First call fails with 429
        res1 = await provider.fetch_rainfall(19.033, 73.0297, forecast_hours=24, client=client)
        assert res1.provider.status == "unavailable"
        assert res1.provider.is_cached is False
        assert "HTTP 429" in res1.provider.error_message
        assert res1.hourly == []
        assert res1.current is None
        assert res1.summary is None
        assert call_count == 1

        # 2. Second call within cooldown window does NOT call upstream
        res2 = await provider.fetch_rainfall(19.033, 73.0297, forecast_hours=24, client=client)
        assert res2.provider.status == "unavailable"
        assert res2.provider.is_cached is False
        assert call_count == 1  # No second upstream call made


@pytest.mark.anyio
async def test_provider_concurrent_failure_calls_share_single_upstream_request() -> None:
    """Five concurrent calls encountering 429 generate exactly one upstream request."""
    call_count = 0

    def handler_429(request: httpx.Request) -> httpx.Response:
        nonlocal call_count
        call_count += 1
        return httpx.Response(429, content=b"Too Many Requests", request=request)

    transport = httpx.MockTransport(handler_429)
    async with httpx.AsyncClient(transport=transport) as client:
        provider = OpenMeteoProvider(failure_cooldown_seconds=60)

        tasks = [
            provider.fetch_rainfall(19.033, 73.0297, forecast_hours=24, client=client)
            for _ in range(5)
        ]
        results = await asyncio.gather(*tasks)

        assert call_count == 1  # Exactly 1 upstream call
        for r in results:
            assert r.provider.status == "unavailable"
            assert r.provider.is_cached is False
            assert r.hourly == []
            assert r.summary is None


@pytest.mark.anyio
async def test_provider_failure_cooldown_expiry_allows_retry() -> None:
    """After failure cooldown expires, subsequent request can retry upstream."""
    call_count = 0
    return_success = False
    raw_bytes = _read_fixture_bytes("forecast_success.json")

    def dynamic_handler(request: httpx.Request) -> httpx.Response:
        nonlocal call_count
        call_count += 1
        if return_success:
            return httpx.Response(200, content=raw_bytes, request=request)
        return httpx.Response(429, content=b"Too Many Requests", request=request)

    transport = httpx.MockTransport(dynamic_handler)
    async with httpx.AsyncClient(transport=transport) as client:
        provider = OpenMeteoProvider(failure_cooldown_seconds=10)

        # 1. Initial 429
        res1 = await provider.fetch_rainfall(19.033, 73.0297, forecast_hours=24, client=client)
        assert res1.provider.status == "unavailable"
        assert call_count == 1

        # 2. Backdate the failure timestamp to simulate cooldown expiration
        key = provider.cache.make_key(19.033, 73.0297, 24)
        expired_time = datetime.now(timezone.utc) - timedelta(seconds=20)
        provider.cache._failures[key].failed_at = expired_time

        # 3. Next request should retry upstream
        return_success = True
        res2 = await provider.fetch_rainfall(19.033, 73.0297, forecast_hours=24, client=client)
        assert res2.provider.status == "ok"
        assert len(res2.hourly) == 24
        assert call_count == 2


@pytest.mark.anyio
async def test_provider_network_failure_receives_cooldown() -> None:
    """Transient network errors (ConnectTimeout) trigger cooldown protection."""
    call_count = 0

    def timeout_handler(request: httpx.Request) -> httpx.Response:
        nonlocal call_count
        call_count += 1
        raise httpx.ConnectTimeout("Connection timed out", request=request)

    transport = httpx.MockTransport(timeout_handler)
    async with httpx.AsyncClient(transport=transport) as client:
        provider = OpenMeteoProvider(failure_cooldown_seconds=60)

        res1 = await provider.fetch_rainfall(19.033, 73.0297, forecast_hours=24, client=client)
        assert res1.provider.status == "unavailable"
        assert "ConnectTimeout" in res1.provider.error_message
        assert call_count == 1

        # Second request within cooldown
        res2 = await provider.fetch_rainfall(19.033, 73.0297, forecast_hours=24, client=client)
        assert res2.provider.status == "unavailable"
        assert call_count == 1  # Protected by cooldown


@pytest.mark.anyio
async def test_provider_stale_fallback_preserved_during_cooldown() -> None:
    """Stale cached forecast is returned as degraded during 429 failure cooldown."""
    raw_bytes = _read_fixture_bytes("forecast_success.json")
    call_count = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return httpx.Response(200, content=raw_bytes, request=request)
        return httpx.Response(429, content=b"Too Many Requests", request=request)

    transport = httpx.MockTransport(handler)
    async with httpx.AsyncClient(transport=transport) as client:
        provider = OpenMeteoProvider(cache_ttl_seconds=10, failure_cooldown_seconds=60)

        # 1. Initial success populates cache
        res1 = await provider.fetch_rainfall(19.033, 73.0297, forecast_hours=24, client=client)
        assert res1.provider.status == "ok"
        assert call_count == 1

        # 2. Backdate cache entry to make it stale
        key = provider.cache.make_key(19.033, 73.0297, 24)
        original_retrieval_time = provider.cache._entries[key].cached_at
        provider.cache._entries[key].cached_at = datetime.now(timezone.utc) - timedelta(seconds=20)

        # 3. Next request triggers 429 upstream and enters cooldown
        res2 = await provider.fetch_rainfall(19.033, 73.0297, forecast_hours=24, client=client)
        assert res2.provider.status == "degraded"
        assert res2.provider.is_cached is True
        assert res2.provider.is_stale is True
        assert res2.provider.retrieved_at == provider.cache._entries[key].cached_at
        assert "HTTP 429" in res2.provider.error_message
        assert len(res2.hourly) == 24
        assert call_count == 2

        # 4. Subsequent request within cooldown still returns stale data without calling upstream
        res3 = await provider.fetch_rainfall(19.033, 73.0297, forecast_hours=24, client=client)
        assert res3.provider.status == "degraded"
        assert res3.provider.is_cached is True
        assert res3.provider.is_stale is True
        assert call_count == 2


@pytest.mark.anyio
async def test_provider_http_status_error_logging_and_truncation(caplog: pytest.LogCaptureFixture) -> None:
    """HTTPStatusError logs status code, reason phrase, and <= 200 chars body without sensitive data."""
    long_body = "x" * 300

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(429, content=long_body.encode(), request=request)

    transport = httpx.MockTransport(handler)
    async with httpx.AsyncClient(transport=transport) as client:
        provider = OpenMeteoProvider()
        with caplog.at_level(logging.WARNING):
            res = await provider.fetch_rainfall(19.076, 72.8777, forecast_hours=24, client=client)

        assert res.provider.status == "unavailable"
        assert res.provider.error_message == "Upstream forecast request failed: HTTP 429"

        # Verify log output captures status code, reason phrase, and truncated body
        log_records = [r for r in caplog.records if r.name == "app.services.weather.open_meteo"]
        assert len(log_records) == 1
        log_msg = log_records[0].getMessage()
        assert "status=429" in log_msg
        assert "reason=Too Many Requests" in log_msg
        assert "x" * 200 in log_msg
        assert "x" * 201 not in log_msg


# --- Daily Quota Cooldown Tests ---

def test_calculate_daily_quota_cooldown_seconds_dynamic_and_timezone_aware() -> None:
    """Dynamic calculation accurately determines remaining seconds until next 00:00 UTC."""
    # 1. Middle of UTC day (15:00:00 UTC -> 9 hours remaining = 32,400s)
    t_midday = datetime(2026, 11, 8, 15, 0, 0, tzinfo=timezone.utc)
    rem_midday = calculate_daily_quota_cooldown_seconds(t_midday)
    assert rem_midday == 9 * 3600

    # 2. Near end of UTC day (23:59:50 UTC -> 10s remaining)
    t_late = datetime(2026, 11, 8, 23, 59, 50, tzinfo=timezone.utc)
    rem_late = calculate_daily_quota_cooldown_seconds(t_late)
    assert rem_late == 10.0

    # 3. Exact midnight UTC (00:00:00 UTC -> 24 hours = 86,400s remaining)
    t_midnight = datetime(2026, 11, 8, 0, 0, 0, tzinfo=timezone.utc)
    rem_midnight = calculate_daily_quota_cooldown_seconds(t_midnight)
    assert rem_midnight == 86400.0

    # 4. Timezone-aware with non-UTC offset (IST: UTC+5:30)
    # 20:30 IST is 15:00 UTC -> remaining until 00:00 UTC is 9 hours
    ist_tz = timezone(timedelta(hours=5, minutes=30))
    t_ist = datetime(2026, 11, 8, 20, 30, 0, tzinfo=ist_tz)
    rem_ist = calculate_daily_quota_cooldown_seconds(t_ist)
    assert rem_ist == 9 * 3600


@pytest.mark.anyio
async def test_provider_daily_quota_429_extends_cooldown_to_midnight_utc() -> None:
    """HTTP 429 with 'Daily API request limit exceeded' triggers long cooldown until midnight UTC."""
    call_count = 0
    quota_body = b'{"error": true, "reason": "Daily API request limit exceeded. Please try again tomorrow."}'

    def quota_handler(request: httpx.Request) -> httpx.Response:
        nonlocal call_count
        call_count += 1
        return httpx.Response(429, content=quota_body, request=request)

    transport = httpx.MockTransport(quota_handler)
    async with httpx.AsyncClient(transport=transport) as client:
        provider = OpenMeteoProvider(failure_cooldown_seconds=60)

        # 1. First call fails with daily quota 429
        res1 = await provider.fetch_rainfall(19.033, 73.0297, forecast_hours=24, client=client)
        assert res1.provider.status == "unavailable"
        assert res1.provider.is_cached is False
        assert "HTTP 429" in res1.provider.error_message
        assert call_count == 1

        # Check recorded failure cooldown in cache
        key = provider.cache.make_key(19.033, 73.0297, 24)
        failure_entry = provider.cache._failures.get(key)
        assert failure_entry is not None
        assert failure_entry.cooldown_seconds is not None
        # Cooldown should be dynamic duration to midnight UTC, significantly longer than 60s
        expected_remaining = calculate_daily_quota_cooldown_seconds(failure_entry.failed_at)
        assert abs(failure_entry.cooldown_seconds - expected_remaining) < 2.0

        # 2. Second call within daily quota cooldown does NOT call upstream
        res2 = await provider.fetch_rainfall(19.033, 73.0297, forecast_hours=24, client=client)
        assert res2.provider.status == "unavailable"
        assert call_count == 1  # No second upstream call made


@pytest.mark.anyio
async def test_provider_generic_429_retains_short_cooldown() -> None:
    """Generic HTTP 429 (not daily quota) retains the standard 60-second cooldown."""
    call_count = 0

    def generic_handler(request: httpx.Request) -> httpx.Response:
        nonlocal call_count
        call_count += 1
        return httpx.Response(429, content=b"Minutely rate limit exceeded", request=request)

    transport = httpx.MockTransport(generic_handler)
    async with httpx.AsyncClient(transport=transport) as client:
        provider = OpenMeteoProvider(failure_cooldown_seconds=60)

        res1 = await provider.fetch_rainfall(19.033, 73.0297, forecast_hours=24, client=client)
        assert res1.provider.status == "unavailable"
        assert call_count == 1

        key = provider.cache.make_key(19.033, 73.0297, 24)
        failure_entry = provider.cache._failures.get(key)
        assert failure_entry is not None
        # Generic 429 leaves cooldown_seconds as None (defaults to 60s)
        assert failure_entry.cooldown_seconds is None


@pytest.mark.anyio
async def test_provider_stale_cache_fallback_during_daily_quota_cooldown() -> None:
    """Stale cached forecast serves as degraded fallback during daily quota cooldown."""
    raw_bytes = _read_fixture_bytes("forecast_success.json")
    call_count = 0
    quota_body = b'{"error": true, "reason": "Daily API request limit exceeded."}'

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return httpx.Response(200, content=raw_bytes, request=request)
        return httpx.Response(429, content=quota_body, request=request)

    transport = httpx.MockTransport(handler)
    async with httpx.AsyncClient(transport=transport) as client:
        provider = OpenMeteoProvider(cache_ttl_seconds=10, failure_cooldown_seconds=60)

        # 1. Populate fresh cache
        res1 = await provider.fetch_rainfall(19.033, 73.0297, forecast_hours=24, client=client)
        assert res1.provider.status == "ok"
        assert call_count == 1

        # 2. Backdate cache to expire it
        key = provider.cache.make_key(19.033, 73.0297, 24)
        old_time = datetime.now(timezone.utc) - timedelta(seconds=20)
        provider.cache._entries[key].cached_at = old_time

        # 3. Next request hits 429 daily quota limit
        res2 = await provider.fetch_rainfall(19.033, 73.0297, forecast_hours=24, client=client)
        assert res2.provider.status == "degraded"
        assert res2.provider.is_stale is True
        assert res2.provider.is_cached is True
        assert len(res2.hourly) == 24
        assert call_count == 2

        # 4. Subsequent request during daily quota cooldown returns degraded stale cache without upstream call
        res3 = await provider.fetch_rainfall(19.033, 73.0297, forecast_hours=24, client=client)
        assert res3.provider.status == "degraded"
        assert res3.provider.is_stale is True
        assert call_count == 2


@pytest.mark.anyio
async def test_provider_daily_quota_cooldown_expiry_permits_retry() -> None:
    """When daily quota cooldown expires (after midnight UTC), new requests reach upstream."""
    call_count = 0
    raw_bytes = _read_fixture_bytes("forecast_success.json")
    quota_body = b"Daily API request limit exceeded"

    def dynamic_handler(request: httpx.Request) -> httpx.Response:
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return httpx.Response(429, content=quota_body, request=request)
        return httpx.Response(200, content=raw_bytes, request=request)

    transport = httpx.MockTransport(dynamic_handler)
    async with httpx.AsyncClient(transport=transport) as client:
        provider = OpenMeteoProvider(failure_cooldown_seconds=60)

        # 1. First call encounters daily quota limit
        res1 = await provider.fetch_rainfall(19.033, 73.0297, forecast_hours=24, client=client)
        assert res1.provider.status == "unavailable"
        assert call_count == 1

        # 2. Simulate expiry by backdating failure entry past cooldown duration
        key = provider.cache.make_key(19.033, 73.0297, 24)
        failure_entry = provider.cache._failures[key]
        assert failure_entry.cooldown_seconds is not None
        provider.cache._failures[key].failed_at = (
            datetime.now(timezone.utc) - timedelta(seconds=failure_entry.cooldown_seconds + 10)
        )

        # 3. Next request proceeds to upstream after cooldown expired
        res2 = await provider.fetch_rainfall(19.033, 73.0297, forecast_hours=24, client=client)
        assert res2.provider.status == "ok"
        assert len(res2.hourly) == 24
        assert call_count == 2
