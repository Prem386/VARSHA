"""API integration tests for GET /api/v1/rainfall."""
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.schemas.common import Coordinate
from app.schemas.rainfall import (
    CurrentRainfall,
    ModelSourceMetadata,
    PrecipitationStep,
    RainfallProviderStatus,
    RainfallResponse,
    RainfallSummary,
)
from app.services.weather.open_meteo import open_meteo_provider

FIXTURES_DIR = Path(__file__).parent / "fixtures" / "open_meteo"


@pytest.fixture(autouse=True)
def clean_provider_cache() -> None:
    """Ensure cache is reset before and after each test."""
    open_meteo_provider.cache.clear()
    yield
    open_meteo_provider.cache.clear()


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def test_get_rainfall_state1_success_with_rain(client: TestClient) -> None:
    """State 1: Provider OK with rain forecast values."""
    mock_resp = RainfallResponse(
        provider=RainfallProviderStatus(
            provider="open_meteo",
            status="ok",
            is_cached=False,
            is_stale=False,
            retrieved_at=datetime.now(timezone.utc),
            error_message=None,
            endpoint_url="https://api.open-meteo.com/v1/forecast?test=1",
        ),
        requested_coordinate={"latitude": 19.076, "longitude": 72.8777},
        data_type="forecast_model",
        is_model_derived=True,
        is_physical_observation=False,
        model_metadata=ModelSourceMetadata(
            source="Open-Meteo Weather Forecast API",
            grid_latitude=19.08,
            grid_longitude=72.85,
            elevation_m=6.0,
        ),
        current=CurrentRainfall(
            timestamp=datetime.now(timezone.utc),
            interval_seconds=900,
            precipitation_mm=1.5,
            unit="mm",
            is_model_derived=True,
            is_physical_observation=False,
        ),
        hourly=[
            PrecipitationStep(
                timestamp=datetime.now(timezone.utc),
                precipitation_mm=2.5,
                precipitation_probability_pct=75.0,
                interval_minutes=60,
                unit="mm",
                is_model_derived=True,
            )
        ],
        summary=RainfallSummary(
            forecast_hours=24,
            total_precipitation_mm=2.5,
            max_hourly_precipitation_mm=2.5,
            max_probability_pct=75.0,
        ),
    )

    with patch.object(
        open_meteo_provider,
        "fetch_rainfall",
        new=AsyncMock(return_value=mock_resp),
    ):
        response = client.get("/api/v1/rainfall?latitude=19.076&longitude=72.8777&forecast_hours=24")
        assert response.status_code == 200
        data = response.json()

        assert data["provider"]["status"] == "ok"
        assert data["provider"]["is_cached"] is False
        assert data["provider"]["is_stale"] is False
        assert data["data_type"] == "forecast_model"
        assert data["is_model_derived"] is True
        assert data["is_physical_observation"] is False
        assert data["summary"]["total_precipitation_mm"] == 2.5
        assert data["current"]["precipitation_mm"] == 1.5
        assert len(data["hourly"]) == 1
        assert any("flooded" in c for c in data["caveats"])


def test_get_rainfall_state2_success_zero_rain(client: TestClient) -> None:
    """State 2: Provider OK with zero rainfall across the horizon."""
    mock_resp = RainfallResponse(
        provider=RainfallProviderStatus(
            provider="open_meteo",
            status="ok",
            is_cached=False,
            is_stale=False,
            retrieved_at=datetime.now(timezone.utc),
            error_message=None,
            endpoint_url="https://api.open-meteo.com/v1/forecast?test=zero",
        ),
        requested_coordinate={"latitude": 19.076, "longitude": 72.8777},
        data_type="forecast_model",
        is_model_derived=True,
        is_physical_observation=False,
        model_metadata=None,
        current=CurrentRainfall(
            timestamp=datetime.now(timezone.utc),
            interval_seconds=900,
            precipitation_mm=0.0,
            unit="mm",
            is_model_derived=True,
            is_physical_observation=False,
        ),
        hourly=[
            PrecipitationStep(
                timestamp=datetime.now(timezone.utc),
                precipitation_mm=0.0,
                precipitation_probability_pct=0.0,
                interval_minutes=60,
                unit="mm",
                is_model_derived=True,
            )
        ],
        summary=RainfallSummary(
            forecast_hours=24,
            total_precipitation_mm=0.0,
            max_hourly_precipitation_mm=0.0,
            max_probability_pct=0.0,
        ),
    )

    with patch.object(
        open_meteo_provider,
        "fetch_rainfall",
        new=AsyncMock(return_value=mock_resp),
    ):
        response = client.get("/api/v1/rainfall?latitude=19.076&longitude=72.8777")
        assert response.status_code == 200
        data = response.json()

        assert data["provider"]["status"] == "ok"
        assert data["summary"]["total_precipitation_mm"] == 0.0
        assert data["hourly"][0]["precipitation_mm"] == 0.0


def test_get_rainfall_state3_cache_hit(client: TestClient) -> None:
    """State 3: Cache hit returns cached data with is_cached=True."""
    mock_resp = RainfallResponse(
        provider=RainfallProviderStatus(
            provider="open_meteo",
            status="ok",
            is_cached=True,
            is_stale=False,
            retrieved_at=datetime.now(timezone.utc),
            error_message=None,
            endpoint_url="https://api.open-meteo.com/v1/forecast?test=cached",
        ),
        requested_coordinate={"latitude": 19.076, "longitude": 72.8777},
        data_type="forecast_model",
        is_model_derived=True,
        is_physical_observation=False,
        model_metadata=None,
        current=None,
        hourly=[],
        summary=RainfallSummary(forecast_hours=24, total_precipitation_mm=0.0),
    )

    with patch.object(
        open_meteo_provider,
        "fetch_rainfall",
        new=AsyncMock(return_value=mock_resp),
    ):
        response = client.get("/api/v1/rainfall?latitude=19.076&longitude=72.8777")
        assert response.status_code == 200
        data = response.json()
        assert data["provider"]["status"] == "ok"
        assert data["provider"]["is_cached"] is True
        assert data["provider"]["is_stale"] is False


def test_get_rainfall_state4_stale_fallback(client: TestClient) -> None:
    """State 4: Upstream failure serves stale cached data with status=degraded."""
    cached_at = datetime(2026, 10, 23, 10, 0, 0, tzinfo=timezone.utc)
    mock_resp = RainfallResponse(
        provider=RainfallProviderStatus(
            provider="open_meteo",
            status="degraded",
            is_cached=True,
            is_stale=True,
            retrieved_at=cached_at,
            error_message="Upstream forecast request failed: ConnectTimeout",
            endpoint_url="https://api.open-meteo.com/v1/forecast?test=stale",
        ),
        requested_coordinate={"latitude": 19.076, "longitude": 72.8777},
        data_type="forecast_model",
        is_model_derived=True,
        is_physical_observation=False,
        model_metadata=None,
        current=None,
        hourly=[
            PrecipitationStep(
                timestamp=cached_at,
                precipitation_mm=1.0,
                precipitation_probability_pct=50.0,
            )
        ],
        summary=RainfallSummary(forecast_hours=24, total_precipitation_mm=1.0),
    )

    with patch.object(
        open_meteo_provider,
        "fetch_rainfall",
        new=AsyncMock(return_value=mock_resp),
    ):
        response = client.get("/api/v1/rainfall?latitude=19.076&longitude=72.8777")
        assert response.status_code == 200
        data = response.json()
        assert data["provider"]["status"] == "degraded"
        assert data["provider"]["is_stale"] is True
        assert data["provider"]["is_cached"] is True
        assert "ConnectTimeout" in data["provider"]["error_message"]
        assert len(data["hourly"]) == 1


def test_get_rainfall_state5_cold_start_failure(client: TestClient) -> None:
    """State 5: Upstream unavailable on cold start returns status=unavailable, no fake 0.0 rain."""
    mock_resp = RainfallResponse(
        provider=RainfallProviderStatus(
            provider="open_meteo",
            status="unavailable",
            is_cached=False,
            is_stale=False,
            retrieved_at=None,
            error_message="Upstream forecast request failed: ConnectError",
            endpoint_url="https://api.open-meteo.com/v1/forecast?test=fail",
        ),
        requested_coordinate={"latitude": 19.076, "longitude": 72.8777},
        data_type="forecast_model",
        is_model_derived=True,
        is_physical_observation=False,
        model_metadata=None,
        current=None,
        hourly=[],
        summary=None,
    )

    with patch.object(
        open_meteo_provider,
        "fetch_rainfall",
        new=AsyncMock(return_value=mock_resp),
    ):
        response = client.get("/api/v1/rainfall?latitude=19.076&longitude=72.8777")
        assert response.status_code == 200
        data = response.json()
        assert data["provider"]["status"] == "unavailable"
        assert data["provider"]["is_stale"] is False
        assert data["hourly"] == []
        assert data["current"] is None
        assert data["summary"] is None  # CRITICAL: not 0.0 mm


# --- Validation Error Tests (HTTP 422) ---

def test_get_rainfall_missing_coordinates_returns_422(client: TestClient) -> None:
    """Missing latitude or longitude returns HTTP 422."""
    resp1 = client.get("/api/v1/rainfall?longitude=72.8777")
    assert resp1.status_code == 422

    resp2 = client.get("/api/v1/rainfall?latitude=19.076")
    assert resp2.status_code == 422


def test_get_rainfall_invalid_latitude_returns_422(client: TestClient) -> None:
    """Latitude outside [-90, 90] returns HTTP 422."""
    resp_high = client.get("/api/v1/rainfall?latitude=91.5&longitude=72.8777")
    assert resp_high.status_code == 422

    resp_low = client.get("/api/v1/rainfall?latitude=-95.0&longitude=72.8777")
    assert resp_low.status_code == 422


def test_get_rainfall_invalid_longitude_returns_422(client: TestClient) -> None:
    """Longitude outside [-180, 180] returns HTTP 422."""
    resp_high = client.get("/api/v1/rainfall?latitude=19.076&longitude=181.0")
    assert resp_high.status_code == 422

    resp_low = client.get("/api/v1/rainfall?latitude=19.076&longitude=-185.0")
    assert resp_low.status_code == 422


def test_get_rainfall_invalid_forecast_hours_returns_422(client: TestClient) -> None:
    """forecast_hours < 1 or > max returns HTTP 422."""
    resp_zero = client.get("/api/v1/rainfall?latitude=19.076&longitude=72.8777&forecast_hours=0")
    assert resp_zero.status_code == 422

    resp_excess = client.get("/api/v1/rainfall?latitude=19.076&longitude=72.8777&forecast_hours=100")
    assert resp_excess.status_code == 422


def test_get_rainfall_non_numeric_params_returns_422(client: TestClient) -> None:
    """Non-numeric string params return HTTP 422."""
    resp = client.get("/api/v1/rainfall?latitude=abc&longitude=xyz")
    assert resp.status_code == 422


# --- Pilot Region & Redis Integration Tests ---

def test_get_rainfall_outside_pilot_bounds_returns_400(client: TestClient) -> None:
    """Coordinates outside Navi Mumbai pilot coverage return HTTP 400 with clear diagnostics."""
    # New Delhi
    resp_delhi = client.get("/api/v1/rainfall?latitude=28.6139&longitude=77.2090")
    assert resp_delhi.status_code == 400
    assert "outside the supported Navi Mumbai pilot region" in resp_delhi.json()["detail"]

    # Null Island (0, 0)
    resp_zero = client.get("/api/v1/rainfall?latitude=0.0&longitude=0.0")
    assert resp_zero.status_code == 400
    assert "outside the supported Navi Mumbai pilot region" in resp_zero.json()["detail"]

    # New York
    resp_ny = client.get("/api/v1/rainfall?latitude=40.7128&longitude=-74.0060")
    assert resp_ny.status_code == 400
    assert "outside the supported Navi Mumbai pilot region" in resp_ny.json()["detail"]


def test_get_rainfall_serves_from_redis_snapshot_zero_upstream(client: TestClient) -> None:
    """User request is served directly from Redis snapshot without upstream API calls."""
    from datetime import datetime, timezone, timedelta
    from app.services.weather.redis_client import weather_redis_client

    now_utc = datetime.now(timezone.utc)
    mock_snapshot = RainfallResponse(
        provider=RainfallProviderStatus(
            provider="open_meteo",
            status="ok",
            is_cached=False,
            is_stale=False,
            retrieved_at=now_utc - timedelta(minutes=10),
            error_message=None,
            endpoint_url="https://api.open-meteo.com/v1/forecast?cell=nerul",
        ),
        requested_coordinate=Coordinate(latitude=19.033, longitude=73.0297),
        data_type="forecast_model",
        is_model_derived=True,
        is_physical_observation=False,
        model_metadata=ModelSourceMetadata(
            source="Open-Meteo Weather Forecast API",
            grid_latitude=19.04,
            grid_longitude=73.04,
            cell_id="nerul",
        ),
        current=CurrentRainfall(
            timestamp=now_utc,
            interval_seconds=900,
            precipitation_mm=2.0,
            unit="mm",
            is_model_derived=True,
            is_physical_observation=False,
        ),
        hourly=[
            PrecipitationStep(
                timestamp=now_utc,
                precipitation_mm=3.5,
                precipitation_probability_pct=80.0,
                interval_minutes=60,
                unit="mm",
                is_model_derived=True,
            )
        ],
        summary=RainfallSummary(
            forecast_hours=24,
            total_precipitation_mm=3.5,
            max_hourly_precipitation_mm=3.5,
            max_probability_pct=80.0,
        ),
    )

    with patch.object(weather_redis_client, "_is_available", True), \
         patch.object(weather_redis_client, "_client", MagicMock()), \
         patch.object(weather_redis_client, "get_snapshot", new=AsyncMock(return_value=mock_snapshot)):

        response = client.get("/api/v1/rainfall?latitude=19.033&longitude=73.0297&forecast_hours=24")
        assert response.status_code == 200
        data = response.json()

        assert data["provider"]["status"] == "ok"
        assert data["provider"]["is_cached"] is True
        assert data["provider"]["is_stale"] is False
        assert data["model_metadata"]["cell_id"] == "nerul"
        assert data["current"]["precipitation_mm"] == 2.0
        assert data["summary"]["total_precipitation_mm"] == 3.5


def test_get_rainfall_stale_snapshot_served_as_degraded(client: TestClient) -> None:
    """Snapshot older than stale threshold is served with status='degraded' and is_stale=True."""
    from datetime import datetime, timezone, timedelta
    from app.services.weather.redis_client import weather_redis_client

    now_utc = datetime.now(timezone.utc)
    old_time = now_utc - timedelta(minutes=45)  # Exceeds default 35 min threshold

    mock_snapshot = RainfallResponse(
        provider=RainfallProviderStatus(
            provider="open_meteo",
            status="ok",
            is_cached=False,
            is_stale=False,
            retrieved_at=old_time,
            error_message=None,
            endpoint_url="https://api.open-meteo.com/v1/forecast?cell=vashi",
        ),
        requested_coordinate=Coordinate(latitude=19.0771, longitude=72.9986),
        data_type="forecast_model",
        is_model_derived=True,
        is_physical_observation=False,
        model_metadata=ModelSourceMetadata(
            source="Open-Meteo Weather Forecast API",
            grid_latitude=19.08,
            grid_longitude=73.00,
            cell_id="vashi",
        ),
        current=None,
        hourly=[],
        summary=None,
    )

    with patch.object(weather_redis_client, "_is_available", True), \
         patch.object(weather_redis_client, "_client", MagicMock()), \
         patch.object(weather_redis_client, "get_snapshot", new=AsyncMock(return_value=mock_snapshot)):

        response = client.get("/api/v1/rainfall?latitude=19.0771&longitude=72.9986")
        assert response.status_code == 200
        data = response.json()

        assert data["provider"]["status"] == "degraded"
        assert data["provider"]["is_cached"] is True
        assert data["provider"]["is_stale"] is True
        assert "freshness threshold" in data["provider"]["error_message"]


def test_get_rainfall_inside_bounds_but_exceeds_radius_returns_400(client: TestClient) -> None:
    """Coordinates inside bounding box but >15km from all pilot stations return HTTP 400."""
    # Northwest corner (Arabian sea / Western suburbs ~32 km from Vashi)
    resp_nw = client.get("/api/v1/rainfall?latitude=19.29&longitude=72.81")
    assert resp_nw.status_code == 400
    assert "exceeds the maximum permitted radius" in resp_nw.json()["detail"]

    # Southeast corner (remote hills beyond Panvel ~19 km from Panvel)
    resp_se = client.get("/api/v1/rainfall?latitude=18.86&longitude=73.24")
    assert resp_se.status_code == 400
    assert "exceeds the maximum permitted radius" in resp_se.json()["detail"]


def test_get_rainfall_served_immediately_while_startup_recovery_runs(client: TestClient) -> None:
    """Request arriving while background startup recovery is in-flight is served immediately from Redis."""
    from datetime import datetime, timezone, timedelta
    from app.services.weather.redis_client import weather_redis_client

    now_utc = datetime.now(timezone.utc)
    old_time = now_utc - timedelta(minutes=40)

    # Existing Redis snapshot is available but stale
    mock_snapshot = RainfallResponse(
        provider=RainfallProviderStatus(
            provider="open_meteo",
            status="ok",
            is_cached=False,
            is_stale=False,
            retrieved_at=old_time,
            error_message=None,
            endpoint_url="https://api.open-meteo.com/v1/forecast?cell=nerul",
        ),
        requested_coordinate=Coordinate(latitude=19.033, longitude=73.0297),
        data_type="forecast_model",
        is_model_derived=True,
        is_physical_observation=False,
        model_metadata=ModelSourceMetadata(
            source="Open-Meteo Weather Forecast API",
            grid_latitude=19.04,
            grid_longitude=73.04,
            cell_id="nerul",
        ),
        current=None,
        hourly=[],
        summary=None,
    )

    with patch.object(weather_redis_client, "_is_available", True), \
         patch.object(weather_redis_client, "_client", MagicMock()), \
         patch.object(weather_redis_client, "get_snapshot", new=AsyncMock(return_value=mock_snapshot)):

        # Incoming client request succeeds immediately without waiting for background refresh
        response = client.get("/api/v1/rainfall?latitude=19.033&longitude=73.0297")
        assert response.status_code == 200
        data = response.json()

        assert data["provider"]["is_cached"] is True
        assert data["provider"]["is_stale"] is True
        assert data["provider"]["status"] == "degraded"


def test_rainfall_api_makes_zero_upstream_calls_when_redis_unavailable(client: TestClient) -> None:
    """When Redis is unavailable, rainfall API makes zero upstream Open-Meteo requests."""
    import httpx
    from app.services.weather.redis_client import weather_redis_client

    with patch.object(weather_redis_client, "_is_available", False), \
         patch.object(weather_redis_client, "_client", None), \
         patch.object(httpx.AsyncClient, "get", new_callable=AsyncMock) as mock_http_get:

        response = client.get("/api/v1/rainfall?latitude=19.033&longitude=73.0297")
        assert response.status_code == 503
        assert "temporarily unavailable" in response.json()["detail"]
        mock_http_get.assert_not_called()


def test_rainfall_api_serves_in_memory_snapshot_when_redis_unavailable(client: TestClient) -> None:
    """When Redis is unavailable but an in-memory snapshot exists, serve it safely as degraded without calling upstream.

    Preserves age-based meaning of is_stale:
    - genuinely fresh local snapshot returns status='degraded' and is_stale=False.
    - expired local snapshot returns status='degraded' and is_stale=True.
    """
    import httpx
    from datetime import timedelta
    from app.services.weather.redis_client import weather_redis_client

    now_utc = datetime.now(timezone.utc)
    mock_resp = RainfallResponse(
        provider=RainfallProviderStatus(
            provider="open_meteo",
            status="ok",
            is_cached=False,
            is_stale=False,
            retrieved_at=now_utc,
            error_message=None,
            endpoint_url="https://api.open-meteo.com/v1/forecast?cell=nerul",
        ),
        requested_coordinate=Coordinate(latitude=19.033, longitude=73.0297),
        data_type="forecast_model",
        is_model_derived=True,
        is_physical_observation=False,
        model_metadata=ModelSourceMetadata(
            source="Open-Meteo Weather Forecast API",
            grid_latitude=19.04,
            grid_longitude=73.04,
            cell_id="nerul",
        ),
        current=None,
        hourly=[],
        summary=None,
    )

    # 1. Fresh in-memory snapshot (< TTL)
    cache_key = open_meteo_provider.cache.make_key(19.033, 73.0297, 24)
    open_meteo_provider.cache.set(cache_key, mock_resp, "https://api.open-meteo.com/v1/forecast", cached_at=now_utc)

    with patch.object(weather_redis_client, "_is_available", False), \
         patch.object(weather_redis_client, "_client", None), \
         patch.object(httpx.AsyncClient, "get", new_callable=AsyncMock) as mock_http_get:

        response = client.get("/api/v1/rainfall?latitude=19.033&longitude=73.0297")
        assert response.status_code == 200
        data = response.json()

        assert data["provider"]["status"] == "degraded"
        assert data["provider"]["is_cached"] is True
        assert data["provider"]["is_stale"] is False
        assert "Shared weather cache unavailable; serving local snapshot." in data["provider"]["error_message"]
        mock_http_get.assert_not_called()

        # 2. Expired in-memory snapshot (> TTL)
        old_time = now_utc - timedelta(minutes=45)
        open_meteo_provider.cache.set(cache_key, mock_resp, "https://api.open-meteo.com/v1/forecast", cached_at=old_time)

        response_stale = client.get("/api/v1/rainfall?latitude=19.033&longitude=73.0297")
        assert response_stale.status_code == 200
        data_stale = response_stale.json()

        assert data_stale["provider"]["status"] == "degraded"
        assert data_stale["provider"]["is_cached"] is True
        assert data_stale["provider"]["is_stale"] is True
        assert "Shared weather cache unavailable; serving local snapshot." in data_stale["provider"]["error_message"]
        mock_http_get.assert_not_called()


def test_rainfall_api_returns_503_when_both_redis_and_memory_snapshot_missing(client: TestClient) -> None:
    """When Redis is unavailable and memory snapshot is missing, return controlled 503 with zero upstream calls."""
    import httpx
    from app.services.weather.redis_client import weather_redis_client

    open_meteo_provider.cache.clear()

    with patch.object(weather_redis_client, "_is_available", False), \
         patch.object(weather_redis_client, "_client", None), \
         patch.object(httpx.AsyncClient, "get", new_callable=AsyncMock) as mock_http_get:

        response = client.get("/api/v1/rainfall?latitude=19.033&longitude=73.0297")
        assert response.status_code == 503
        data = response.json()
        assert "Shared weather cache is unreachable and no local snapshot is available" in data["detail"]
        mock_http_get.assert_not_called()


def test_rainfall_api_multiple_requests_zero_upstream_calls_during_redis_failure(client: TestClient) -> None:
    """Multiple incoming requests during Redis failure never cause upstream calls."""
    import httpx
    from app.services.weather.redis_client import weather_redis_client

    open_meteo_provider.cache.clear()

    with patch.object(weather_redis_client, "_is_available", False), \
         patch.object(weather_redis_client, "_client", None), \
         patch.object(httpx.AsyncClient, "get", new_callable=AsyncMock) as mock_http_get:

        for _ in range(10):
            response = client.get("/api/v1/rainfall?latitude=19.033&longitude=73.0297")
            assert response.status_code == 503

        # Exactly zero upstream calls across all 10 requests
        mock_http_get.assert_not_called()
