import type { RoadRoute } from '../../types/index.ts'
import { calculatePointToPointDistanceMeters } from './hazardProximity.ts'

/**
 * Configuration for known Navi Mumbai transit corridors with viable parallel arteries.
 */
export interface CorridorConfig {
  id: string
  name: string
  primaryLabel: string
  alternativeLabel: string
  viaName: string
  viaWaypoint: [number, number] // [lat, lng]
  matches: (origin: [number, number], destination: [number, number]) => boolean
}

/**
 * Known Navi Mumbai parallel corridors.
 * Only applied when origin and destination match specific geographical arterial corridors.
 */
// ponytail: explicit static corridor registry; avoid arbitrary heuristic waypoint insertion
export const NAVI_MUMBAI_CORRIDORS: readonly CorridorConfig[] = [
  {
    id: 'vashi-belapur-palm-beach',
    name: 'Vashi – Belapur Arterial Corridor',
    primaryLabel: 'via Sion-Panvel Hwy',
    alternativeLabel: 'via Palm Beach Rd',
    viaName: 'Palm Beach Road Central',
    // Mid Palm Beach Road carriage point in Nerul Sector 18 (lat: 19.0410, lng: 73.0135)
    viaWaypoint: [19.0410, 73.0135],
    matches: (origin: [number, number], destination: [number, number]) => {
      const [origLat, origLng] = origin
      const [destLat, destLng] = destination

      // North zone: Vashi, Sanpada, Turbhe (lat: 19.055 to 19.090, lng: 72.980 to 73.030)
      const isOriginNorth = origLat >= 19.055 && origLat <= 19.090 && origLng >= 72.980 && origLng <= 73.030
      // South zone: Nerul, Seawoods, Belapur, Kharghar (lat: 19.005 to 19.045, lng: 73.005 to 73.075)
      const isDestSouth = destLat >= 19.005 && destLat <= 19.045 && destLng >= 73.005 && destLng <= 73.075

      const isOriginSouth = origLat >= 19.005 && origLat <= 19.045 && origLng >= 73.005 && origLng <= 73.075
      const isDestNorth = destLat >= 19.055 && destLat <= 19.090 && destLng >= 72.980 && destLng <= 73.030

      return (isOriginNorth && isDestSouth) || (isOriginSouth && isDestNorth)
    },
  },
  {
    id: 'airoli-vashi-west-bypass',
    name: 'Airoli – Vashi Trans-Harbour Corridor',
    primaryLabel: 'via Thane-Belapur Rd',
    alternativeLabel: 'via West Bypass',
    viaName: 'Kopar Khairane West Bypass',
    // West bypass carriage point in Kopar Khairane Sector 11 (lat: 19.1025, lng: 73.0035)
    viaWaypoint: [19.1025, 73.0035],
    matches: (origin: [number, number], destination: [number, number]) => {
      const [origLat, origLng] = origin
      const [destLat, destLng] = destination

      // Upper North: Airoli, Rabale, Ghansoli (lat: 19.120 to 19.170, lng: 72.985 to 73.015)
      const isOriginUpperNorth = origLat >= 19.120 && origLat <= 19.170 && origLng >= 72.985 && origLng <= 73.015
      // Lower: Vashi, Turbhe (lat: 19.055 to 19.085, lng: 72.990 to 73.030)
      const isDestLower = destLat >= 19.055 && destLat <= 19.085 && destLng >= 72.990 && destLng <= 73.030

      const isOriginLower = origLat >= 19.055 && origLat <= 19.085 && origLng >= 72.990 && origLng <= 73.030
      const isDestUpperNorth = destLat >= 19.120 && destLat <= 19.170 && destLng >= 72.985 && destLng <= 73.015

      return (isOriginUpperNorth && isDestLower) || (isOriginLower && isDestUpperNorth)
    },
  },
]

/**
 * Finds matching corridor config for given origin and destination coordinates.
 * Returns undefined if no configured corridor applies.
 */
export function findMatchingCorridor(
  origin: [number, number],
  destination: [number, number]
): CorridorConfig | undefined {
  return NAVI_MUMBAI_CORRIDORS.find((corridor) => corridor.matches(origin, destination))
}

/**
 * Verifies that a route starts and ends within reasonable tolerance of requested endpoints.
 * Guards against routing service snapping to far-off disconnected segments.
 */
export function validateRouteEndpoints(
  route: RoadRoute,
  origin: [number, number],
  destination: [number, number],
  toleranceMeters = 500
): boolean {
  if (!route || !Array.isArray(route.coordinates) || route.coordinates.length < 2) {
    return false
  }
  const firstPoint = route.coordinates[0]
  const lastPoint = route.coordinates[route.coordinates.length - 1]

  const startDist = calculatePointToPointDistanceMeters(firstPoint, origin)
  const endDist = calculatePointToPointDistanceMeters(lastPoint, destination)

  return startDist <= toleranceMeters && endDist <= toleranceMeters
}

/**
 * Checks whether two routes represent distinct paths.
 * Rejects duplicates or paths that are identical within tolerance.
 */
export function isRouteDistinct(routeA: RoadRoute, routeB: RoadRoute): boolean {
  if (!routeA || !routeB) return false
  if (!Array.isArray(routeA.coordinates) || !Array.isArray(routeB.coordinates)) return false
  if (routeA.coordinates.length < 2 || routeB.coordinates.length < 2) return false

  const distDiff = Math.abs(routeA.distanceMeters - routeB.distanceMeters)
  const durDiff = Math.abs(routeA.durationSeconds - routeB.durationSeconds)

  // Substantial difference in distance or duration indicates distinct route
  if (distDiff > 250 || durDiff > 45) {
    // Verify they do not share identical coordinates despite minor metadata rounding
    const coordsMatchExactly =
      routeA.coordinates.length === routeB.coordinates.length &&
      routeA.coordinates.every(
        (pt, idx) =>
          Math.abs(pt[0] - routeB.coordinates[idx][0]) < 0.00001 &&
          Math.abs(pt[1] - routeB.coordinates[idx][1]) < 0.00001
      )
    return !coordsMatchExactly
  }

  // If distance and duration are very similar, check mid-point divergence
  const midA = routeA.coordinates[Math.floor(routeA.coordinates.length / 2)]
  const midB = routeB.coordinates[Math.floor(routeB.coordinates.length / 2)]
  const midDist = calculatePointToPointDistanceMeters(midA, midB)

  return midDist > 75
}
