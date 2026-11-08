"""Unit tests for Navi Mumbai pilot grid cells and spatial resolution."""
import pytest
from app.services.weather.grid import (
    NAVI_MUMBAI_BOUNDS,
    NAVI_MUMBAI_CELLS,
    get_all_cells,
    get_cell_by_id,
    get_nearest_cell_and_distance,
    haversine_distance_km,
    is_within_pilot_region,
    resolve_pilot_cell,
)


def test_pilot_cells_registry() -> None:
    """Verify all five pilot sampling locations exist with expected coordinates."""
    cells = get_all_cells()
    assert len(cells) == 5

    cell_ids = {c.cell_id for c in cells}
    assert cell_ids == {"vashi", "nerul", "belapur", "kharghar", "panvel"}

    vashi = get_cell_by_id("vashi")
    assert vashi is not None
    assert vashi.name == "Vashi"
    assert round(vashi.latitude, 2) == 19.08
    assert round(vashi.longitude, 2) == 73.00


def test_bounding_box_within_pilot_region() -> None:
    """Coordinates inside Navi Mumbai bounding box are accepted."""
    # Vashi center
    assert is_within_pilot_region(19.0771, 72.9986) is True
    # Nerul center
    assert is_within_pilot_region(19.0330, 73.0297) is True
    # Belapur center
    assert is_within_pilot_region(19.0178, 73.0422) is True
    # Kharghar center
    assert is_within_pilot_region(19.0473, 73.0699) is True
    # Panvel center
    assert is_within_pilot_region(18.9894, 73.1175) is True
    # Eastern Mumbai / Mankhurd gateway tested in existing fixtures
    assert is_within_pilot_region(19.0760, 72.8777) is True


def test_bounding_box_outside_pilot_region() -> None:
    """Coordinates outside the pilot bounding box are rejected."""
    # New Delhi
    assert is_within_pilot_region(28.6139, 77.2090) is False
    # Bengaluru
    assert is_within_pilot_region(12.9716, 77.5946) is False
    # Null Island (0, 0)
    assert is_within_pilot_region(0.0, 0.0) is False
    # Far North (Pune / Nashik)
    assert is_within_pilot_region(19.9975, 73.7898) is False
    # Far South
    assert is_within_pilot_region(18.5204, 73.8567) is False


def test_resolve_pilot_cell_nearest_matching() -> None:
    """Target coordinates map to the closest geographic sampling cell."""
    # Near Vashi Station
    cell_vashi = resolve_pilot_cell(19.0750, 72.9950)
    assert cell_vashi is not None
    assert cell_vashi.cell_id == "vashi"

    # Near Nerul LP
    cell_nerul = resolve_pilot_cell(19.0350, 73.0250)
    assert cell_nerul is not None
    assert cell_nerul.cell_id == "nerul"

    # Near CBD Belapur Station
    cell_belapur = resolve_pilot_cell(19.0180, 73.0400)
    assert cell_belapur is not None
    assert cell_belapur.cell_id == "belapur"

    # Near Kharghar Utsav Chowk
    cell_kharghar = resolve_pilot_cell(19.0480, 73.0680)
    assert cell_kharghar is not None
    assert cell_kharghar.cell_id == "kharghar"

    # Near Panvel Bus Station
    cell_panvel = resolve_pilot_cell(18.9900, 73.1180)
    assert cell_panvel is not None
    assert cell_panvel.cell_id == "panvel"


def test_resolve_pilot_cell_outside_returns_none() -> None:
    """Coordinates outside the pilot region return None."""
    assert resolve_pilot_cell(28.6139, 77.2090) is None
    assert resolve_pilot_cell(0.0, 0.0) is None


def test_haversine_distance_computation() -> None:
    """Haversine distance returns 0 for identical points and accurate km distances."""
    vashi = NAVI_MUMBAI_CELLS["vashi"]
    nerul = NAVI_MUMBAI_CELLS["nerul"]

    # Identical coordinates: 0.0 km
    assert haversine_distance_km(vashi.latitude, vashi.longitude, vashi.latitude, vashi.longitude) == 0.0

    # Vashi to Nerul physical distance is ~5.9 km
    dist = haversine_distance_km(vashi.latitude, vashi.longitude, nerul.latitude, nerul.longitude)
    assert 5.5 < dist < 6.5


def test_all_five_sampling_points_resolve_to_themselves() -> None:
    """Exact coordinates of each sampling station resolve to that station with 0km distance."""
    for cell_id, cell in NAVI_MUMBAI_CELLS.items():
        matched, dist_km = get_nearest_cell_and_distance(cell.latitude, cell.longitude)
        assert matched is not None
        assert matched.cell_id == cell_id
        assert dist_km < 0.001
        assert resolve_pilot_cell(cell.latitude, cell.longitude) == cell


def test_intermediate_locations_resolution() -> None:
    """Intermediate Navi Mumbai locations map to their closest sampling node."""
    # Sanpada (between Vashi and Nerul, closer to Vashi)
    cell_sanpada, dist_sanpada = get_nearest_cell_and_distance(19.063, 73.013)
    assert cell_sanpada is not None
    assert cell_sanpada.cell_id == "vashi"
    assert dist_sanpada < 3.0

    # Seawoods (south of Nerul, closer to Nerul)
    cell_seawoods, dist_seawoods = get_nearest_cell_and_distance(19.015, 73.018)
    assert cell_seawoods is not None
    assert cell_seawoods.cell_id == "nerul"
    assert dist_seawoods < 3.0

    # Kamothe (between Kharghar and Panvel, closer to Kharghar)
    cell_kamothe, dist_kamothe = get_nearest_cell_and_distance(19.025, 73.085)
    assert cell_kamothe is not None
    assert cell_kamothe.cell_id == "kharghar"
    assert dist_kamothe < 3.5


def test_coordinates_inside_bounding_box_too_far_from_stations() -> None:
    """Coordinates inside bounding box but beyond max permitted radius (15 km) return None."""
    # Northwest corner (Arabian sea / Western suburbs ~32 km from Vashi)
    nw_cell = resolve_pilot_cell(19.29, 72.81, max_distance_km=15.0)
    assert nw_cell is None

    # Southeast corner (remote hills beyond Panvel ~19 km from Panvel)
    se_cell = resolve_pilot_cell(18.86, 73.24, max_distance_km=15.0)
    assert se_cell is None

    # Southwest corner (sea off Alibaug ~35 km from Panvel)
    sw_cell = resolve_pilot_cell(18.86, 72.81, max_distance_km=15.0)
    assert sw_cell is None

    # Northeast corner (hills beyond Kalyan ~32 km from Kharghar)
    ne_cell = resolve_pilot_cell(19.29, 73.24, max_distance_km=15.0)
    assert ne_cell is None
