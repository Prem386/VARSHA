"""Unit tests for Open-Meteo response parser and schema normalization."""
import json
from datetime import datetime, timezone
from pathlib import Path
import pytest

from app.schemas.rainfall import RainfallResponse
from app.services.weather.open_meteo import parse_open_meteo_response

FIXTURES_DIR = Path(__file__).parent / "fixtures" / "open_meteo"


def _read_json_fixture(filename: str) -> dict:
    path = FIXTURES_DIR / filename
    return json.loads(path.read_text(encoding="utf-8"))


def test_parse_valid_forecast_success() -> None:
    """State 1: Successful forecast response with rainfall and probabilities."""
    data = _read_json_fixture("forecast_success.json")
    retrieved_at = datetime(2026, 10, 23, 17, 35, 0, tzinfo=timezone.utc)

    resp = parse_open_meteo_response(
        raw_data=data,
        requested_lat=19.076,
        requested_lon=72.8777,
        forecast_hours=24,
        endpoint_url="https://api.open-meteo.com/v1/forecast?test=1",
        retrieved_at=retrieved_at,
        is_cached=False,
        is_stale=False,
    )

    assert isinstance(resp, RainfallResponse)
    assert resp.provider.status == "ok"
    assert resp.provider.is_cached is False
    assert resp.provider.is_stale is False
    assert resp.provider.retrieved_at == retrieved_at
    assert resp.requested_coordinate.latitude == 19.076
    assert resp.requested_coordinate.longitude == 72.8777

    # Provenance and model semantics
    assert resp.data_type == "forecast_model"
    assert resp.is_model_derived is True
    assert resp.is_physical_observation is False
    assert resp.model_metadata is not None
    assert resp.model_metadata.grid_latitude == 19.086115
    assert resp.model_metadata.grid_longitude == 72.85291
    assert resp.model_metadata.elevation_m == 6.0

    # Hourly series length & content
    assert len(resp.hourly) == 24
    step0 = resp.hourly[0]
    assert step0.timestamp == datetime(2026, 10, 23, 17, 0, 0, tzinfo=timezone.utc)
    assert step0.precipitation_mm == 0.0
    assert step0.precipitation_probability_pct == 5.0
    assert step0.interval_minutes == 60
    assert step0.unit == "mm"
    assert step0.is_model_derived is True

    # High rain step
    step3 = resp.hourly[3]
    assert step3.precipitation_mm == 3.8
    assert step3.precipitation_probability_pct == 85.0

    # Current evaluation window
    assert resp.current is not None
    assert resp.current.timestamp == datetime(2026, 10, 23, 17, 30, 0, tzinfo=timezone.utc)
    assert resp.current.interval_seconds == 900
    assert resp.current.precipitation_mm == 1.5
    assert resp.current.is_model_derived is True
    assert resp.current.is_physical_observation is False

    # Summary metrics
    assert resp.summary is not None
    assert resp.summary.forecast_hours == 24
    assert resp.summary.max_hourly_precipitation_mm == 3.8
    assert resp.summary.max_probability_pct == 85.0
    assert resp.summary.total_precipitation_mm is not None
    assert resp.summary.total_precipitation_mm > 0.0

    # Caveats and flood disclaimers
    assert len(resp.caveats) >= 4
    assert any("not a direct physical rain-gauge" in c for c in resp.caveats)
    assert any("does not confirm that a road or path is flooded" in c for c in resp.caveats)


def test_parse_valid_zero_rain() -> None:
    """State 2: Valid provider response with 0.0 mm rainfall."""
    data = _read_json_fixture("forecast_zero_rain.json")
    resp = parse_open_meteo_response(
        raw_data=data,
        requested_lat=12.9716,
        requested_lon=77.5946,
        forecast_hours=4,
        endpoint_url="https://api.open-meteo.com/v1/forecast?test=zero",
        retrieved_at=datetime.now(timezone.utc),
    )

    assert resp.provider.status == "ok"
    assert resp.summary is not None
    assert resp.summary.total_precipitation_mm == 0.0
    assert resp.summary.max_hourly_precipitation_mm == 0.0
    assert resp.summary.max_probability_pct == 0.0
    assert resp.current is not None
    assert resp.current.precipitation_mm == 0.0

    for step in resp.hourly:
        assert step.precipitation_mm == 0.0
        assert step.precipitation_probability_pct == 0.0


def test_parse_with_nulls_preserves_none() -> None:
    """Null/missing model values are preserved as None, not converted to 0.0."""
    data = _read_json_fixture("forecast_with_nulls.json")
    resp = parse_open_meteo_response(
        raw_data=data,
        requested_lat=28.6139,
        requested_lon=77.2090,
        forecast_hours=3,
        endpoint_url="https://api.open-meteo.com/v1/forecast?test=nulls",
        retrieved_at=datetime.now(timezone.utc),
    )

    assert resp.provider.status == "ok"
    assert resp.hourly[0].precipitation_mm is None
    assert resp.hourly[0].precipitation_probability_pct is None
    assert resp.hourly[1].precipitation_mm == 1.5
    assert resp.hourly[1].precipitation_probability_pct == 40.0
    assert resp.hourly[2].precipitation_mm is None

    # Summary sums only non-null values
    assert resp.summary is not None
    assert resp.summary.total_precipitation_mm == 1.5
    assert resp.summary.max_hourly_precipitation_mm == 1.5
    assert resp.summary.max_probability_pct == 40.0

    # Current has null precipitation
    assert resp.current is not None
    assert resp.current.precipitation_mm is None


def test_parse_missing_current_section() -> None:
    """Absence of 'current' section in upstream response does not crash parser."""
    data = _read_json_fixture("forecast_missing_current.json")
    resp = parse_open_meteo_response(
        raw_data=data,
        requested_lat=13.0827,
        requested_lon=80.2707,
        forecast_hours=2,
        endpoint_url="https://api.open-meteo.com/v1/forecast?test=nocurrent",
        retrieved_at=datetime.now(timezone.utc),
    )

    assert resp.provider.status == "ok"
    assert resp.current is None
    assert len(resp.hourly) == 2


def test_parse_malformed_structure_raises_value_error() -> None:
    """Missing hourly block raises ValueError."""
    data = _read_json_fixture("malformed_structure.json")
    with pytest.raises(ValueError, match="'hourly' section is required"):
        parse_open_meteo_response(
            raw_data=data,
            requested_lat=19.0,
            requested_lon=72.0,
            forecast_hours=24,
            endpoint_url="https://api.open-meteo.com/v1/forecast?test=bad",
            retrieved_at=datetime.now(timezone.utc),
        )


def test_parse_non_dict_raises_value_error() -> None:
    """Non-dict raw data raises ValueError."""
    with pytest.raises(ValueError, match="top-level JSON must be an object"):
        parse_open_meteo_response(
            raw_data=["not", "a", "dict"],  # type: ignore
            requested_lat=19.0,
            requested_lon=72.0,
            forecast_hours=24,
            endpoint_url="https://api.open-meteo.com/v1/forecast?test=bad",
            retrieved_at=datetime.now(timezone.utc),
        )
