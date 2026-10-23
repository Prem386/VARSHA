"""API integration tests for GET /api/v1/alerts."""
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import AsyncMock, patch
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.schemas.alerts import AlertListResponse, NormalizedAlert, ProviderStatus
from app.services.alerts.sachet import parse_cap_xml, sachet_provider

FIXTURES_DIR = Path(__file__).parent / "fixtures" / "sachet"


def _read_fixture(filename: str) -> str:
    path = FIXTURES_DIR / filename
    return path.read_text(encoding="utf-8")


@pytest.fixture(autouse=True)
def clean_provider_cache() -> None:
    """Ensure cache is reset before and after each test."""
    sachet_provider.cache.clear()
    yield
    sachet_provider.cache.clear()


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def test_get_alerts_success_with_alerts(client: TestClient) -> None:
    """State 1: Provider OK with alerts returned."""
    alert1 = parse_cap_xml(_read_fixture("cap_alert_sample.xml"))
    alert2 = parse_cap_xml(_read_fixture("cap_with_polygon.xml"))

    mock_status = ProviderStatus(
        provider="ndma_sachet",
        status="ok",
        is_cached=False,
        is_stale=False,
        retrieved_at=datetime.now(timezone.utc),
        error_message=None,
        feed_url="https://sachet.ndma.gov.in/test.xml",
    )

    with patch.object(
        sachet_provider,
        "fetch_alerts",
        new=AsyncMock(return_value=([alert1, alert2], mock_status)),
    ):
        response = client.get("/api/v1/alerts")
        assert response.status_code == 200
        data = response.json()

        assert data["provider"]["status"] == "ok"
        assert data["provider"]["is_stale"] is False
        assert data["provider"]["is_cached"] is False
        assert data["total"] == 2
        assert len(data["alerts"]) == 2
        assert data["spatial_filter_applied"] is False


def test_get_alerts_success_zero_alerts(client: TestClient) -> None:
    """State 2: Provider OK with zero alerts (empty feed)."""
    mock_status = ProviderStatus(
        provider="ndma_sachet",
        status="ok",
        is_cached=False,
        is_stale=False,
        retrieved_at=datetime.now(timezone.utc),
        error_message=None,
        feed_url="https://sachet.ndma.gov.in/test.xml",
    )

    with patch.object(
        sachet_provider,
        "fetch_alerts",
        new=AsyncMock(return_value=([], mock_status)),
    ):
        response = client.get("/api/v1/alerts")
        assert response.status_code == 200
        data = response.json()

        assert data["provider"]["status"] == "ok"
        assert data["provider"]["is_stale"] is False
        assert data["total"] == 0
        assert data["alerts"] == []


def test_get_alerts_stale_cache_fallback(client: TestClient) -> None:
    """State 3: Provider degraded with stale cached data."""
    alert1 = parse_cap_xml(_read_fixture("cap_alert_sample.xml"))
    cached_time = datetime(2026, 10, 23, 10, 0, 0, tzinfo=timezone.utc)

    mock_status = ProviderStatus(
        provider="ndma_sachet",
        status="degraded",
        is_cached=True,
        is_stale=True,
        retrieved_at=cached_time,
        error_message="Upstream feed request failed: ConnectTimeout",
        feed_url="https://sachet.ndma.gov.in/test.xml",
    )

    with patch.object(
        sachet_provider,
        "fetch_alerts",
        new=AsyncMock(return_value=([alert1], mock_status)),
    ):
        response = client.get("/api/v1/alerts")
        assert response.status_code == 200
        data = response.json()

        assert data["provider"]["status"] == "degraded"
        assert data["provider"]["is_stale"] is True
        assert data["provider"]["is_cached"] is True
        assert data["total"] == 1
        assert "ConnectTimeout" in data["provider"]["error_message"]


def test_get_alerts_provider_unavailable_cold_start(client: TestClient) -> None:
    """State 4: Provider unavailable on cold start (no cache, upstream down)."""
    mock_status = ProviderStatus(
        provider="ndma_sachet",
        status="unavailable",
        is_cached=False,
        is_stale=False,
        retrieved_at=None,
        error_message="Upstream feed request failed: ConnectError",
        feed_url="https://sachet.ndma.gov.in/test.xml",
    )

    with patch.object(
        sachet_provider,
        "fetch_alerts",
        new=AsyncMock(return_value=([], mock_status)),
    ):
        response = client.get("/api/v1/alerts")
        assert response.status_code == 200
        data = response.json()

        assert data["provider"]["status"] == "unavailable"
        assert data["provider"]["is_stale"] is False
        assert data["total"] == 0
        assert data["alerts"] == []


def test_get_alerts_active_only_filter(client: TestClient) -> None:
    """Test active_only query parameter excludes inactive/cancelled alerts."""
    active_alert = parse_cap_xml(_read_fixture("cap_alert_sample.xml"))
    cancelled_alert = parse_cap_xml(_read_fixture("cap_cancelled.xml"))
    expired_alert = parse_cap_xml(_read_fixture("cap_expired.xml"))

    all_alerts = [active_alert, cancelled_alert, expired_alert]

    mock_status = ProviderStatus(
        provider="ndma_sachet",
        status="ok",
        feed_url="https://sachet.ndma.gov.in/test.xml",
    )

    with patch.object(
        sachet_provider,
        "fetch_alerts",
        new=AsyncMock(return_value=(all_alerts, mock_status)),
    ):
        # Default active_only=True: only active alert returned
        res_active = client.get("/api/v1/alerts")
        assert res_active.status_code == 200
        data_active = res_active.json()
        assert data_active["total"] == 1
        assert data_active["alerts"][0]["identifier"] == active_alert.identifier

        # active_only=False: all 3 alerts returned
        res_all = client.get("/api/v1/alerts?active_only=false")
        assert res_all.status_code == 200
        data_all = res_all.json()
        assert data_all["total"] == 3


def test_get_alerts_bbox_filter(client: TestClient) -> None:
    """Test spatial bounding box filter applies only to verified polygon geometry."""
    poly_alert = parse_cap_xml(_read_fixture("cap_with_polygon.xml"))
    unresolved_alert = parse_cap_xml(_read_fixture("cap_alert_sample.xml"))

    mock_status = ProviderStatus(
        provider="ndma_sachet",
        status="ok",
        feed_url="https://sachet.ndma.gov.in/test.xml",
    )

    with patch.object(
        sachet_provider,
        "fetch_alerts",
        new=AsyncMock(return_value=([poly_alert, unresolved_alert], mock_status)),
    ):
        # Navi Mumbai bbox covering polygon
        res = client.get("/api/v1/alerts?bbox=72.9,18.9,73.1,19.2")
        assert res.status_code == 200
        data = res.json()

        assert data["spatial_filter_applied"] is True
        assert data["spatial_filter_note"] is not None
        assert data["total"] == 1
        assert data["alerts"][0]["identifier"] == poly_alert.identifier


def test_get_alerts_invalid_bbox_returns_422(client: TestClient) -> None:
    """Test malformed bbox string returns HTTP 422 with validation error."""
    res = client.get("/api/v1/alerts?bbox=invalid,bbox,values")
    assert res.status_code == 422
    data = res.json()
    assert "Invalid bounding box parameter" in data["detail"]
