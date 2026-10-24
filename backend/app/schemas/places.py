"""Place search schemas for normalized geocoding results."""
from typing import List, Optional
from pydantic import BaseModel, Field


class PlaceSearchResult(BaseModel):
    """Normalized provider-independent place search result.

    Coordinates follow standard latitude [-90, 90] and longitude [-180, 180] bounds.
    """

    id: str = Field(..., description="Unique or stable place identifier.")
    name: str = Field(..., description="Primary display name of the place.")
    formatted_address: str = Field(..., description="Human-readable formatted address string.")
    latitude: float = Field(
        ...,
        ge=-90.0,
        le=90.0,
        description="Latitude in decimal degrees, range [-90.0, 90.0].",
        examples=[19.0660],
    )
    longitude: float = Field(
        ...,
        ge=-180.0,
        le=180.0,
        description="Longitude in decimal degrees, range [-180.0, 180.0].",
        examples=[72.9990],
    )
    source: str = Field(
        default="geoapify",
        description="Originating geocoding provider identifier (e.g. 'geoapify', 'curated').",
    )
    category: Optional[str] = Field(
        default=None,
        description="Functional category or place classification (e.g. 'commercial', 'transit').",
    )
    locality: Optional[str] = Field(
        default=None,
        description="Neighborhood, suburb, or city locality.",
        examples=["Vashi"],
    )


class PlaceSearchResponse(BaseModel):
    """Normalized response schema for place search requests."""

    query: str = Field(..., description="Echo of normalized search query.")
    total: int = Field(..., ge=0, description="Number of results returned.")
    results: List[PlaceSearchResult] = Field(
        default_factory=list,
        description="List of normalized place results, ordered by provider relevance/proximity.",
    )
    source: str = Field(default="geoapify", description="Primary search provider name.")
    cached: bool = Field(default=False, description="True if response was served from cache.")
