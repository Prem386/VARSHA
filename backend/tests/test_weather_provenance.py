import httpx
import pytest
from datetime import datetime, timezone
from app.schemas.rainfall import RainfallProviderStatus, RainfallResponse, RainfallSummary
from app.services.weather.open_meteo import OpenMeteoProvider, parse_open_meteo_response


def _p(precip_values, prob_values, current_precip=0.5, hours=3):
    h = hours
    times = ["2026-10-26T%02d:00" % (12 + i) for i in range(h)]
    return {
        "latitude": 19.09, "longitude": 73.03, "elevation": 6.0,
        "timezone": "UTC", "utc_offset_seconds": 0, "generationtime_ms": 1.23,
        "hourly": {"time": times, "precipitation": precip_values, "precipitation_probability": prob_values},
        "current": {"time": "2026-10-26T12:00", "interval": 900, "precipitation": current_precip},
    }


R = datetime(2026, 10, 26, 12, 0, 0, tzinfo=timezone.utc)
URL = "https://api.open-meteo.com/v1/forecast"


def test_current_interval_900s_not_rate():
    resp = parse_open_meteo_response(_p([2.0, 1.0, 0.0], [60.0, 40.0, 0.0], 0.8), 19.09, 73.03, 3, URL, R)
    assert resp.current is not None
    assert resp.current.interval_seconds == 900
    assert resp.current.precipitation_mm == 0.8
    assert resp.current.is_model_derived is True
    assert resp.current.is_physical_observation is False
    assert resp.current.interval_description
    assert "15" in resp.current.interval_description or "900" in resp.current.interval_description


def test_provenance_flags():
    resp = parse_open_meteo_response(_p([1.0, 2.0, 0.5], [50.0, 80.0, 20.0]), 19.09, 73.03, 3, URL, R)
    assert resp.is_model_derived is True
    assert resp.is_physical_observation is False
    assert resp.data_type == "forecast_model"
    for step in resp.hourly:
        assert step.is_model_derived is True
    if resp.current:
        assert resp.current.is_model_derived is True
        assert resp.current.is_physical_observation is False


def test_retrieved_at_utc_aware():
    resp = parse_open_meteo_response(_p([0.0, 0.0, 0.0], [0.0, 0.0, 0.0]), 19.09, 73.03, 3, URL, R)
    assert resp.provider.retrieved_at is not None
    assert resp.provider.retrieved_at.tzinfo is not None
    assert resp.provider.retrieved_at.astimezone(timezone.utc) == R


def test_hourly_timestamps_utc_aware():
    resp = parse_open_meteo_response(_p([1.0, 2.0, 0.5], [40.0, 70.0, 10.0]), 19.09, 73.03, 3, URL, R)
    assert len(resp.hourly) == 3
    for step in resp.hourly:
        assert step.timestamp.tzinfo is not None


def test_zero_rain_is_not_none():
    resp = parse_open_meteo_response(_p([0.0, 0.0, 0.0], [0.0, 0.0, 0.0], 0.0), 19.09, 73.03, 3, URL, R)
    assert resp.summary is not None
    assert resp.summary.total_precipitation_mm == 0.0
    assert resp.summary.max_hourly_precipitation_mm == 0.0
    if resp.current:
        assert resp.current.precipitation_mm == 0.0


def test_null_upstream_stays_none():
    resp = parse_open_meteo_response(_p([None, 1.5, None], [None, 40.0, None], None), 19.09, 73.03, 3, URL, R)
    assert resp.hourly[0].precipitation_mm is None
    assert resp.hourly[1].precipitation_mm == 1.5
    assert resp.hourly[2].precipitation_mm is None
    assert resp.summary is not None
    assert resp.summary.total_precipitation_mm == 1.5
    if resp.current:
        assert resp.current.precipitation_mm is None


def test_caveats_flood_and_accumulation():
    resp = parse_open_meteo_response(_p([0.0], [0.0], hours=1), 19.09, 73.03, 1, URL, R)
    text = " ".join(resp.caveats).lower()
    assert any(w in text for w in ["flooded", "inundation", "road or path"])
    assert any(w in text for w in ["accumulation", "interval", "instantaneous"])
    assert any(w in text for w in ["rain-gauge", "model"])


@pytest.mark.anyio
async def test_unavailable_no_fabricated_values():
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("Connection refused")

    transport = httpx.MockTransport(handler)
    async with httpx.AsyncClient(transport=transport) as client:
        provider = OpenMeteoProvider()
        u = await provider.fetch_rainfall(19.09, 73.03, forecast_hours=3, client=client)
        assert u.provider.status == "unavailable"
        assert u.provider.retrieved_at is None
        assert u.current is None
        assert u.summary is None
        assert u.hourly == []
        assert "ConnectError" in (u.provider.error_message or "")


@pytest.mark.anyio
async def test_stale_cache_flags():
    ts = datetime(2026, 10, 25, 8, 0, 0, tzinfo=timezone.utc)
    raw_payload = _p([1.0, 2.0], [50.0, 60.0], hours=2)

    def success_handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=raw_payload)

    transport = httpx.MockTransport(success_handler)
    async with httpx.AsyncClient(transport=transport) as client:
        provider = OpenMeteoProvider(cache_ttl_seconds=60)
        res = await provider.fetch_rainfall(19.09, 73.03, forecast_hours=2, client=client)
        assert res.provider.status == "ok"

    key = provider.cache.make_key(19.09, 73.03, 2)
    provider.cache._entries[key].cached_at = ts

    def fail_handler(request: httpx.Request) -> httpx.Response:
        raise httpx.TimeoutException("Timeout")

    fail_transport = httpx.MockTransport(fail_handler)
    async with httpx.AsyncClient(transport=fail_transport) as client:
        s = await provider.fetch_rainfall(19.09, 73.03, forecast_hours=2, client=client)
        assert s.provider.is_stale is True
        assert s.provider.is_cached is True
        assert s.provider.status == "degraded"
        assert s.provider.retrieved_at == ts
        assert "Timeout" in (s.provider.error_message or "")
        assert len(s.hourly) == 2


def test_forecast_bounded_to_requested_hours():
    all_times = ["2026-10-26T%02d:00" % (12 + i) for i in range(6)]
    payload = {
        "latitude": 19.09, "longitude": 73.03, "elevation": 6.0, "timezone": "UTC",
        "utc_offset_seconds": 0, "generationtime_ms": 1.0,
        "hourly": {"time": all_times, "precipitation": [0.1, 0.2, 0.3, 0.4, 0.5, 0.6],
                   "precipitation_probability": [10.0] * 6},
        "current": {"time": "2026-10-26T12:00", "interval": 900, "precipitation": 0.0},
    }
    resp = parse_open_meteo_response(payload, 19.09, 73.03, 3, URL, R)
    assert len(resp.hourly) == 3
    assert resp.hourly[-1].precipitation_mm == 0.3
