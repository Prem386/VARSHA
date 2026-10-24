"""Pydantic schemas for data validation."""
from app.schemas.common import Coordinate, BoundingBox, HealthResponse
from app.schemas.alerts import NormalizedAlert, AlertGeocode, ProviderStatus, AlertListResponse
from app.schemas.rainfall import (
    CurrentRainfall,
    ModelSourceMetadata,
    PrecipitationStep,
    RainfallProviderStatus,
    RainfallResponse,
    RainfallSummary,
)
from app.schemas.places import PlaceSearchResult, PlaceSearchResponse

__all__ = [
    "Coordinate",
    "BoundingBox",
    "HealthResponse",
    "NormalizedAlert",
    "AlertGeocode",
    "ProviderStatus",
    "AlertListResponse",
    "CurrentRainfall",
    "ModelSourceMetadata",
    "PrecipitationStep",
    "RainfallProviderStatus",
    "RainfallResponse",
    "RainfallSummary",
    "PlaceSearchResult",
    "PlaceSearchResponse",
]
