"""Tests for SachetAlertProvider caching, fallback, budgeting, and spatial filtering."""
from pathlib import Path
from typing import Any
import httpx
import pytest

from app.schemas.common import BoundingBox
from app.services.alerts.sachet import (
    SachetAlertProvider,
    SachetCache,
    filter_alerts_by_bbox,
    parse_cap_xml,
)

FIXTURES_DIR = Path(__file__).parent / "fixtures" / "sachet"


def _read_fixture(filename: str) -> str:
    path = FIXTURES_DIR / filename
    return path.read_text(encoding="utf-8")


@pytest.mark.anyio
async def test_provider_successful_fetch() -> None:
    """Test cold-start successful fetch retrieves RSS and CAP items, caches them."""
    rss_text = _read_fixture("rss_sample.xml")
    cap_text = _read_fixture("cap_alert_sample.xml")

    def handler(request: httpx.Request) -> httpx.Response:
        url_str = str(request.url)
        if "rss" in url_str:
            return httpx.Response(200, text=rss_text)
        return httpx.Response(200, text=cap_text)

    transport = httpx.MockTransport(handler)
    async with httpx.AsyncClient(transport=transport) as client:
        provider = SachetAlertProvider(
            feed_url="https://sachet.ndma.gov.in/test_rss.xml",
            cache_ttl_seconds=60,
            max_alerts_per_fetch=5,
        )
        alerts, status = await provider.fetch_alerts(client=client)

        assert status.status == "ok"
        assert status.is_cached is False
        assert status.is_stale is False
        assert len(alerts) == 2
        assert alerts[0].identifier == "TEST-ALERT-001"

        # Second call hits cache without invoking client
        alerts_cached, status_cached = await provider.fetch_alerts(client=client)
        assert status_cached.status == "ok"
        assert status_cached.is_cached is True
        assert status_cached.is_stale is False
        assert len(alerts_cached) == 2


@pytest.mark.anyio
async def test_provider_cold_start_failure() -> None:
    """Test cold start failure (upstream down, no cache) returns unavailable status."""
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(503, text="Service Unavailable")

    transport = httpx.MockTransport(handler)
    async with httpx.AsyncClient(transport=transport) as client:
        provider = SachetAlertProvider(cache_ttl_seconds=60)
        alerts, status = await provider.fetch_alerts(client=client)

        assert status.status == "unavailable"
        assert status.is_cached is False
        assert status.is_stale is False
        assert len(alerts) == 0
        assert "HTTPStatusError" in (status.error_message or "")


@pytest.mark.anyio
async def test_provider_stale_cache_fallback_on_upstream_failure() -> None:
    """Test that expired cache serves stale data when upstream is unreachable."""
    rss_text = _read_fixture("rss_sample.xml")
    cap_text = _read_fixture("cap_alert_sample.xml")
    fail_upstream = False

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal fail_upstream
        if fail_upstream:
            raise httpx.ConnectTimeout("Connection timed out to sachet.ndma.gov.in")
        url_str = str(request.url)
        if "rss" in url_str:
            return httpx.Response(200, text=rss_text)
        return httpx.Response(200, text=cap_text)

    transport = httpx.MockTransport(handler)
    async with httpx.AsyncClient(transport=transport) as client:
        # Cache with ttl=0 seconds so it immediately becomes stale
        provider = SachetAlertProvider(cache_ttl_seconds=0)
        alerts, status = await provider.fetch_alerts(client=client)

        assert status.status == "ok"
        assert len(alerts) == 2

        # Trigger upstream failure
        fail_upstream = True
        stale_alerts, stale_status = await provider.fetch_alerts(client=client)

        assert stale_status.status == "degraded"
        assert stale_status.is_cached is True
        assert stale_status.is_stale is True
        assert len(stale_alerts) == 2
        assert "ConnectTimeout" in (stale_status.error_message or "")


@pytest.mark.anyio
async def test_provider_empty_feed_distinguishable_from_failure() -> None:
    """Test empty RSS feed returns status 'ok' with zero alerts, not 'unavailable'."""
    rss_empty = _read_fixture("rss_empty.xml")

    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text=rss_empty)

    transport = httpx.MockTransport(handler)
    async with httpx.AsyncClient(transport=transport) as client:
        provider = SachetAlertProvider()
        alerts, status = await provider.fetch_alerts(client=client)

        assert status.status == "ok"
        assert status.is_cached is False
        assert status.is_stale is False
        assert len(alerts) == 0


@pytest.mark.anyio
async def test_provider_bounded_request_budget() -> None:
    """Test provider limits CAP fetches to max_alerts_per_fetch."""
    rss_text = _read_fixture("rss_sample.xml")  # has 2 items
    cap_text = _read_fixture("cap_alert_sample.xml")
    cap_fetch_count = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal cap_fetch_count
        url_str = str(request.url)
        if "rss" in url_str:
            return httpx.Response(200, text=rss_text)
        cap_fetch_count += 1
        return httpx.Response(200, text=cap_text)

    transport = httpx.MockTransport(handler)
    async with httpx.AsyncClient(transport=transport) as client:
        provider = SachetAlertProvider(max_alerts_per_fetch=1)
        alerts, _ = await provider.fetch_alerts(client=client)

        assert cap_fetch_count == 1
        assert len(alerts) == 1


def test_spatial_filtering_with_polygon_and_unresolved() -> None:
    """Test spatial filtering includes matching polygons and excludes unresolved district alerts."""
    poly_alert = parse_cap_xml(_read_fixture("cap_with_polygon.xml"))
    unresolved_alert = parse_cap_xml(_read_fixture("cap_alert_sample.xml"))

    # Polygon coords are around (19.03-19.05 lat, 73.02-73.04 lon)
    mumbai_bbox = BoundingBox(
        min_longitude=72.9,
        min_latitude=18.9,
        max_longitude=73.1,
        max_latitude=19.2,
    )
    pune_bbox = BoundingBox(
        min_longitude=73.7,
        min_latitude=18.4,
        max_longitude=74.0,
        max_latitude=18.6,
    )

    all_alerts = [poly_alert, unresolved_alert]

    # In Mumbai bbox: polygon alert matches, unresolved district alert does NOT match
    matched_mumbai = filter_alerts_by_bbox(all_alerts, mumbai_bbox)
    assert len(matched_mumbai) == 1
    assert matched_mumbai[0].identifier == poly_alert.identifier

    # In Pune bbox: neither matches
    matched_pune = filter_alerts_by_bbox(all_alerts, pune_bbox)
    assert len(matched_pune) == 0
