"""API integration tests for GET /api/v1/rainfall."""
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import AsyncMock, patch
import pytest
from fastapi.testclient import TestClient

from app.main import app
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
