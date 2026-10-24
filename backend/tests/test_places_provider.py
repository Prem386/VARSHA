"""Unit tests for GeoapifyProvider client, error mapping, and search cache."""
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock
import httpx
import pytest

from app.schemas.places import PlaceSearchResponse, PlaceSearchResult
from app.services.places.geoapify import (
    GeoapifyAuthError,
    GeoapifyConfigError,
    GeoapifyNetworkError,
    GeoapifyProvider,
    GeoapifyRateLimitError,
    GeoapifySearchCache,
    GeoapifyTimeoutError,
    GeoapifyUpstreamError,
)


@pytest.fixture
def mock_geojson_response():
    return {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": [72.9985, 19.0760],
                },
                "properties": {
                    "place_id": "geo-inorbit-vashi",
                    "name": "Inorbit Mall",
                    "formatted": "Inorbit Mall, Sector 30A, Vashi, Navi Mumbai, Maharashtra, India",
                    "category": "commercial.shopping_mall",
                    "suburb": "Vashi",
                    "lat": 19.0760,
                    "lon": 72.9985,
                },
            }
        ],
    }


def test_cache_set_get_and_expiration():
    cache = GeoapifySearchCache(max_entries=5, ttl_seconds=60)
    key = cache.make_key("Inorbit Mall", 5)

    sample_response = PlaceSearchResponse(
        query="Inorbit Mall",
        total=1,
        results=[
            PlaceSearchResult(
                id="p1",
                name="Inorbit Mall",
                formatted_address="Vashi",
                latitude=19.076,
                longitude=72.998,
            )
        ],
        source="geoapify",
        cached=False,
    )

    t0 = datetime(2026, 10, 24, 12, 0, 0, tzinfo=timezone.utc)
    cache.set(key, sample_response, cached_at=t0)

    # Fresh hit
    hit = cache.get(key, now=t0 + timedelta(seconds=30))
    assert hit is not None
    assert hit.results[0].name == "Inorbit Mall"

    # Expired hit
    expired = cache.get(key, now=t0 + timedelta(seconds=61))
    assert expired is None
    assert cache.entry_count == 0


def test_cache_bounded_fifo_eviction():
    cache = GeoapifySearchCache(max_entries=2, ttl_seconds=300)
    resp = PlaceSearchResponse(query="q", total=0, results=[], source="geoapify")

    cache.set("k1", resp)
    cache.set("k2", resp)
    assert cache.entry_count == 2

    # Adding third entry should evict oldest (k1)
    cache.set("k3", resp)
    assert cache.entry_count == 2
    assert cache.get("k1") is None
    assert cache.get("k2") is not None
    assert cache.get("k3") is not None


@pytest.mark.anyio
async def test_search_raises_config_error_when_api_key_missing():
    provider = GeoapifyProvider(api_key="")
    with pytest.raises(GeoapifyConfigError) as exc_info:
        await provider.search("Inorbit Mall")
    assert "API key not configured" in str(exc_info.value)


@pytest.mark.anyio
async def test_search_raises_value_error_for_short_query():
    provider = GeoapifyProvider(api_key="test-key")
    with pytest.raises(ValueError) as exc_info:
        await provider.search(" a ")
    assert "at least 2 characters" in str(exc_info.value)


@pytest.mark.anyio
async def test_search_successful_http_call(mock_geojson_response):
    provider = GeoapifyProvider(api_key="test-key")

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = mock_geojson_response

    mock_client = AsyncMock(spec=httpx.AsyncClient)
    mock_client.get.return_value = mock_resp

    result = await provider.search("Inorbit Mall, Vashi", limit=5, client=mock_client)
    assert result.total == 1
    assert result.results[0].name == "Inorbit Mall"
    assert result.cached is False

    # Second call should be served from cache without calling HTTP client again
    mock_client.get.reset_mock()
    cached_result = await provider.search("Inorbit Mall, Vashi", limit=5, client=mock_client)
    assert cached_result.cached is True
    mock_client.get.assert_not_called()


@pytest.mark.anyio
async def test_search_handles_auth_error_without_leaking_key():
    secret_key = "secret_geoapify_key_xyz"
    provider = GeoapifyProvider(api_key=secret_key)

    mock_resp = MagicMock()
    mock_resp.status_code = 401

    mock_client = AsyncMock(spec=httpx.AsyncClient)
    mock_client.get.return_value = mock_resp

    with pytest.raises(GeoapifyAuthError) as exc_info:
        await provider.search("Inorbit Mall", client=mock_client)

    # Must NOT contain the secret API key
    assert secret_key not in str(exc_info.value)
    assert "authentication failed" in str(exc_info.value).lower()


@pytest.mark.anyio
async def test_search_handles_rate_limit_error():
    provider = GeoapifyProvider(api_key="test-key")

    mock_resp = MagicMock()
    mock_resp.status_code = 429

    mock_client = AsyncMock(spec=httpx.AsyncClient)
    mock_client.get.return_value = mock_resp

    with pytest.raises(GeoapifyRateLimitError):
        await provider.search("Inorbit Mall", client=mock_client)


@pytest.mark.anyio
async def test_search_handles_upstream_500_error():
    provider = GeoapifyProvider(api_key="test-key")

    mock_resp = MagicMock()
    mock_resp.status_code = 502

    mock_client = AsyncMock(spec=httpx.AsyncClient)
    mock_client.get.return_value = mock_resp

    with pytest.raises(GeoapifyUpstreamError):
        await provider.search("Inorbit Mall", client=mock_client)


@pytest.mark.anyio
async def test_search_handles_timeout():
    provider = GeoapifyProvider(api_key="test-key")

    mock_client = AsyncMock(spec=httpx.AsyncClient)
    mock_client.get.side_effect = httpx.TimeoutException("Connection timed out")

    with pytest.raises(GeoapifyTimeoutError):
        await provider.search("Inorbit Mall", client=mock_client)


@pytest.mark.anyio
async def test_search_handles_network_error():
    provider = GeoapifyProvider(api_key="test-key")

    mock_client = AsyncMock(spec=httpx.AsyncClient)
    mock_client.get.side_effect = httpx.ConnectError("Network unreachable")

    with pytest.raises(GeoapifyNetworkError):
        await provider.search("Inorbit Mall", client=mock_client)
