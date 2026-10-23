"""Health check route."""
from datetime import datetime, timezone
from fastapi import APIRouter
from app.core.config import settings
from app.schemas.common import HealthResponse

router = APIRouter(tags=["health"])


@router.get(
    "/health",
    response_model=HealthResponse,
    summary="Backend Health Check",
    description=(
        "Returns backend process operational status. "
        "Indicates that the local API process is running and accepting requests. "
        "External environmental data providers (e.g. NDMA SACHET, Open-Meteo) are not "
        "integrated in Phase 5.2 and are not represented as healthy here."
    ),
)
def get_health() -> HealthResponse:
    # ponytail: process liveness check, no external network dependencies
    return HealthResponse(
        status="ok",
        service="varsha-backend",
        version=settings.PROJECT_VERSION,
        environment=settings.ENVIRONMENT,
        timestamp=datetime.now(timezone.utc),
    )
