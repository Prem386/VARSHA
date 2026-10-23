"""Common geographic and API metadata schemas.

Coordinate conventions:
- Coordinate: (latitude, longitude) where latitude in [-90, 90] and longitude in [-180, 180].
- BoundingBox: (min_longitude, min_latitude, max_longitude, max_latitude) following the standard
  GeoJSON / OGC bounding box ordering: [west, south, east, north].
  NOTE: This differs from frontend internal hazard coordinate tuples which use [latitude, longitude].
"""
from datetime import datetime
from typing import Self
from pydantic import BaseModel, Field, model_validator


class Coordinate(BaseModel):
    """Geographic coordinate representing a point on Earth."""

    latitude: float = Field(
        ...,
        ge=-90.0,
        le=90.0,
        description="Latitude in decimal degrees, range [-90.0, 90.0].",
        examples=[19.0330],
    )
    longitude: float = Field(
        ...,
        ge=-180.0,
        le=180.0,
        description="Longitude in decimal degrees, range [-180.0, 180.0].",
        examples=[73.0297],
    )


class BoundingBox(BaseModel):
    """Geographic bounding box.

    Serialized parameter order: min_longitude,min_latitude,max_longitude,max_latitude
    Following standard GeoJSON / WGS84 bbox specification [west, south, east, north].
    """

    min_longitude: float = Field(
        ...,
        ge=-180.0,
        le=180.0,
        description="Minimum longitude (western boundary), range [-180.0, 180.0].",
        examples=[72.8],
    )
    min_latitude: float = Field(
        ...,
        ge=-90.0,
        le=90.0,
        description="Minimum latitude (southern boundary), range [-90.0, 90.0].",
        examples=[18.9],
    )
    max_longitude: float = Field(
        ...,
        ge=-180.0,
        le=180.0,
        description="Maximum longitude (eastern boundary), range [-180.0, 180.0].",
        examples=[73.1],
    )
    max_latitude: float = Field(
        ...,
        ge=-90.0,
        le=90.0,
        description="Maximum latitude (northern boundary), range [-90.0, 90.0].",
        examples=[19.2],
    )

    @model_validator(mode="after")
    def validate_bounds_order(self) -> Self:
        """Ensure minimum bounds do not exceed maximum bounds."""
        if self.min_longitude > self.max_longitude:
            raise ValueError(
                f"min_longitude ({self.min_longitude}) must be <= max_longitude ({self.max_longitude})"
            )
        if self.min_latitude > self.max_latitude:
            raise ValueError(
                f"min_latitude ({self.min_latitude}) must be <= max_latitude ({self.max_latitude})"
            )
        return self

    @classmethod
    def from_bbox_string(cls, bbox_str: str) -> "BoundingBox":
        """Parse comma-separated string 'min_lon,min_lat,max_lon,max_lat'."""
        parts = [p.strip() for p in bbox_str.split(",")]
        if len(parts) != 4:
            raise ValueError(
                f"Bounding box string must contain 4 comma-separated values (min_lon,min_lat,max_lon,max_lat), got {len(parts)}."
            )
        try:
            min_lon, min_lat, max_lon, max_lat = (float(p) for p in parts)
        except ValueError as exc:
            raise ValueError(f"All bounding box coordinates must be valid numbers: {exc}") from exc

        return cls(
            min_longitude=min_lon,
            min_latitude=min_lat,
            max_longitude=max_lon,
            max_latitude=max_lat,
        )

    def contains_point(self, latitude: float, longitude: float) -> bool:
        """Check if (latitude, longitude) falls inside this bounding box."""
        return (
            self.min_latitude <= latitude <= self.max_latitude
            and self.min_longitude <= longitude <= self.max_longitude
        )

    def contains_coordinate(self, coord: "Coordinate") -> bool:
        """Check if a Coordinate object falls inside this bounding box."""
        return self.contains_point(coord.latitude, coord.longitude)



class HealthResponse(BaseModel):
    """Health check response schema."""

    status: str = Field(..., description="Service status indicator", examples=["ok"])
    service: str = Field(..., description="Service name", examples=["varsha-backend"])
    version: str = Field(..., description="API version", examples=["0.1.0"])
    environment: str = Field(..., description="Running environment", examples=["development"])
    timestamp: datetime = Field(
        ...,
        description="Current UTC timestamp of the health check response",
    )
