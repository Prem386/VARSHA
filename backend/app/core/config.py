"""Application configuration and environment settings."""
import json
from typing import List, Union
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    PROJECT_NAME: str = "VARSHA API"
    PROJECT_VERSION: str = "0.1.0"
    PROJECT_DESCRIPTION: str = "Predictive Monsoon Mobility & Route Safety System API"
    API_V1_STR: str = "/api/v1"
    ENVIRONMENT: str = "development"

    # CORS origins: default to local Vite dev server (http://localhost:5173).
    # For deployment: update via CORS_ORIGINS env var with target domains
    # e.g., '["https://varsha.app"]' or 'https://varsha.app,https://staging.varsha.app'.
    # Unrestricted wildcard origins ("*") should never be used in production.
    CORS_ORIGINS: Union[List[str], str] = ["http://localhost:5173"]

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

    @field_validator("CORS_ORIGINS", mode="after")
    @classmethod
    def assemble_cors_origins(cls, v: Union[str, List[str]]) -> List[str]:
        if isinstance(v, str):
            v_stripped = v.strip()
            if v_stripped.startswith("[") and v_stripped.endswith("]"):
                try:
                    parsed = json.loads(v_stripped)
                    if isinstance(parsed, list):
                        return [str(item).strip() for item in parsed if item]
                except json.JSONDecodeError:
                    pass
            return [origin.strip() for origin in v_stripped.split(",") if origin.strip()]
        return [str(item).strip() for item in v if item]

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )


# ponytail: global singleton settings, override via env or dependency in tests
settings = Settings()
