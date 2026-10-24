"""Places geocoding API routes."""
import logging
from fastapi import APIRouter, HTTPException, Query, status

from app.core.config import settings
from app.schemas.places import PlaceSearchResponse
from app.services.places.geoapify import (
    GeoapifyAuthError,
    GeoapifyConfigError,
    GeoapifyNetworkError,
    GeoapifyRateLimitError,
    GeoapifyTimeoutError,
    GeoapifyUpstreamError,
    geoapify_provider,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/places", tags=["places"])


@router.get(
    "/search",
    response_model=PlaceSearchResponse,
    summary="Search Places and Landmarks via Geoapify",
    description=(
        "Searches real-world places, POIs, businesses, landmarks, and addresses "
        "via the Geoapify geocoding provider proxy.\n\n"
        "Key behaviors:\n"
        "- Driven by geocoding provider, not restricted to hardcoded directory\n"
        "- Configurable geographic bias toward Navi Mumbai\n"
        "- Bounded in-memory response caching\n"
        "- Returns normalized provider-independent place records\n"
        "- API key kept confidential exclusively on backend"
    ),
    responses={
        200: {"description": "Matching place results returned successfully."},
        400: {"description": "Invalid query parameters (empty, too short, or excessive length)."},
        422: {"description": "Validation error on limit range."},
        429: {"description": "Upstream geocoding provider rate limit exceeded."},
        502: {"description": "Upstream provider error or network failure."},
        503: {"description": "Geocoding service unavailable (API key missing/unconfigured)."},
        504: {"description": "Upstream provider request timed out."},
    },
)
async def search_places(
    q: str = Query(
        ...,
        description="Search query string (e.g. 'Inorbit Mall, Vashi' or 'HDFC Bank, Kopar Khairane')",
        examples=["Inorbit Mall, Vashi"],
    ),
    limit: int = Query(
        default=settings.GEOAPIFY_DEFAULT_LIMIT,
        ge=1,
        le=settings.GEOAPIFY_MAX_LIMIT,
        description=f"Maximum number of results to return (1 to {settings.GEOAPIFY_MAX_LIMIT}, default {settings.GEOAPIFY_DEFAULT_LIMIT}).",
    ),
) -> PlaceSearchResponse:
    """Execute geocoding search query against Geoapify proxy."""
    clean_query = q.strip()
    if not clean_query:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Search query cannot be empty or whitespace only.",
        )
    if len(clean_query) < 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Search query must contain at least 2 non-whitespace characters.",
        )
    if len(clean_query) > 200:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Search query is too long (maximum 200 characters).",
        )

    try:
        return await geoapify_provider.search(query=clean_query, limit=limit)
    except GeoapifyConfigError as exc:
        logger.info("Geoapify search unconfigured: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    except GeoapifyAuthError as exc:
        logger.warning("Geoapify authentication failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc
    except GeoapifyRateLimitError as exc:
        logger.warning("Geoapify rate limit reached: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=str(exc),
        ) from exc
    except GeoapifyTimeoutError as exc:
        logger.warning("Geoapify timeout: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail=str(exc),
        ) from exc
    except (GeoapifyNetworkError, GeoapifyUpstreamError) as exc:
        logger.warning("Geoapify upstream failure: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    except Exception as exc:
        logger.error("Unexpected error in search_places: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unexpected error processing place search request.",
        ) from exc
