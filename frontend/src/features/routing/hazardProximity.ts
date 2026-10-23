import type {
  HazardLocation,
  HazardProximityResult,
  ProximityDetectionOptions,
  RoadRoute,
  RouteHazardProximitySummary,
} from '../../types'

/**
 * Default proximity threshold in meters.
 * A hazard within 100 meters of any route segment is considered nearby.
 */
export const DEFAULT_PROXIMITY_THRESHOLD_METERS = 100

/**
 * WGS84 mean Earth radius in meters.
 */
const EARTH_RADIUS_METERS = 6371000

const DEG_TO_RAD = Math.PI / 180

/**
 * Validates that an input is a valid [latitude, longitude] coordinate pair.
 * Latitude must be within [-90, 90], longitude within [-180, 180].
 */
export function isValidCoordinate(coord: unknown): coord is [number, number] {
  if (!Array.isArray(coord) || coord.length < 2) {
    return false
  }
  const [lat, lng] = coord
  return (
    typeof lat === 'number' &&
    Number.isFinite(lat) &&
    lat >= -90 &&
    lat <= 90 &&
    typeof lng === 'number' &&
    Number.isFinite(lng) &&
    lng >= -180 &&
    lng <= 180
  )
}

/**
 * Calculates point-to-point distance in meters between two geographic coordinates
 * using local equirectangular projection centered at segment midpoint.
 *
 * Assumptions:
 * - Spherical Earth approximation with mean radius R = 6,371,000 m.
 * - Suitable for local urban scales in Navi Mumbai (~19°N); distortion is < 0.001% (< 1 mm/km).
 */
export function calculatePointToPointDistanceMeters(
  pointA: [number, number],
  pointB: [number, number]
): number {
  const [lat1, lon1] = pointA
  const [lat2, lon2] = pointB
  const midLat = ((lat1 + lat2) / 2) * DEG_TO_RAD
  const dx = (lon2 - lon1) * DEG_TO_RAD * EARTH_RADIUS_METERS * Math.cos(midLat)
  const dy = (lat2 - lat1) * DEG_TO_RAD * EARTH_RADIUS_METERS
  return Math.sqrt(dx * dx + dy * dy)
}

/**
 * Calculates the minimum distance in meters from a geographic point to a route line segment.
 *
 * Algorithm:
 * - Projects the segment endpoints (A, B) and point P to a local Cartesian plane in meters,
 *   centered at the segment midpoint latitude.
 * - Computes the projection factor t of vector AP along segment vector AB.
 * - Clamps t to [0, 1] to constrain the closest point to the segment bounds.
 * - Returns Euclidean distance from P to the closest point C on the segment.
 *
 * Handles degenerate segments (where A == B) safely without division by zero.
 */
// ponytail: equirectangular local projection for segment distance; avoid heavy GIS dependencies
export function calculatePointToSegmentDistanceMeters(
  point: [number, number],
  segmentStart: [number, number],
  segmentEnd: [number, number]
): number {
  const [pLat, pLon] = point
  const [aLat, aLon] = segmentStart
  const [bLat, bLon] = segmentEnd

  const midLat = ((aLat + bLat) / 2) * DEG_TO_RAD
  const cosMidLat = Math.cos(midLat)

  // Projected metric coordinates relative to segmentStart (A)
  const segDx = (bLon - aLon) * DEG_TO_RAD * EARTH_RADIUS_METERS * cosMidLat
  const segDy = (bLat - aLat) * DEG_TO_RAD * EARTH_RADIUS_METERS

  const ptDx = (pLon - aLon) * DEG_TO_RAD * EARTH_RADIUS_METERS * cosMidLat
  const ptDy = (pLat - aLat) * DEG_TO_RAD * EARTH_RADIUS_METERS

  const segLengthSq = segDx * segDx + segDy * segDy

  if (segLengthSq === 0) {
    // Degenerate segment: start and end points are identical
    return Math.sqrt(ptDx * ptDx + ptDy * ptDy)
  }

  // Projection factor t along vector AB
  const t = (ptDx * segDx + ptDy * segDy) / segLengthSq
  const tClamped = Math.max(0, Math.min(1, t))

  const projX = tClamped * segDx
  const projY = tClamped * segDy

  const diffX = ptDx - projX
  const diffY = ptDy - projY

  return Math.sqrt(diffX * diffX + diffY * diffY)
}

/**
 * Calculates the minimum distance in meters between a hazard point and route coordinates.
 *
 * Behavior:
 * - 0 points: Returns Infinity.
 * - 1 point: Evaluates point-to-point distance to that single vertex.
 * - 2+ points: Evaluates point-to-segment distance for every consecutive pair of coordinates
 *   and returns the minimum across all segments.
 */
export function calculateHazardRouteDistanceMeters(
  hazardCoord: [number, number],
  routeCoords: [number, number][]
): number {
  if (routeCoords.length === 0) {
    return Infinity
  }

  if (routeCoords.length === 1) {
    return calculatePointToPointDistanceMeters(hazardCoord, routeCoords[0])
  }

  let minDistance = Infinity
  for (let i = 0; i < routeCoords.length - 1; i++) {
    const dist = calculatePointToSegmentDistanceMeters(
      hazardCoord,
      routeCoords[i],
      routeCoords[i + 1]
    )
    if (dist < minDistance) {
      minDistance = dist
    }
  }

  return minDistance
}

/**
 * Evaluates proximity between a road route and a collection of hazard locations.
 *
 * Geometry Policy:
 * - If route contains any invalid or non-finite coordinates, the entire route geometry
 *   is rejected as corrupt and an empty summary is returned to avoid synthesizing false segments.
 * - Hazards with malformed coordinates are skipped.
 * - Throws RangeError if thresholdMeters is negative or non-finite.
 *
 * Output:
 * - Deterministic, pure function (no mutation, no side effects, no React dependencies).
 * - nearbyHazards are filtered by distanceMeters <= threshold and sorted ascending (nearest first).
 */
export function evaluateRouteHazardProximity(
  route: RoadRoute | [number, number][] | null | undefined,
  hazards: HazardLocation[] | null | undefined,
  options?: ProximityDetectionOptions
): RouteHazardProximitySummary {
  const thresholdMeters = options?.thresholdMeters ?? DEFAULT_PROXIMITY_THRESHOLD_METERS

  if (
    typeof thresholdMeters !== 'number' ||
    !Number.isFinite(thresholdMeters) ||
    thresholdMeters < 0
  ) {
    throw new RangeError(
      `Proximity threshold must be a non-negative finite number of meters. Received: ${String(thresholdMeters)}`
    )
  }

  // Handle empty or missing hazard collection
  if (!Array.isArray(hazards) || hazards.length === 0) {
    return {
      thresholdMeters,
      evaluatedHazardCount: 0,
      nearbyHazards: [],
      allHazards: [],
    }
  }

  // Extract coordinates from RoadRoute or coordinate array
  const rawCoords: unknown = Array.isArray(route) ? route : route?.coordinates

  // Handle empty or missing route geometry
  if (!Array.isArray(rawCoords) || rawCoords.length === 0) {
    return {
      thresholdMeters,
      evaluatedHazardCount: 0,
      nearbyHazards: [],
      allHazards: [],
    }
  }

  // Reject route if ANY coordinate is malformed or out of bounds (avoids false segments across bad data)
  const validRouteCoords: [number, number][] = []
  for (const pt of rawCoords) {
    if (!isValidCoordinate(pt)) {
      return {
        thresholdMeters,
        evaluatedHazardCount: 0,
        nearbyHazards: [],
        allHazards: [],
      }
    }
    validRouteCoords.push(pt)
  }

  const allHazards: HazardProximityResult[] = []

  for (const hazard of hazards) {
    if (!hazard || !isValidCoordinate(hazard.coordinates)) {
      continue
    }

    const rawDistance = calculateHazardRouteDistanceMeters(
      hazard.coordinates,
      validRouteCoords
    )

    if (!Number.isFinite(rawDistance)) {
      continue
    }

    // Inclusive boundary: hazard considered nearby if distance <= threshold
    // Tolerance of 1e-6 accounts for floating-point imprecision at threshold boundary
    const isNearby = rawDistance <= thresholdMeters + 1e-6
    const roundedDistance = Math.round(rawDistance * 10) / 10

    allHazards.push({
      hazardId: hazard.id,
      hazardName: hazard.name,
      hazardType: hazard.hazardType,
      severity: hazard.severity,
      distanceMeters: roundedDistance,
      isNearby,
      hazard,
    })
  }

  // Sort nearby hazards nearest-first
  const nearbyHazards = allHazards
    .filter((h) => h.isNearby)
    .sort((a, b) => a.distanceMeters - b.distanceMeters)

  return {
    thresholdMeters,
    evaluatedHazardCount: allHazards.length,
    nearbyHazards,
    allHazards,
  }
}

/**
 * Convenience helper returning only hazards located within the proximity threshold of a route.
 */
export function detectNearbyHazards(
  route: RoadRoute | [number, number][] | null | undefined,
  hazards: HazardLocation[] | null | undefined,
  options?: ProximityDetectionOptions
): HazardProximityResult[] {
  return evaluateRouteHazardProximity(route, hazards, options).nearbyHazards
}
