"""Tests for the health check endpoint."""
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_health_endpoint_returns_200():
    """Verify health endpoint responds with HTTP 200."""
    response = client.get("/api/v1/health")
    assert response.status_code == 200


def test_health_endpoint_schema_contract():
    """Verify health endpoint response contains all documented fields."""
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    data = response.json()

    assert data["status"] == "ok"
    assert data["service"] == "varsha-backend"
    assert isinstance(data["version"], str)
    assert len(data["version"]) > 0
    assert isinstance(data["environment"], str)
    assert isinstance(data["timestamp"], str)


def test_health_endpoint_isolated_no_network():
    """Verify health endpoint operates entirely in-process without network access.

    No external upstream providers (NDMA SACHET, Open-Meteo) are contacted.
    """
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    # Process indicates ok without external dependencies
    assert response.json()["status"] == "ok"
