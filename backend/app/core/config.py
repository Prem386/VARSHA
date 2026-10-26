"""Application configuration and environment settings."""
import json
from pathlib import Path
from typing import List, Optional, Union
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_CONFIG_DIR = Path(__file__).resolve().parent
_BACKEND_DIR = _CONFIG_DIR.parent.parent
_ROOT_DIR = _BACKEND_DIR.parent


class Settings(BaseSettings):
    PROJECT_NAME: str = "VARSHA API"
    PROJECT_VERSION: str = "0.1.0"
    PROJECT_DESCRIPTION: str = "Predictive Monsoon Mobility & Route Safety System API"
    API_V1_STR: str = "/api/v1"
    ENVIRONMENT: str = "development"

    # CORS origins: default allows local Vite dev servers and production Vercel deployment.
    # For deployment: update via CORS_ORIGINS env var with target domains
    # e.g., '["https://varsha-dun.vercel.app"]' or 'https://varsha-dun.vercel.app'.
    # Unrestricted wildcard origins ("*") should never be used in production.
    CORS_ORIGINS: Union[List[str], str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://varsha-dun.vercel.app",
    ]

    # NDMA SACHET alert feed settings
    # Default is the official nationwide RSS feed; state-specific feeds (e.g. rss_maharashtra.xml) are configurable.
    SACHET_FEED_URL: str = "https://sachet.ndma.gov.in/cap_public_website/rss/rss_india.xml"
    SACHET_REQUEST_TIMEOUT_SECONDS: float = 10.0
    SACHET_CACHE_TTL_SECONDS: int = 300
    SACHET_MAX_ALERTS_PER_FETCH: int = 20

    # Open-Meteo rainfall forecast settings
    # Model-derived numerical weather prediction data; not direct rain-gauge observations.
    OPEN_METEO_BASE_URL: str = "https://api.open-meteo.com/v1/forecast"
    OPEN_METEO_REQUEST_TIMEOUT_SECONDS: float = 10.0
    OPEN_METEO_CACHE_TTL_SECONDS: int = 900
    OPEN_METEO_MAX_FORECAST_HOURS: int = 72

    # Geoapify place search settings
    GEOAPIFY_API_KEY: Optional[str] = None
    GEOAPIFY_BASE_URL: str = "https://api.geoapify.com/v1/geocode/autocomplete"
    GEOAPIFY_REQUEST_TIMEOUT_SECONDS: float = 8.0
    GEOAPIFY_CACHE_TTL_SECONDS: int = 300
    GEOAPIFY_DEFAULT_LIMIT: int = 5
    GEOAPIFY_MAX_LIMIT: int = 20
    GEOAPIFY_BIAS_PROXIMITY: Optional[str] = "73.0297,19.0330"  # [lon, lat] Navi Mumbai proximity bias
    GEOAPIFY_COUNTRY_FILTER: Optional[str] = "in"  # Country restriction (India), optional

    @field_validator("CORS_ORIGINS", mode="after")
    @classmethod
    def assemble_cors_origins(cls, v: Union[str, List[str]]) -> List[str]:
        raw_items: List[str] = []
        if isinstance(v, str):
            v_stripped = v.strip().strip("'\"")
            if v_stripped.startswith("[") and v_stripped.endswith("]"):
                try:
                    parsed = json.loads(v_stripped)
                    if isinstance(parsed, list):
                        raw_items = [str(item) for item in parsed]
                except json.JSONDecodeError:
                    try:
                        parsed = json.loads(v_stripped.replace("'", '"'))
                        if isinstance(parsed, list):
                            raw_items = [str(item) for item in parsed]
                    except json.JSONDecodeError:
                        raw_items = v_stripped[1:-1].split(",")
            else:
                raw_items = v_stripped.split(",")
        elif isinstance(v, (list, tuple, set)):
            raw_items = [str(item) for item in v]

        cleaned: List[str] = []
        for item in raw_items:
            # ponytail: normalize origin by stripping whitespace, wrapping quotes, and trailing slashes
            norm = item.strip().strip("'\"").rstrip("/")
            if norm and norm not in cleaned:
                cleaned.append(norm)
        return cleaned

    model_config = SettingsConfigDict(
        env_file=[
            str(_BACKEND_DIR / ".env"),
            str(_ROOT_DIR / ".env"),
            ".env",
        ],
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )


# ponytail: global singleton settings, override via env or dependency in tests
settings = Settings()
