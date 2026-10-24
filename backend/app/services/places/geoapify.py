"""Geoapify geocoding provider, parser, and in-memory search cache.

Interacts with the Geoapify Autocomplete API, normalizes GeoJSON features
into provider-independent Pydantic PlaceSearchResult models, and maintains
a bounded in-memory cache to reduce external quota consumption.
"""
import asyncio
import logging
import math
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import httpx

from app.core.config import settings
from app.schemas.places import PlaceSearchResponse, PlaceSearchResult

logger = logging.getLogger(__name__)


class GeoapifyError(Exception):
    """Base exception for Geoapify geocoding operations."""


class GeoapifyConfigError(GeoapifyError):
    """Raised when the Geoapify API key is missing or unconfigured."""


class GeoapifyAuthError(GeoapifyError):
    """Raised when upstream authentication fails (HTTP 401/403)."""


class GeoapifyRateLimitError(GeoapifyError):
    """Raised when upstream rate limits or quota are exceeded (HTTP 429)."""


class GeoapifyTimeoutError(GeoapifyError):
    """Raised when upstream requests exceed the configured timeout."""


class GeoapifyUpstreamError(GeoapifyError):
    """Raised when upstream returns 5xx server errors or malformed payloads."""


class GeoapifyNetworkError(GeoapifyError):
    """Raised on network connection errors reaching Geoapify."""


def _is_valid_coord(val: Any, min_val: float, max_val: float) -> bool:
    """Validate that val is a finite number within [min_val, max_val]."""
    if val is None:
        return False
    try:
        num = float(val)
        return not math.isnan(num) and not math.isinf(num) and min_val <= num <= max_val
    except (ValueError, TypeError):
        return False


def normalize_geoapify_feature(
    feature: Dict[str, Any], index: int = 0
) -> Optional[PlaceSearchResult]:
    """Normalize a single Geoapify GeoJSON feature into PlaceSearchResult.

    Validates coordinates, extracts legible name and address, and safely rejects
    malformed features missing valid geometry.
    """
    if not isinstance(feature, dict):
        return None

    props = feature.get("properties")
    if not isinstance(props, dict):
        props = {}

    geom = feature.get("geometry")
    if not isinstance(geom, dict):
        geom = {}

    # Extract coordinates: properties.lat/lon preferred, fallback to geometry.coordinates [lon, lat]
    lat_raw = props.get("lat")
    lon_raw = props.get("lon")

    if lat_raw is None or lon_raw is None:
        coords = geom.get("coordinates")
        if isinstance(coords, (list, tuple)) and len(coords) >= 2:
            lon_raw = coords[0]
            lat_raw = coords[1]

    if not _is_valid_coord(lat_raw, -90.0, 90.0) or not _is_valid_coord(lon_raw, -180.0, 180.0):
        return None

    lat = float(lat_raw)
    lon = float(lon_raw)

    # Place ID
    raw_id = props.get("place_id")
    place_id = str(raw_id).strip() if raw_id is not None and str(raw_id).strip() else f"geoapify-{index}-{lat:.6f}-{lon:.6f}"

    # Primary display name
    name: Optional[str] = None
    if props.get("name") and str(props["name"]).strip():
        name = str(props["name"]).strip()
    elif props.get("address_line1") and str(props["address_line1"]).strip():
        name = str(props["address_line1"]).strip()
    elif props.get("formatted") and str(props["formatted"]).strip():
        name = str(props["formatted"]).strip().split(",")[0].strip()
    else:
        name = f"Location ({lat:.4f}, {lon:.4f})"

    # Formatted address
    formatted_address: Optional[str] = None
    if props.get("formatted") and str(props["formatted"]).strip():
        formatted_address = str(props["formatted"]).strip()
    else:
        parts = [
            str(props.get("address_line1") or "").strip(),
            str(props.get("address_line2") or "").strip(),
        ]
        clean_parts = [p for p in parts if p]
        formatted_address = ", ".join(clean_parts) if clean_parts else name

    # Category / classification
    raw_cat = props.get("category") or props.get("result_type")
    category = str(raw_cat).strip() if raw_cat and str(raw_cat).strip() else None

    # Locality (suburb, district, city, or state)
    raw_locality = (
        props.get("suburb")
        or props.get("district")
        or props.get("city")
        or props.get("state")
    )
    locality = str(raw_locality).strip() if raw_locality and str(raw_locality).strip() else None

    return PlaceSearchResult(
        id=place_id,
        name=name,
        formatted_address=formatted_address,
        latitude=lat,
        longitude=lon,
        source="geoapify",
        category=category,
        locality=locality,
    )


def parse_geoapify_response(
    raw_data: Dict[str, Any], query: str, limit: int, cached: bool = False
) -> PlaceSearchResponse:
    """Parse raw Geoapify GeoJSON response into validated PlaceSearchResponse."""
    if not isinstance(raw_data, dict):
        raise GeoapifyUpstreamError("Invalid Geoapify response: root must be a JSON object.")

    features = raw_data.get("features")
    if not isinstance(features, list):
        features = []

    results: List[PlaceSearchResult] = []
    for idx, feat in enumerate(features):
        normalized = normalize_geoapify_feature(feat, index=idx)
        if normalized is not None:
            results.append(normalized)
            if len(results) >= limit:
                break

    return PlaceSearchResponse(
        query=query,
        total=len(results),
        results=results,
        source="geoapify",
        cached=cached,
    )


@dataclass
class _CacheEntry:
    response: PlaceSearchResponse
    cached_at: datetime


class GeoapifySearchCache:
    """Bounded in-memory FIFO cache for geocoding search queries."""

    def __init__(self, max_entries: int = 128, ttl_seconds: int = 300) -> None:
        self.max_entries = max_entries
        self.ttl_seconds = ttl_seconds
        self._entries: Dict[str, _CacheEntry] = {}

    @staticmethod
    def make_key(query: str, limit: int) -> str:
        return f"{query.strip().lower()}:{limit}"

    def get(self, key: str, now: Optional[datetime] = None) -> Optional[PlaceSearchResponse]:
        entry = self._entries.get(key)
        if entry is None:
            return None
        current_time = now or datetime.now(timezone.utc)
        if (current_time - entry.cached_at).total_seconds() > self.ttl_seconds:
            self._entries.pop(key, None)
            return None
        return entry.response

    def set(
        self,
        key: str,
        response: PlaceSearchResponse,
        cached_at: Optional[datetime] = None,
    ) -> None:
        saved_time = cached_at or datetime.now(timezone.utc)
        if len(self._entries) >= self.max_entries and key not in self._entries:
            # Evict oldest inserted entry
            oldest_key = next(iter(self._entries))
            self._entries.pop(oldest_key, None)
        self._entries[key] = _CacheEntry(response=response, cached_at=saved_time)

    def clear(self) -> None:
        self._entries.clear()

    @property
    def entry_count(self) -> int:
        return len(self._entries)


class GeoapifyProvider:
    """Client provider for Geoapify Autocomplete Geocoding API."""

    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        timeout_seconds: Optional[float] = None,
        cache_ttl_seconds: Optional[int] = None,
        bias_proximity: Optional[str] = None,
        country_filter: Optional[str] = None,
    ) -> None:
        self._api_key = api_key
        self.base_url = base_url or settings.GEOAPIFY_BASE_URL
        self.timeout_seconds = (
            timeout_seconds
            if timeout_seconds is not None
            else settings.GEOAPIFY_REQUEST_TIMEOUT_SECONDS
        )
        ttl = (
            cache_ttl_seconds
            if cache_ttl_seconds is not None
            else settings.GEOAPIFY_CACHE_TTL_SECONDS
        )
        self.bias_proximity = (
            bias_proximity
            if bias_proximity is not None
            else settings.GEOAPIFY_BIAS_PROXIMITY
        )
        self.country_filter = (
            country_filter
            if country_filter is not None
            else settings.GEOAPIFY_COUNTRY_FILTER
        )
        self.cache = GeoapifySearchCache(max_entries=128, ttl_seconds=ttl)
        self._lock = asyncio.Lock()

    @property
    def api_key(self) -> Optional[str]:
        # Lazily read from settings if not explicitly configured
        return self._api_key if self._api_key is not None else settings.GEOAPIFY_API_KEY

    def build_query_params(self, query: str, limit: int) -> Dict[str, Any]:
        """Build request parameters for Geoapify Autocomplete."""
        params: Dict[str, Any] = {
            "text": query,
            "apiKey": self.api_key,
            "limit": limit,
            "format": "geojson",
        }
        if self.bias_proximity:
            params["bias"] = f"proximity:{self.bias_proximity}"
        if self.country_filter:
            params["filter"] = f"countrycode:{self.country_filter}"
        return params

    async def search(
        self,
        query: str,
        limit: int = 5,
        client: Optional[httpx.AsyncClient] = None,
    ) -> PlaceSearchResponse:
        """Search places by text query with debouncing, caching, and upstream error mapping."""
        q_clean = query.strip()
        if len(q_clean) < 2:
            raise ValueError("Search query must contain at least 2 characters.")

        if not self.api_key:
            raise GeoapifyConfigError("Geocoding service unavailable: API key not configured.")

        cache_key = self.cache.make_key(q_clean, limit)
        cached = self.cache.get(cache_key)
        if cached is not None:
            return cached.model_copy(update={"cached": True})

        async with self._lock:
            # Re-check cache under lock
            cached = self.cache.get(cache_key)
            if cached is not None:
                return cached.model_copy(update={"cached": True})

            should_close = False
            if client is None:
                client = httpx.AsyncClient(timeout=self.timeout_seconds)
                should_close = True

            try:
                params = self.build_query_params(q_clean, limit)
                headers = {"User-Agent": "VARSHA-Mobility-Safety/0.1"}
                resp = await client.get(self.base_url, params=params, headers=headers)

                if resp.status_code in (401, 403):
                    logger.warning("Geoapify upstream authentication failed (HTTP %d)", resp.status_code)
                    raise GeoapifyAuthError("Geocoding provider authentication failed.")
                elif resp.status_code == 429:
                    logger.warning("Geoapify upstream rate limit reached (HTTP 429)")
                    raise GeoapifyRateLimitError("Geocoding provider rate limit exceeded. Please try again later.")
                elif resp.status_code >= 500:
                    logger.warning("Geoapify upstream server error (HTTP %d)", resp.status_code)
                    raise GeoapifyUpstreamError("Geocoding provider upstream error.")
                elif resp.status_code != 200:
                    logger.warning("Geoapify upstream unexpected status (HTTP %d)", resp.status_code)
                    raise GeoapifyUpstreamError(f"Geocoding provider returned status {resp.status_code}.")

                raw_json = resp.json()
                parsed = parse_geoapify_response(
                    raw_data=raw_json,
                    query=q_clean,
                    limit=limit,
                    cached=False,
                )
                self.cache.set(cache_key, parsed)
                return parsed
            except httpx.TimeoutException as exc:
                logger.warning("Geoapify timeout for query '%s'", q_clean)
                raise GeoapifyTimeoutError("Geocoding provider request timed out.") from exc
            except httpx.RequestError as exc:
                logger.warning("Geoapify network error: %s", type(exc).__name__)
                raise GeoapifyNetworkError("Unable to connect to geocoding provider.") from exc
            finally:
                if should_close:
                    await client.aclose()


# Global singleton instance
geoapify_provider = GeoapifyProvider()
