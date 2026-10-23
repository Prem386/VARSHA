"""Tests for foundational schemas: Coordinate and BoundingBox."""
import pytest
from pydantic import ValidationError
from app.schemas.common import Coordinate, BoundingBox


def test_valid_coordinate():
    """Verify valid geographic coordinates are accepted."""
    coord = Coordinate(latitude=19.0330, longitude=73.0297)
    assert coord.latitude == 19.0330
    assert coord.longitude == 73.0297


def test_coordinate_exact_boundaries():
    """Verify exact geographic boundary values are accepted."""
    north_pole = Coordinate(latitude=90.0, longitude=180.0)
    south_pole = Coordinate(latitude=-90.0, longitude=-180.0)
    assert north_pole.latitude == 90.0
    assert south_pole.longitude == -180.0


def test_invalid_latitude_rejected():
    """Verify latitudes outside [-90.0, 90.0] are rejected."""
    with pytest.raises(ValidationError):
        Coordinate(latitude=90.0001, longitude=73.0)
    with pytest.raises(ValidationError):
        Coordinate(latitude=-90.1, longitude=73.0)


def test_invalid_longitude_rejected():
    """Verify longitudes outside [-180.0, 180.0] are rejected."""
    with pytest.raises(ValidationError):
        Coordinate(latitude=19.0, longitude=180.0001)
    with pytest.raises(ValidationError):
        Coordinate(latitude=19.0, longitude=-180.1)


def test_valid_bounding_box():
    """Verify valid bounding box with correct order and ranges."""
    bbox = BoundingBox(
        min_longitude=72.8,
        min_latitude=18.9,
        max_longitude=73.1,
        max_latitude=19.2,
    )
    assert bbox.min_longitude == 72.8
    assert bbox.min_latitude == 18.9
    assert bbox.max_longitude == 73.1
    assert bbox.max_latitude == 19.2


def test_bounding_box_inverted_latitude_rejected():
    """Verify min_latitude > max_latitude raises ValidationError."""
    with pytest.raises(ValidationError, match="min_latitude.*must be <= max_latitude"):
        BoundingBox(
            min_longitude=72.8,
            min_latitude=19.5,
            max_longitude=73.1,
            max_latitude=19.0,
        )


def test_bounding_box_inverted_longitude_rejected():
    """Verify min_longitude > max_longitude raises ValidationError."""
    with pytest.raises(ValidationError, match="min_longitude.*must be <= max_longitude"):
        BoundingBox(
            min_longitude=73.5,
            min_latitude=19.0,
            max_longitude=73.0,
            max_latitude=19.5,
        )


def test_bounding_box_out_of_range_rejected():
    """Verify bounding box coordinates outside earth ranges are rejected."""
    with pytest.raises(ValidationError):
        BoundingBox(
            min_longitude=-185.0,
            min_latitude=18.0,
            max_longitude=73.0,
            max_latitude=19.0,
        )


def test_bounding_box_from_string():
    """Verify parsing serialized min_lon,min_lat,max_lon,max_lat parameter."""
    bbox = BoundingBox.from_bbox_string("72.8, 18.9, 73.1, 19.2")
    assert bbox.min_longitude == 72.8
    assert bbox.min_latitude == 18.9
    assert bbox.max_longitude == 73.1
    assert bbox.max_latitude == 19.2


def test_bounding_box_from_invalid_string():
    """Verify error on malformed bbox query strings."""
    with pytest.raises(ValueError, match="must contain 4 comma-separated values"):
        BoundingBox.from_bbox_string("72.8,18.9,73.1")
    with pytest.raises(ValueError, match="must be valid numbers"):
        BoundingBox.from_bbox_string("72.8,18.9,foo,19.2")
