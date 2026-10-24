"""Unit tests for Geoapify response parser and feature normalization."""
import math
import pytest
from app.services.places.geoapify import (
    normalize_geoapify_feature,
    parse_geoapify_response,
    GeoapifyUpstreamError,
)


def test_normalize_valid_poi_feature():
    raw_feature = {
        "type": "Feature",
        "geometry": {
            "type": "Point",
            "coordinates": [72.9983, 19.0645],
        },
        "properties": {
            "place_id": "poi-vashi-stn",
            "name": "Vashi Railway Station",
            "formatted": "Vashi Railway Station, Sector 30A, Vashi, Navi Mumbai, Maharashtra, India",
            "category": "transit.railway",
            "suburb": "Vashi",
            "city": "Navi Mumbai",
            "lat": 19.0645,
            "lon": 72.9983,
        },
    }

    result = normalize_geoapify_feature(raw_feature)
    assert result is not None
    assert result.id == "poi-vashi-stn"
    assert result.name == "Vashi Railway Station"
    assert "Sector 30A" in result.formatted_address
    assert result.latitude == 19.0645
    assert result.longitude == 72.9983
    assert result.source == "geoapify"
    assert result.category == "transit.railway"
    assert result.locality == "Vashi"


def test_normalize_feature_without_explicit_name_uses_address_line1():
    raw_feature = {
        "type": "Feature",
        "properties": {
            "place_id": "addr-123",
            "address_line1": "Plot 14, Sector 17",
            "address_line2": "Vashi, Navi Mumbai",
            "formatted": "Plot 14, Sector 17, Vashi, Navi Mumbai",
            "suburb": "Vashi",
            "lat": 19.0760,
            "lon": 72.9985,
        },
    }

    result = normalize_geoapify_feature(raw_feature)
    assert result is not None
    assert result.name == "Plot 14, Sector 17"
    assert result.formatted_address == "Plot 14, Sector 17, Vashi, Navi Mumbai"
    assert result.locality == "Vashi"


def test_normalize_feature_extracts_coords_from_geometry_coordinates():
    raw_feature = {
        "type": "Feature",
        "geometry": {
            "type": "Point",
            "coordinates": [73.0182, 19.0556],
        },
        "properties": {
            "name": "Juinagar Hub",
            "formatted": "Juinagar, Navi Mumbai",
        },
    }

    result = normalize_geoapify_feature(raw_feature)
    assert result is not None
    assert result.name == "Juinagar Hub"
    assert result.latitude == 19.0556
    assert result.longitude == 73.0182


def test_normalize_rejects_out_of_range_coordinates():
    # Latitude > 90
    invalid_lat = {
        "type": "Feature",
        "properties": {"name": "North Pole Extreme", "lat": 95.0, "lon": 73.0},
    }
    assert normalize_geoapify_feature(invalid_lat) is None

    # Latitude < -90
    invalid_south = {
        "type": "Feature",
        "properties": {"name": "South Extreme", "lat": -91.0, "lon": 73.0},
    }
    assert normalize_geoapify_feature(invalid_south) is None

    # Longitude > 180
    invalid_lon = {
        "type": "Feature",
        "properties": {"name": "Far East", "lat": 19.0, "lon": 181.0},
    }
    assert normalize_geoapify_feature(invalid_lon) is None

    # Longitude < -180
    invalid_west = {
        "type": "Feature",
        "properties": {"name": "Far West", "lat": 19.0, "lon": -185.0},
    }
    assert normalize_geoapify_feature(invalid_west) is None


def test_normalize_rejects_nan_and_inf_coordinates():
    nan_lat = {
        "type": "Feature",
        "properties": {"name": "NaN Place", "lat": float("nan"), "lon": 73.0},
    }
    assert normalize_geoapify_feature(nan_lat) is None

    inf_lon = {
        "type": "Feature",
        "properties": {"name": "Inf Place", "lat": 19.0, "lon": float("inf")},
    }
    assert normalize_geoapify_feature(inf_lon) is None


def test_normalize_rejects_malformed_feature():
    assert normalize_geoapify_feature(None) is None
    assert normalize_geoapify_feature("not-a-dict") is None
    assert normalize_geoapify_feature({}) is None
    assert normalize_geoapify_feature({"type": "Feature"}) is None


def test_parse_geoapify_response_limits_and_filters_features():
    raw_payload = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "properties": {"name": "Place 1", "lat": 19.01, "lon": 73.01},
            },
            {
                "type": "Feature",
                "properties": {"name": "Malformed (No Coords)"},
            },
            {
                "type": "Feature",
                "properties": {"name": "Place 2", "lat": 19.02, "lon": 73.02},
            },
            {
                "type": "Feature",
                "properties": {"name": "Place 3", "lat": 19.03, "lon": 73.03},
            },
        ],
    }

    parsed = parse_geoapify_response(raw_payload, query="test query", limit=2)
    assert parsed.query == "test query"
    assert parsed.total == 2
    assert len(parsed.results) == 2
    assert parsed.results[0].name == "Place 1"
    assert parsed.results[1].name == "Place 2"
    assert parsed.source == "geoapify"
    assert parsed.cached is False


def test_parse_geoapify_response_rejects_non_dict_payload():
    with pytest.raises(GeoapifyUpstreamError):
        parse_geoapify_response("not-json-dict", query="abc", limit=5)
