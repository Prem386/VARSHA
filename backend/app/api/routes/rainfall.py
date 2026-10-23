"""Rainfall forecast API routes."""
from fastapi import APIRouter, Query
from app.core.config import settings
from app.schemas.rainfall import RainfallResponse
from app.services.weather.open_meteo import open_meteo_provider

router = APIRouter(tags=["rainfall"])


@router.get(
    "/rainfall",
    response_model=RainfallResponse,
    summary="Retrieve Normalized Rainfall Forecast",
    description=(
        "Retrieves numerical weather prediction (NWP) rainfall forecasts from Open-Meteo. "
        "Forecasts are normalized into provider-independent models with explicit "
        "temporal semantics and NWP provenance.\n\n"
        "CRITICAL DOMAIN DISTINCTIONS:\n"
        "- All rainfall figures are model-derived forecasts, NOT direct rain-gauge observations.\n"
        "- Precipitation values represent accumulated mm over the preceding interval "
        "(1 hour for hourly series, 15 min for current estimate), NOT an instantaneous rate (mm/h).\n"
        "- Precipitation probability (0-100%) is likelihood of rain, not rainfall amount.\n"
        "- Rainfall does NOT confirm road waterlogging or flooding.\n"
        "- Missing or failed data is represented as null/empty, never as 0.0 mm rainfall.\n\n"
        "Client Response States:\n"
        "1. Provider OK with rain: `provider.status == 'ok'`, `is_cached == False`, non-zero `summary.total_precipitation_mm`\n"
        "2. Provider OK with zero rain: `provider.status == 'ok'`, `summary.total_precipitation_mm == 0.0`\n"
        "3. Cache Hit: `provider.status == 'ok'`, `is_cached == True`, `is_stale == False`\n"
        "4. Stale Cache Fallback: `provider.status == 'degraded'`, `is_cached == True`, `is_stale == True`\n"
        "5. Upstream Unavailable: `provider.status == 'unavailable'`, `hourly == []`, `current == None`\n"
    ),
)
async def get_rainfall(
    latitude: float = Query(
        ...,
        ge=-90.0,
        le=90.0,
        description="Target latitude in decimal degrees, range [-90.0, 90.0].",
        examples=[19.076],
    ),
    longitude: float = Query(
        ...,
        ge=-180.0,
        le=180.0,
        description="Target longitude in decimal degrees, range [-180.0, 180.0].",
        examples=[72.8777],
    ),
    forecast_hours: int = Query(
        default=24,
        ge=1,
        le=settings.OPEN_METEO_MAX_FORECAST_HOURS,
        description=(
            f"Forecast horizon in hours (1 to {settings.OPEN_METEO_MAX_FORECAST_HOURS}, default 24)."
        ),
        examples=[24],
    ),
) -> RainfallResponse:
    """Handle coordinate rainfall query with caching and stale fallback."""
    return await open_meteo_provider.fetch_rainfall(
        latitude=latitude,
        longitude=longitude,
        forecast_hours=forecast_hours,
    )
