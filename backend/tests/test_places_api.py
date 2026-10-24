"""Integration tests for places search API endpoints."""
from unittest.mock import AsyncMock, patch
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.schemas.places import PlaceSearchResponse, PlaceSearchResult
from app.services.places.geoapify import (
    GeoapifyAuthError,
    GeoapifyConfigError,
    GeoapifyNetworkError,
    GeoapifyRateLimitError,
    GeoapifyTimeoutError,
    GeoapifyUpstreamError,
)

client = TestClient(app)


def test_search_places_success():
    mock_response = PlaceSearchResponse(
        query="Inorbit Mall, Vashi",
        total=1,
        results=[
            PlaceSearchResult(
                id="geo-1",
                name="Inorbit Mall",
                formatted_address="Inorbit Mall, Sector 30A, Vashi, Navi Mumbai, India",
                latitude=19.066,
                longitude=72.999,
                source="geoapify",
                category="commercial.shopping_mall",
                locality="Vashi",
            )
        ],
        source="geoapify",
        cached=False,
    )

    with patch("app.api.routes.places.geoapify_provider.search", new_callable=AsyncMock) as mock_search:
        mock_search.return_value = mock_response

        response = client.get("/api/v1/places/search?q=Inorbit+Mall,+Vashi&limit=5")
        assert response.status_code == 200
        data = response.json()
        assert data["query"] == "Inorbit Mall, Vashi"
        assert data["total"] == 1
        assert len(data["results"]) == 1
        assert data["results"][0]["name"] == "Inorbit Mall"
        assert data["results"][0]["latitude"] == 19.066
        assert data["results"][0]["longitude"] == 72.999
        assert data["results"][0]["locality"] == "Vashi"


def test_search_places_validation_empty_query():
    # Whitespace only
    resp = client.get("/api/v1/places/search?q=%20%20")
    assert resp.status_code == 400
    assert "cannot be empty" in resp.json()["detail"]


def test_search_places_validation_short_query():
    resp = client.get("/api/v1/places/search?q=a")
    assert resp.status_code == 400
    assert "at least 2 non-whitespace characters" in resp.json()["detail"]


def test_search_places_validation_long_query():
    long_q = "x" * 201
    resp = client.get(f"/api/v1/places/search?q={long_q}")
    assert resp.status_code == 400
    assert "too long" in resp.json()["detail"]


def test_search_places_validation_missing_query():
    resp = client.get("/api/v1/places/search")
    assert resp.status_code == 422


def test_search_places_validation_invalid_limit():
    resp_zero = client.get("/api/v1/places/search?q=vashi&limit=0")
    assert resp_zero.status_code == 422

    resp_excess = client.get("/api/v1/places/search?q=vashi&limit=50")
    assert resp_excess.status_code == 422


def test_search_places_handles_missing_api_key_503():
    with patch("app.api.routes.places.geoapify_provider.search", new_callable=AsyncMock) as mock_search:
        mock_search.side_effect = GeoapifyConfigError("Geocoding service unavailable: API key not configured.")

        resp = client.get("/api/v1/places/search?q=vashi")
        assert resp.status_code == 503
        assert "API key not configured" in resp.json()["detail"]


def test_search_places_handles_upstream_auth_error_502():
    with patch("app.api.routes.places.geoapify_provider.search", new_callable=AsyncMock) as mock_search:
        mock_search.side_effect = GeoapifyAuthError("Geocoding provider authentication failed.")

        resp = client.get("/api/v1/places/search?q=vashi")
        assert resp.status_code == 502
        assert "authentication failed" in resp.json()["detail"]


def test_search_places_handles_rate_limit_429():
    with patch("app.api.routes.places.geoapify_provider.search", new_callable=AsyncMock) as mock_search:
        mock_search.side_effect = GeoapifyRateLimitError("Geocoding provider rate limit exceeded.")

        resp = client.get("/api/v1/places/search?q=vashi")
        assert resp.status_code == 429
        assert "rate limit exceeded" in resp.json()["detail"]


def test_search_places_handles_timeout_504():
    with patch("app.api.routes.places.geoapify_provider.search", new_callable=AsyncMock) as mock_search:
        mock_search.side_effect = GeoapifyTimeoutError("Geocoding provider request timed out.")

        resp = client.get("/api/v1/places/search?q=vashi")
        assert resp.status_code == 504
        assert "timed out" in resp.json()["detail"]


def test_search_places_handles_network_error_502():
    with patch("app.api.routes.places.geoapify_provider.search", new_callable=AsyncMock) as mock_search:
        mock_search.side_effect = GeoapifyNetworkError("Unable to connect to geocoding provider.")

        resp = client.get("/api/v1/places/search?q=vashi")
        assert resp.status_code == 502
        assert "Unable to connect" in resp.json()["detail"]
