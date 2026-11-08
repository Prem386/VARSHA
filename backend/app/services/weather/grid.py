"""Navi Mumbai Pilot Weather Grid Cell Definitions and Spatial Resolution.

Defines the geographic bounding box and representative sampling nodes for the
Navi Mumbai pilot deployment.

SPATIAL RESOLUTION & MODEL GRID CONSTRAINTS:
- Numerical Weather Prediction (NWP) forecast models (ECMWF IFS, GFS, ICON)
  operate at grid resolutions between ~9 km and ~25 km.
- Navi Mumbai spans approximately 33 km North-South and 21 km East-West.
- Five strategic geographic sampling cells (Vashi, Nerul, Belapur, Kharghar, Panvel)
  adequately cover the active transit and commuter corridors of Navi Mumbai
  without generating wasteful sub-kilometer queries to upstream providers.
"""
import math
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

from app.core.config import settings


@dataclass(frozen=True)
class PilotCell:
    """Representative weather sampling location in Navi Mumbai."""

    cell_id: str
    name: str
    latitude: float
    longitude: float


# Pilot region bounding box covering Navi Mumbai municipal area and western approaches
NAVI_MUMBAI_BOUNDS: Dict[str, float] = {
    "min_lat": 18.85,
    "max_lat": 19.30,
    "min_lon": 72.80,
    "max_lon": 73.25,
}

# 5 strategic sampling locations across the pilot corridor
NAVI_MUMBAI_CELLS: Dict[str, PilotCell] = {
    "vashi": PilotCell(
        cell_id="vashi",
        name="Vashi",
        latitude=19.0771,
        longitude=72.9986,
    ),
    "nerul": PilotCell(
        cell_id="nerul",
        name="Nerul",
        latitude=19.0330,
        longitude=73.0297,
    ),
    "belapur": PilotCell(
        cell_id="belapur",
        name="CBD Belapur",
        latitude=19.0178,
        longitude=73.0422,
    ),
    "kharghar": PilotCell(
        cell_id="kharghar",
        name="Kharghar",
        latitude=19.0473,
        longitude=73.0699,
    ),
    "panvel": PilotCell(
        cell_id="panvel",
        name="Panvel",
        latitude=18.9894,
        longitude=73.1175,
    ),
}


def is_within_pilot_region(latitude: float, longitude: float) -> bool:
    """Check if coordinates fall within supported Navi Mumbai pilot bounding box."""
    return (
        NAVI_MUMBAI_BOUNDS["min_lat"] <= latitude <= NAVI_MUMBAI_BOUNDS["max_lat"]
        and NAVI_MUMBAI_BOUNDS["min_lon"] <= longitude <= NAVI_MUMBAI_BOUNDS["max_lon"]
    )


def haversine_distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate the great-circle distance between two coordinates on Earth in kilometers."""
    r = 6371.0  # Earth mean radius in kilometers
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (
        math.sin(delta_phi / 2.0) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2
    )
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return r * c


def get_nearest_cell_and_distance(
    latitude: float, longitude: float
) -> Tuple[Optional[PilotCell], float]:
    """Find nearest pilot sampling cell and compute Haversine distance in kilometers.

    Returns (closest_cell, distance_km). Returns (None, inf) if outside pilot bounding box.
    """
    if not is_within_pilot_region(latitude, longitude):
        return None, float("inf")

    closest_cell: Optional[PilotCell] = None
    min_dist_km: float = float("inf")

    for cell in NAVI_MUMBAI_CELLS.values():
        dist_km = haversine_distance_km(latitude, longitude, cell.latitude, cell.longitude)
        if dist_km < min_dist_km:
            min_dist_km = dist_km
            closest_cell = cell

    return closest_cell, min_dist_km


def resolve_pilot_cell(
    latitude: float,
    longitude: float,
    max_distance_km: Optional[float] = None,
) -> Optional[PilotCell]:
    """Resolve target coordinates to the nearest pilot sampling cell within permitted radius.

    Returns None if:
    1. Coordinates lie outside the pilot bounding box, OR
    2. Haversine distance to the nearest sampling cell exceeds max_distance_km.
    """
    allowed_max = (
        max_distance_km
        if max_distance_km is not None
        else settings.WEATHER_MAX_CELL_DISTANCE_KM
    )
    cell, dist_km = get_nearest_cell_and_distance(latitude, longitude)
    if cell is None or dist_km > allowed_max:
        return None

    return cell


def get_cell_by_id(cell_id: str) -> Optional[PilotCell]:
    """Retrieve pilot cell definition by identifier."""
    return NAVI_MUMBAI_CELLS.get(cell_id)


def get_all_cells() -> List[PilotCell]:
    """List all registered Navi Mumbai pilot cells."""
    return list(NAVI_MUMBAI_CELLS.values())
