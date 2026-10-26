"""Tests for backend configuration management."""
import os
from unittest import mock
from app.core.config import Settings


def test_default_config_sensible():
    """Verify default configuration values."""
    cfg = Settings()
    assert cfg.PROJECT_NAME == "VARSHA API"
    assert cfg.API_V1_STR == "/api/v1"
    assert cfg.ENVIRONMENT == "development"
    assert "http://localhost:5173" in cfg.CORS_ORIGINS


def test_override_cors_origins_comma_separated():
    """Verify comma-separated CORS_ORIGINS override."""
    with mock.patch.dict(os.environ, {"CORS_ORIGINS": "https://example.com, https://varsha.app"}):
        cfg = Settings()
        assert cfg.CORS_ORIGINS == ["https://example.com", "https://varsha.app"]


def test_override_cors_origins_json_list():
    """Verify JSON array formatted CORS_ORIGINS override."""
    with mock.patch.dict(os.environ, {"CORS_ORIGINS": '["https://varsha.org"]'}):
        cfg = Settings()
        assert cfg.CORS_ORIGINS == ["https://varsha.org"]


def test_override_cors_origins_normalizes_trailing_slash_and_quotes():
    """Verify origins with trailing slashes, quotes, or single-quoted lists normalize."""
    with mock.patch.dict(
        os.environ,
        {"CORS_ORIGINS": "['https://varsha-dun.vercel.app/', 'http://localhost:5173/']"},
    ):
        cfg = Settings()
        assert cfg.CORS_ORIGINS == [
            "https://varsha-dun.vercel.app",
            "http://localhost:5173",
        ]

    with mock.patch.dict(os.environ, {"CORS_ORIGINS": '"https://varsha-dun.vercel.app/"'}):
        cfg = Settings()
        assert cfg.CORS_ORIGINS == ["https://varsha-dun.vercel.app"]


def test_override_environment():
    """Verify ENVIRONMENT override."""
    with mock.patch.dict(os.environ, {"ENVIRONMENT": "production"}):
        cfg = Settings()
        assert cfg.ENVIRONMENT == "production"
