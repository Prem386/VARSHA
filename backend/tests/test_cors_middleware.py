"""Regression tests for production and local development CORS middleware.

Verifies:
- Production origin https://varsha-dun.vercel.app receives Access-Control-Allow-Origin header
- Endpoints (/api/v1/health, /api/v1/rainfall, /api/v1/alerts) return appropriate CORS headers
- Disallowed origins do not receive CORS access
- OPTIONS preflight requests succeed with appropriate headers
- CORS headers remain present on handled error responses (e.g. 422 validation errors)
- Local development origins (http://localhost:5173, http://127.0.0.1:5173) continue to work
"""
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

PROD_ORIGIN = "https://varsha-dun.vercel.app"
LOCAL_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"]
DISALLOWED_ORIGIN = "https://malicious-site.example.com"


def test_production_origin_allowed_on_health():
    """Verify production Vercel origin receives CORS headers on health endpoint."""
    resp = client.get("/api/v1/health", headers={"Origin": PROD_ORIGIN})
    assert resp.status_code == 200
    assert resp.headers.get("access-control-allow-origin") == PROD_ORIGIN


def test_local_development_origins_allowed():
    """Verify local development origins continue to receive CORS headers."""
    for origin in LOCAL_ORIGINS:
        resp = client.get("/api/v1/health", headers={"Origin": origin})
        assert resp.status_code == 200
        assert resp.headers.get("access-control-allow-origin") == origin


def test_disallowed_origin_denied():
    """Verify unauthorized origin does not receive Access-Control-Allow-Origin header."""
    resp = client.get("/api/v1/health", headers={"Origin": DISALLOWED_ORIGIN})
    assert resp.status_code == 200
    assert "access-control-allow-origin" not in resp.headers


@patch("app.services.weather.open_meteo.open_meteo_provider.fetch_rainfall", new_callable=AsyncMock)
def test_rainfall_endpoint_cors_headers(mock_fetch):
    """Verify rainfall endpoint returns CORS headers for allowed production origin."""
    from app.schemas.rainfall import (
        RainfallResponse,
        RainfallProviderStatus,
        RainfallSummary,
        Coordinate,
    )
    from datetime import datetime, timezone

    mock_fetch.return_value = RainfallResponse(
        provider=RainfallProviderStatus(
            provider="open_meteo",
            status="ok",
            is_cached=False,
            is_stale=False,
            retrieved_at=datetime.now(timezone.utc),
            endpoint_url="https://api.open-meteo.com/v1/forecast",
        ),
        requested_coordinate=Coordinate(latitude=19.033, longitude=73.0297),
        data_type="forecast_model",
        is_model_derived=True,
        is_physical_observation=False,
        current=None,
        hourly=[],
        summary=RainfallSummary(
            forecast_hours=24,
            total_precipitation_mm=0.0,
            valid_hours=0,
            is_complete=False,
        ),
        caveats=[],
    )

    resp = client.get(
        "/api/v1/rainfall?latitude=19.033&longitude=73.0297&forecast_hours=24",
        headers={"Origin": PROD_ORIGIN},
    )
    assert resp.status_code == 200
    assert resp.headers.get("access-control-allow-origin") == PROD_ORIGIN

    # Disallowed origin on rainfall endpoint
    resp_disallowed = client.get(
        "/api/v1/rainfall?latitude=19.033&longitude=73.0297&forecast_hours=24",
        headers={"Origin": DISALLOWED_ORIGIN},
    )
    assert resp_disallowed.status_code == 200
    assert "access-control-allow-origin" not in resp_disallowed.headers


@patch("app.services.alerts.sachet.sachet_provider.fetch_alerts", new_callable=AsyncMock)
def test_alerts_endpoint_cors_headers(mock_fetch):
    """Verify alerts endpoint returns CORS headers for allowed production origin."""
    from app.schemas.alerts import ProviderStatus

    mock_fetch.return_value = (
        [],
        ProviderStatus(
            provider="ndma_sachet",
            status="ok",
            is_cached=False,
            is_stale=False,
            retrieved_at=None,
            feed_url="https://sachet.ndma.gov.in/cap_public_website/rss/rss_india.xml",
        ),
    )

    resp = client.get(
        "/api/v1/alerts?active_only=true",
        headers={"Origin": PROD_ORIGIN},
    )
    assert resp.status_code == 200
    assert resp.headers.get("access-control-allow-origin") == PROD_ORIGIN

    # Disallowed origin on alerts endpoint
    resp_disallowed = client.get(
        "/api/v1/alerts?active_only=true",
        headers={"Origin": DISALLOWED_ORIGIN},
    )
    assert resp_disallowed.status_code == 200
    assert "access-control-allow-origin" not in resp_disallowed.headers


def test_options_preflight_production_origin():
    """Verify OPTIONS preflight request succeeds with appropriate CORS headers."""
    headers = {
        "Origin": PROD_ORIGIN,
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "accept",
    }
    resp = client.options("/api/v1/rainfall", headers=headers)
    assert resp.status_code == 200
    assert resp.headers.get("access-control-allow-origin") == PROD_ORIGIN
    assert "GET" in resp.headers.get("access-control-allow-methods", "")

    resp_alerts = client.options("/api/v1/alerts", headers=headers)
    assert resp_alerts.status_code == 200
    assert resp_alerts.headers.get("access-control-allow-origin") == PROD_ORIGIN


def test_cors_headers_preserved_on_handled_validation_errors():
    """Verify CORS headers remain present on 422 HTTP handled error responses."""
    # 422 Unprocessable Entity (missing query params on rainfall)
    resp = client.get("/api/v1/rainfall?latitude=invalid", headers={"Origin": PROD_ORIGIN})
    assert resp.status_code == 422
    assert resp.headers.get("access-control-allow-origin") == PROD_ORIGIN

    # 422 Unprocessable Entity (invalid bbox parameter on alerts)
    resp_bbox = client.get("/api/v1/alerts?bbox=invalid-bbox", headers={"Origin": PROD_ORIGIN})
    assert resp_bbox.status_code == 422
    assert resp_bbox.headers.get("access-control-allow-origin") == PROD_ORIGIN


def test_cors_headers_preserved_on_404():
    """Verify CORS headers remain present on 404 handled error responses."""
    resp = client.get("/api/v1/nonexistent-endpoint", headers={"Origin": PROD_ORIGIN})
    assert resp.status_code == 404
    assert resp.headers.get("access-control-allow-origin") == PROD_ORIGIN
