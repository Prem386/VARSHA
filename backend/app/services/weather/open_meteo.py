"""Open-Meteo rainfall provider and in-memory cache.

Retrieves numerical weather prediction forecast data from Open-Meteo, normalizes
into provider-independent models with explicit model semantics, and maintains
a bounded single-process in-memory TTL cache with stale-data fallback.

NOTE ON SINGLE-PROCESS IN-MEMORY CACHE:
Cache state is stored in process memory and will reset upon application restart.
Cache state is NOT shared across multiple worker processes or containers.
Coordinate quantization (2 decimal places, ~1.1 km) is applied strictly as an
internal caching optimization to reduce redundant external API calls; it does
NOT represent an exact physical measurement station or sensor location.
"""
import asyncio
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

import httpx

from app.core.config import settings
from app.schemas.common import Coordinate
from app.schemas.rainfall import (
    CurrentRainfall,
    DEFAULT_RAINFALL_CAVEATS,
    ModelSourceMetadata,
    PrecipitationStep,
    RainfallProviderStatus,
    RainfallResponse,
    RainfallSummary,
)

logger = logging.getLogger(__name__)


def _parse_utc_datetime(val: Optional[str]) -> Optional[datetime]:
    """Parse ISO 8601 string into timezone-aware UTC datetime."""
    if not val or not isinstance(val, str) or not val.strip():
        return None
    try:
        clean_str = val.strip().replace("Z", "+00:00")
        dt = datetime.fromisoformat(clean_str)
        if dt.tzinfo is None:
            return dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except Exception:
        return None


def parse_open_meteo_response(
    raw_data: Dict[str, Any],
    requested_lat: float,
    requested_lon: float,
    forecast_hours: int,
    endpoint_url: str,
    retrieved_at: datetime,
    is_cached: bool = False,
    is_stale: bool = False,
) -> RainfallResponse:
    """Parse and normalize Open-Meteo JSON into a validated RainfallResponse.

    Validates schema structure, normalizes timestamps to UTC, computes summary metrics,
    and preserves null/missing distinction from valid 0.0 mm amounts.
    """
    if not isinstance(raw_data, dict):
        raise ValueError("Invalid Open-Meteo response: top-level JSON must be an object.")

    # 1. Model & Grid Metadata
    model_meta = ModelSourceMetadata(
        source="Open-Meteo Weather Forecast API",
        grid_latitude=raw_data.get("latitude"),
        grid_longitude=raw_data.get("longitude"),
        elevation_m=raw_data.get("elevation"),
        generationtime_ms=raw_data.get("generationtime_ms"),
        utc_offset_seconds=raw_data.get("utc_offset_seconds", 0) or 0,
        timezone=str(raw_data.get("timezone", "UTC")),
    )

    # 2. Hourly Precipitation Series
    hourly_block = raw_data.get("hourly")
    if not isinstance(hourly_block, dict):
        raise ValueError("Invalid Open-Meteo response: 'hourly' section is required.")

    times = hourly_block.get("time")
    if not isinstance(times, list) or not times:
        raise ValueError("Invalid Open-Meteo response: 'hourly.time' list is required.")

    precip_list = hourly_block.get("precipitation")
    if not isinstance(precip_list, list):
        precip_list = [None] * len(times)

    prob_list = hourly_block.get("precipitation_probability")
    if not isinstance(prob_list, list):
        prob_list = [None] * len(times)

    hourly_steps: List[PrecipitationStep] = []
    # Bound steps to the requested forecast_hours horizon
    limit = min(len(times), forecast_hours)

    for i in range(limit):
        raw_t = times[i]
        parsed_dt = _parse_utc_datetime(raw_t)
        if parsed_dt is None:
            continue

        raw_p = precip_list[i] if i < len(precip_list) else None
        p_val: Optional[float] = None
        if raw_p is not None:
            try:
                p_val = max(0.0, float(raw_p))
            except (ValueError, TypeError):
                p_val = None

        raw_prob = prob_list[i] if i < len(prob_list) else None
        prob_val: Optional[float] = None
        if raw_prob is not None:
            try:
                prob_val = min(100.0, max(0.0, float(raw_prob)))
            except (ValueError, TypeError):
                prob_val = None

        hourly_steps.append(
            PrecipitationStep(
                timestamp=parsed_dt,
                precipitation_mm=p_val,
                precipitation_probability_pct=prob_val,
                interval_minutes=60,
                unit="mm",
                is_model_derived=True,
            )
        )

    # 3. Current-window estimate (if supplied by provider)
    current_obj: Optional[CurrentRainfall] = None
    raw_current = raw_data.get("current")
    if isinstance(raw_current, dict) and "time" in raw_current:
        cur_dt = _parse_utc_datetime(raw_current.get("time"))
        if cur_dt is not None:
            raw_cur_p = raw_current.get("precipitation")
            cur_p_val: Optional[float] = None
            if raw_cur_p is not None:
                try:
                    cur_p_val = max(0.0, float(raw_cur_p))
                except (ValueError, TypeError):
                    cur_p_val = None

            interval_sec = 900
            if "interval" in raw_current:
                try:
                    interval_sec = int(raw_current["interval"])
                except (ValueError, TypeError):
                    interval_sec = 900

            current_obj = CurrentRainfall(
                timestamp=cur_dt,
                interval_seconds=interval_sec,
                precipitation_mm=cur_p_val,
                unit="mm",
                is_model_derived=True,
                is_physical_observation=False,
                interval_description=(
                    f"Preceding {interval_sec // 60}-minute model accumulation estimate"
                ),
            )

    # 4. Forecast Summary Metrics
    non_null_precips = [s.precipitation_mm for s in hourly_steps if s.precipitation_mm is not None]
    non_null_probs = [
        s.precipitation_probability_pct
        for s in hourly_steps
        if s.precipitation_probability_pct is not None
    ]

    total_mm: Optional[float] = (
        round(sum(non_null_precips), 2) if non_null_precips else None
    )
    max_hourly_mm: Optional[float] = (
        round(max(non_null_precips), 2) if non_null_precips else None
    )
    max_prob: Optional[float] = (
        round(max(non_null_probs), 1) if non_null_probs else None
    )

    summary = RainfallSummary(
        forecast_hours=forecast_hours,
        total_precipitation_mm=total_mm,
        max_hourly_precipitation_mm=max_hourly_mm,
        max_probability_pct=max_prob,
    )

    # 5. Provider Status
    provider_status = RainfallProviderStatus(
        provider="open_meteo",
        status="ok",
        is_cached=is_cached,
        is_stale=is_stale,
        retrieved_at=retrieved_at,
        error_message=None,
        endpoint_url=endpoint_url,
    )

    return RainfallResponse(
        provider=provider_status,
        requested_coordinate=Coordinate(latitude=requested_lat, longitude=requested_lon),
        data_type="forecast_model",
        is_model_derived=True,
        is_physical_observation=False,
        model_metadata=model_meta,
        current=current_obj,
        hourly=hourly_steps,
        summary=summary,
        caveats=list(DEFAULT_RAINFALL_CAVEATS),
    )


@dataclass
class _CachedRainfallEntry:
    """Internal cache entry wrapper."""

    response: RainfallResponse
    cached_at: datetime
    endpoint_url: str


class OpenMeteoCache:
    """Bounded in-memory TTL cache for single-process Open-Meteo forecasts.

    Features:
    - Quantized coordinate keying (2 decimal places ~1.1km)
    - Deterministic time-injection for zero-sleep expiry testing
    - Resets on application restart (single-process prototype)
    """

    def __init__(self, ttl_seconds: int = 900) -> None:
        self.ttl_seconds = ttl_seconds
        self._entries: Dict[str, _CachedRainfallEntry] = {}

    @staticmethod
    def make_key(latitude: float, longitude: float, forecast_hours: int) -> str:
        """Create cache key from quantized coordinates and forecast horizon."""
        q_lat = round(latitude, 2)
        q_lon = round(longitude, 2)
        return f"{q_lat:.2f}:{q_lon:.2f}:{forecast_hours}"

    def get(
        self, key: str, now: Optional[datetime] = None
    ) -> Optional[Tuple[RainfallResponse, bool, datetime]]:
        """Retrieve cached entry. Returns (response, is_stale, cached_at) or None."""
        entry = self._entries.get(key)
        if entry is None:
            return None

        current_time = now or datetime.now(timezone.utc)
        age = (current_time - entry.cached_at).total_seconds()
        is_stale = age > self.ttl_seconds
        return entry.response, is_stale, entry.cached_at

    def set(
        self,
        key: str,
        response: RainfallResponse,
        endpoint_url: str,
        cached_at: Optional[datetime] = None,
    ) -> None:
        """Store response in cache."""
        saved_time = cached_at or datetime.now(timezone.utc)
        self._entries[key] = _CachedRainfallEntry(
            response=response,
            cached_at=saved_time,
            endpoint_url=endpoint_url,
        )

    def clear(self) -> None:
        """Clear all cached entries."""
        self._entries.clear()

    @property
    def entry_count(self) -> int:
        """Number of cached entries."""
        return len(self._entries)


class OpenMeteoProvider:
    """Asynchronous client provider for Open-Meteo numerical weather forecasts."""

    def __init__(
        self,
        base_url: Optional[str] = None,
        timeout_seconds: Optional[float] = None,
        cache_ttl_seconds: Optional[int] = None,
        max_forecast_hours: Optional[int] = None,
    ) -> None:
        self.base_url = base_url or settings.OPEN_METEO_BASE_URL
        self.timeout_seconds = (
            timeout_seconds
            if timeout_seconds is not None
            else settings.OPEN_METEO_REQUEST_TIMEOUT_SECONDS
        )
        ttl = (
            cache_ttl_seconds
            if cache_ttl_seconds is not None
            else settings.OPEN_METEO_CACHE_TTL_SECONDS
        )
        self.max_forecast_hours = (
            max_forecast_hours
            if max_forecast_hours is not None
            else settings.OPEN_METEO_MAX_FORECAST_HOURS
        )
        self.cache = OpenMeteoCache(ttl_seconds=ttl)
        self._lock = asyncio.Lock()

    def build_query_params(
        self, latitude: float, longitude: float, forecast_hours: int
    ) -> Dict[str, Any]:
        """Build validated Open-Meteo HTTP query parameters."""
        return {
            "latitude": latitude,
            "longitude": longitude,
            "hourly": "precipitation,precipitation_probability",
            "current": "precipitation",
            "forecast_hours": forecast_hours,
            "timezone": "UTC",
        }

    def build_endpoint_url(
        self, latitude: float, longitude: float, forecast_hours: int
    ) -> str:
        """Construct full request URL with query parameters for audit/status tracking."""
        params = self.build_query_params(latitude, longitude, forecast_hours)
        query_str = "&".join(f"{k}={v}" for k, v in params.items())
        return f"{self.base_url}?{query_str}"

    async def fetch_rainfall(
        self,
        latitude: float,
        longitude: float,
        forecast_hours: int = 24,
        client: Optional[httpx.AsyncClient] = None,
    ) -> RainfallResponse:
        """Retrieve rainfall forecast for a coordinate.

        Concurrency & Resilience Flow:
        1. Coordinate quantized cache lookup (fast hit).
        2. If fresh cache hit -> return response marked is_cached=True.
        3. If miss/stale -> acquire async lock to prevent duplicate concurrent upstream queries.
        4. On upstream success -> cache entry and return response.
        5. On upstream failure:
           - If stale cached entry exists -> return stale data with status='degraded', is_stale=True.
           - If cold start -> return explicit status='unavailable', empty series, no zero-rain claim.
        """
        hours = max(1, min(forecast_hours, self.max_forecast_hours))
        cache_key = self.cache.make_key(latitude, longitude, hours)
        endpoint_url = self.build_endpoint_url(latitude, longitude, hours)

        # Fast cache check without waiting on lock if entry is fresh
        cached = self.cache.get(cache_key)
        if cached is not None:
            cached_resp, is_stale, cached_at = cached
            if not is_stale:
                return cached_resp.model_copy(
                    update={
                        "provider": RainfallProviderStatus(
                            provider="open_meteo",
                            status="ok",
                            is_cached=True,
                            is_stale=False,
                            retrieved_at=cached_at,
                            error_message=None,
                            endpoint_url=cached_resp.provider.endpoint_url,
                        ),
                        "requested_coordinate": Coordinate(
                            latitude=latitude, longitude=longitude
                        ),
                    }
                )

        # Acquire lock to prevent thundering herd / duplicate concurrent requests
        async with self._lock:
            # Re-check cache under lock
            cached = self.cache.get(cache_key)
            if cached is not None:
                cached_resp, is_stale, cached_at = cached
                if not is_stale:
                    return cached_resp.model_copy(
                        update={
                            "provider": RainfallProviderStatus(
                                provider="open_meteo",
                                status="ok",
                                is_cached=True,
                                is_stale=False,
                                retrieved_at=cached_at,
                                error_message=None,
                                endpoint_url=cached_resp.provider.endpoint_url,
                            ),
                            "requested_coordinate": Coordinate(
                                latitude=latitude, longitude=longitude
                            ),
                        }
                    )

            should_close = False
            if client is None:
                client = httpx.AsyncClient(timeout=self.timeout_seconds)
                should_close = True

            now_utc = datetime.now(timezone.utc)
            try:
                params = self.build_query_params(latitude, longitude, hours)
                headers = {"User-Agent": "VARSHA-Mobility-Safety/0.1"}
                resp = await client.get(self.base_url, params=params, headers=headers)
                resp.raise_for_status()

                raw_json = resp.json()
                parsed = parse_open_meteo_response(
                    raw_data=raw_json,
                    requested_lat=latitude,
                    requested_lon=longitude,
                    forecast_hours=hours,
                    endpoint_url=str(resp.url),
                    retrieved_at=now_utc,
                    is_cached=False,
                    is_stale=False,
                )
                self.cache.set(cache_key, parsed, str(resp.url), cached_at=now_utc)
                return parsed
            except Exception as exc:
                safe_err = f"Upstream forecast request failed: {type(exc).__name__}"
                logger.warning("Open-Meteo fetch error: %s", exc)

                # Serve stale cache if available
                if cached is not None:
                    cached_resp, _, cached_at = cached
                    return cached_resp.model_copy(
                        update={
                            "provider": RainfallProviderStatus(
                                provider="open_meteo",
                                status="degraded",
                                is_cached=True,
                                is_stale=True,
                                retrieved_at=cached_at,
                                error_message=safe_err,
                                endpoint_url=cached_resp.provider.endpoint_url,
                            ),
                            "requested_coordinate": Coordinate(
                                latitude=latitude, longitude=longitude
                            ),
                        }
                    )

                # Cold-start failure: return explicit unavailable state
                return RainfallResponse(
                    provider=RainfallProviderStatus(
                        provider="open_meteo",
                        status="unavailable",
                        is_cached=False,
                        is_stale=False,
                        retrieved_at=None,
                        error_message=safe_err,
                        endpoint_url=endpoint_url,
                    ),
                    requested_coordinate=Coordinate(
                        latitude=latitude, longitude=longitude
                    ),
                    data_type="forecast_model",
                    is_model_derived=True,
                    is_physical_observation=False,
                    model_metadata=None,
                    current=None,
                    hourly=[],
                    summary=None,
                    caveats=list(DEFAULT_RAINFALL_CAVEATS),
                )
            finally:
                if should_close:
                    await client.aclose()


# Global singleton instance
open_meteo_provider = OpenMeteoProvider()
