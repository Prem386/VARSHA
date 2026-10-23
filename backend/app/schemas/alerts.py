"""Normalized official disaster alert schemas.

Represents official NDMA SACHET / Common Alerting Protocol (CAP) alerts
normalized into provider-independent models.

CRITICAL SEPARATION:
Official alerts represent government notifications (e.g. NDMA/IMD meteorological warnings).
They are NOT direct observations of road inundation, rain gauge forecasts, or crowd reports.
Unknown values are preserved without inflating severity.
"""
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field
from app.schemas.common import Coordinate


class AlertGeocode(BaseModel):
    """Geocode key-value pair from CAP area definition (e.g. LGD district code)."""

    value_name: str = Field(..., description="Geocode system, e.g. LGD, FIPS, ISO")
    value: str = Field(..., description="Geocode value or district identifier, e.g. 496")


class NormalizedAlert(BaseModel):
    """Normalized alert model representing official disaster notifications.

    Preserves source-native CAP 1.2 fields, normalized status indicators,
    and explicit geographic uncertainty.
    """

    provider: str = Field(
        default="ndma_sachet",
        description="Originating alert provider identifier.",
        examples=["ndma_sachet"],
    )
    identifier: str = Field(
        ...,
        description="Source alert unique identifier (GUID / message identifier).",
    )
    sender: str = Field(
        ...,
        description="Originating sender agency identifier (e.g. SACHET/IMD).",
    )
    sent: Optional[datetime] = Field(
        default=None,
        description="UTC timestamp when alert was originally dispatched by source.",
    )
    status: str = Field(
        default="Actual",
        description="Source CAP status (Actual, Exercise, System, Test, Draft).",
    )
    msg_type: str = Field(
        default="Alert",
        description="CAP message type (Alert, Update, Cancel, Ack, Error).",
    )
    references: Optional[str] = Field(
        default=None,
        description="References string for Update/Cancel messages indicating prior alert IDs.",
    )

    # Core Alert Information (preferred English block)
    category: Optional[str] = Field(
        default=None,
        description="Official CAP category (e.g. Met, Safety, Rescue, Other).",
    )
    event: Optional[str] = Field(
        default=None,
        description="Disaster or warning event type (e.g. Flash Flood, Heavy Rain).",
    )
    headline: Optional[str] = Field(
        default=None,
        description="Brief summary headline of the warning.",
    )
    description: Optional[str] = Field(
        default=None,
        description="Extended warning description and advisory details.",
    )
    instruction: Optional[str] = Field(
        default=None,
        description="Recommended public safety actions or instructions.",
    )

    # Priority & Severity indicators (unknowns preserved, not inflated)
    severity: str = Field(
        default="Unknown",
        description="CAP severity: Extreme, Severe, Moderate, Minor, or Unknown.",
    )
    urgency: str = Field(
        default="Unknown",
        description="CAP urgency: Immediate, Expected, Future, Past, or Unknown.",
    )
    certainty: str = Field(
        default="Unknown",
        description="CAP certainty: Observed, Likely, Possible, Unlikely, or Unknown.",
    )
    is_active: bool = Field(
        default=True,
        description="Computed active flag: False if cancelled, non-actual status, or expired.",
    )

    # Timestamps (standardized timezone-aware UTC)
    effective: Optional[datetime] = Field(
        default=None,
        description="Effective UTC commencement timestamp of the hazard.",
    )
    onset: Optional[datetime] = Field(
        default=None,
        description="Expected onset UTC timestamp.",
    )
    expires: Optional[datetime] = Field(
        default=None,
        description="UTC expiration timestamp after which alert is no longer active.",
    )
    retrieved_at: datetime = Field(
        ...,
        description="UTC timestamp when this record was retrieved and normalized by VARSHA.",
    )

    # Language support
    language: Optional[str] = Field(
        default="en-IN",
        description="Selected language code for text fields (prefers English).",
    )
    alternate_languages: List[str] = Field(
        default_factory=list,
        description="List of other language codes present in multilingual source blocks.",
    )

    # Geographic representation and explicit uncertainty
    area_description: Optional[str] = Field(
        default=None,
        description="Textual description of affected districts/regions from source CAP area.",
    )
    geocodes: List[AlertGeocode] = Field(
        default_factory=list,
        description="Preserved LGD or official administrative district codes.",
    )
    geometry_type: str = Field(
        default="unresolved",
        description="Geometry classification: 'polygon', 'circle', 'point', or 'unresolved'.",
    )
    coordinates: Optional[List[Coordinate]] = Field(
        default=None,
        description="Parsed coordinates if valid polygon/circle points were provided in CAP.",
    )
    has_spatial_geometry: bool = Field(
        default=False,
        description="Explicit flag: True only if validated coordinates exist; False for unresolved district-only alerts.",
    )

    # Source integrity & warnings
    raw_severity: Optional[str] = Field(
        default=None,
        description="Preserved raw severity string from upstream source.",
    )
    raw_urgency: Optional[str] = Field(
        default=None,
        description="Preserved raw urgency string from upstream source.",
    )
    raw_certainty: Optional[str] = Field(
        default=None,
        description="Preserved raw certainty string from upstream source.",
    )
    warnings: List[str] = Field(
        default_factory=list,
        description="Non-fatal warnings recorded during XML parsing or normalization.",
    )


class ProviderStatus(BaseModel):
    """Metadata regarding upstream provider retrieval health and cache status."""

    provider: str = Field(
        default="ndma_sachet",
        description="Provider name identifier.",
    )
    status: str = Field(
        ...,
        description="Provider operational health: 'ok', 'degraded' (stale cache), or 'unavailable'.",
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
        description="Timestamp when the returned alert data was fetched from upstream.",
    )
    error_message: Optional[str] = Field(
        default=None,
        description="Safe, sanitized error summary if an upstream issue occurred.",
    )
    feed_url: str = Field(
        ...,
        description="Upstream RSS feed URL currently configured.",
    )


class AlertListResponse(BaseModel):
    """API response schema for GET /api/v1/alerts."""

    provider: ProviderStatus = Field(
        ...,
        description="Operational status and cache metadata of the alert provider.",
    )
    total: int = Field(
        ...,
        description="Total number of alerts returned in this response.",
    )
    alerts: List[NormalizedAlert] = Field(
        default_factory=list,
        description="List of normalized alerts.",
    )
    spatial_filter_applied: bool = Field(
        default=False,
        description="True if bounding box filter was applied to query.",
    )
    spatial_filter_note: Optional[str] = Field(
        default=None,
        description="Explanation of spatial filter limitations for unresolved district alerts.",
    )
