"""Official disaster alerts API routes."""
from typing import Optional
from fastapi import APIRouter, HTTPException, Query, status
from app.schemas.alerts import AlertListResponse
from app.schemas.common import BoundingBox
from app.services.alerts.sachet import filter_alerts_by_bbox, sachet_provider

router = APIRouter(tags=["alerts"])


@router.get(
    "/alerts",
    response_model=AlertListResponse,
    summary="Retrieve Official Disaster Alerts",
    description=(
        "Retrieves official disaster alerts from NDMA SACHET (CAP 1.2). "
        "Alerts are normalized into provider-independent models with explicit "
        "geographic uncertainty. Official alerts indicate government warnings, "
        "distinct from observed road inundation or crowd reports.\n\n"
        "Client Response States:\n"
        "1. Provider OK with alerts: `provider.status == 'ok'`, `total > 0`, `is_stale == False`\n"
        "2. Provider OK with zero alerts: `provider.status == 'ok'`, `total == 0`, `is_stale == False`\n"
        "3. Stale cache fallback: `provider.status == 'degraded'`, `is_stale == True`\n"
        "4. Cold-start provider failure: `provider.status == 'unavailable'`, `total == 0`\n"
    ),
)
async def get_alerts(
    bbox: Optional[str] = Query(
        default=None,
        description="Optional bounding box 'min_lon,min_lat,max_lon,max_lat' (WGS84).",
        examples=["72.8,18.9,73.1,19.2"],
    ),
    active_only: bool = Query(
        default=True,
        description="When True, returns only currently active alerts (excludes cancelled or expired).",
    ),
) -> AlertListResponse:
    # Validate bounding box if supplied
    parsed_bbox: Optional[BoundingBox] = None
    if bbox:
        try:
            parsed_bbox = BoundingBox.from_bbox_string(bbox)
        except ValueError as exc:
            raise HTTPException(
                status_code=422,
                detail=f"Invalid bounding box parameter: {exc}",
            ) from exc

    # Fetch alerts from provider (uses cache or upstream)
    raw_alerts, provider_status = await sachet_provider.fetch_alerts()

    # Apply active filter
    filtered = raw_alerts
    if active_only:
        filtered = [a for a in filtered if a.is_active]

    # Apply bounding box filter if validated geometry exists
    spatial_applied = False
    spatial_note = None
    if parsed_bbox:
        filtered = filter_alerts_by_bbox(filtered, parsed_bbox)
        spatial_applied = True
        spatial_note = (
            "Spatial filtering matches alerts with verified coordinates (polygon/circle). "
            "Alerts with unresolved district-level geometry are excluded from coordinate-level "
            "bounding-box matches to prevent false geographic placement."
        )

    return AlertListResponse(
        provider=provider_status,
        total=len(filtered),
        alerts=filtered,
        spatial_filter_applied=spatial_applied,
        spatial_filter_note=spatial_note,
    )
