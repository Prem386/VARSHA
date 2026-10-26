"""Normalized rainfall forecast schemas for Open-Meteo integration.

CRITICAL DISTINCTIONS & SEMANTICS:
1. Model-derived NWP output: All values are derived from numerical weather prediction
   models, NOT direct physical rain-gauge observations.
2. Accumulation vs Rate: Values represent accumulated precipitation in millimeters (mm)
   over the specified time interval (e.g., preceding 1 hour or 15 minutes), NOT an
   instantaneous precipitation rate (mm/h).
3. Probability vs Amount: precipitation_probability_pct (0-100%) indicates likelihood
   of rain and must not be confused with precipitation amount (mm).
4. No Inundation Claim: Rainfall indicates meteorological moisture; it does NOT confirm
   road inundation or waterlogging.
5. Missing Data vs Zero Rain: 0.0 mm represents a valid model forecast of zero rainfall;
   missing, failed, or unmeasured intervals are represented as None/null. Provider
   failures return an explicit unavailable state, never a zero-rainfall report.
"""
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field
from app.schemas.common import Coordinate

DEFAULT_RAINFALL_CAVEATS: List[str] = [
    "Rainfall data is model-derived numerical weather prediction (NWP), not a direct physical rain-gauge observation.",
    "Precipitation (mm) represents model accumulation over the preceding interval (e.g. 15 min or 1 hour), not an instantaneous rate (mm/h).",
    "Precipitation probability (%) is the likelihood of precipitation occurring, not the rain amount.",
    "Rainfall does not confirm that a road or path is flooded.",
    "Forecast values have inherent uncertainty and spatial grid resolution limits (~1-10 km depending on NWP model).",
]


class RainfallProviderStatus(BaseModel):
    """Metadata regarding Open-Meteo retrieval health and cache status."""

    provider: str = Field(
        default="open_meteo",
        description="Provider name identifier.",
    )
    status: str = Field(
        ...,
        description="Operational health: 'ok', 'degraded' (stale cache fallback), or 'unavailable'.",
    )
    is_cached: bool = Field(
        default=False,
        description="True if served from internal memory cache; False if fresh upstream fetch.",
    )
    is_stale: bool = Field(
        default=False,
        description="True if cache TTL expired and stale fallback data is being served.",
    )
    retrieved_at: Optional[datetime] = Field(
        default=None,
        description="UTC timestamp when the returned rainfall data was fetched from upstream.",
    )
    error_message: Optional[str] = Field(
        default=None,
        description="Safe, sanitized error summary if an upstream issue occurred.",
    )
    endpoint_url: str = Field(
        ...,
        description="Upstream API endpoint URL requested.",
    )


class ModelSourceMetadata(BaseModel):
    """Open-Meteo numerical weather prediction model provenance and grid attributes."""

    source: str = Field(
        default="Open-Meteo Weather Forecast API",
        description="Data provider source name.",
    )
    grid_latitude: Optional[float] = Field(
        default=None,
        description="Resolved numerical weather model grid cell latitude.",
    )
    grid_longitude: Optional[float] = Field(
        default=None,
        description="Resolved numerical weather model grid cell longitude.",
    )
    elevation_m: Optional[float] = Field(
        default=None,
        description="Surface elevation of grid point in meters.",
    )
    generationtime_ms: Optional[float] = Field(
        default=None,
        description="Upstream forecast generation time in milliseconds.",
    )
    utc_offset_seconds: int = Field(
        default=0,
        description="Timezone offset from UTC in seconds (normalized to 0).",
    )
    timezone: str = Field(
        default="UTC",
        description="Timezone of time series values (normalized to UTC).",
    )


class PrecipitationStep(BaseModel):
    """Timestamped precipitation step for an hourly forecast window."""

    timestamp: datetime = Field(
        ...,
        description="Start UTC timestamp of the precipitation interval.",
    )
    precipitation_mm: Optional[float] = Field(
        default=None,
        ge=0.0,
        description="Accumulated precipitation in millimeters for this interval (None if missing/null upstream).",
    )
    precipitation_probability_pct: Optional[float] = Field(
        default=None,
        ge=0.0,
        le=100.0,
        description="Probability of precipitation in percentage (0-100%).",
    )
    interval_minutes: int = Field(
        default=60,
        description="Duration of accumulation interval in minutes (60 for hourly steps).",
    )
    unit: str = Field(
        default="mm",
        description="Precipitation accumulation measurement unit.",
    )
    is_model_derived: bool = Field(
        default=True,
        description="Explicit flag: always True for NWP forecast model data.",
    )


class CurrentRainfall(BaseModel):
    """Current-window model-derived precipitation estimate."""

    timestamp: datetime = Field(
        ...,
        description="UTC timestamp of the current model evaluation window.",
    )
    interval_seconds: int = Field(
        default=900,
        description="Duration of the current evaluation window in seconds (e.g. 900s = 15m).",
    )
    precipitation_mm: Optional[float] = Field(
        default=None,
        ge=0.0,
        description="Model-estimated accumulated precipitation in mm over the preceding window.",
    )
    unit: str = Field(
        default="mm",
        description="Measurement unit.",
    )
    is_model_derived: bool = Field(
        default=True,
        description="Explicit flag: always True. This is NOT a physical rain-gauge observation.",
    )
    is_physical_observation: bool = Field(
        default=False,
        description="Explicit flag: always False. Do NOT treat current model output as gauge data.",
    )
    interval_description: str = Field(
        default="Preceding interval model accumulation estimate",
        description="Clarification of window semantics.",
    )


class RainfallSummary(BaseModel):
    """Aggregated summary of the returned forecast horizon."""

    forecast_hours: int = Field(
        ...,
        description="Requested forecast horizon in hours.",
    )
    total_precipitation_mm: Optional[float] = Field(
        default=None,
        description="Sum of non-null hourly precipitation accumulations over the forecast window.",
    )
    max_hourly_precipitation_mm: Optional[float] = Field(
        default=None,
        description="Maximum single-hour precipitation accumulation over the forecast window.",
    )
    max_probability_pct: Optional[float] = Field(
        default=None,
        description="Highest precipitation probability recorded in the forecast window.",
    )
    valid_hours: Optional[int] = Field(
        default=None,
        description="Count of valid non-null hourly intervals included in the summary.",
    )
    is_complete: bool = Field(
        default=True,
        description="True if all requested forecast hours contain valid non-null precipitation data.",
    )


class RainfallResponse(BaseModel):
    """Normalized API response for GET /api/v1/rainfall."""

    provider: RainfallProviderStatus = Field(
        ...,
        description="Operational health, cache metadata, and upstream provenance.",
    )
    requested_coordinate: Coordinate = Field(
        ...,
        description="Original user-requested geographic coordinate.",
    )
    data_type: str = Field(
        default="forecast_model",
        description="Data classification: 'forecast_model', explicitly distinguishing from 'physical_observation'.",
    )
    is_model_derived: bool = Field(
        default=True,
        description="True for all NWP forecast values.",
    )
    is_physical_observation: bool = Field(
        default=False,
        description="Always False for Open-Meteo forecast output.",
    )
    model_metadata: Optional[ModelSourceMetadata] = Field(
        default=None,
        description="Provider model resolution and grid attributes.",
    )
    current: Optional[CurrentRainfall] = Field(
        default=None,
        description="Current evaluation window model estimate, if provided by upstream.",
    )
    hourly: List[PrecipitationStep] = Field(
        default_factory=list,
        description="Chronological time series of hourly accumulation forecasts.",
    )
    summary: Optional[RainfallSummary] = Field(
        default=None,
        description="Horizon summary metrics (None on provider failure).",
    )
    caveats: List[str] = Field(
        default_factory=lambda: list(DEFAULT_RAINFALL_CAVEATS),
        description="Essential domain caveats regarding NWP model limitations and flood disclaimers.",
    )
