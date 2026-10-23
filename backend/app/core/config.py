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
