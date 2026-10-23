import type { RoadRoute } from '../../types/index.ts'
import {
  findMatchingCorridor,
  isRouteDistinct,
  validateRouteEndpoints,
} from './corridors.ts'

// ponytail: public client config, not a secret; falls back to public OSRM demo router
const DEFAULT_OSRM_BASE_URL =
  (typeof import.meta !== 'undefined' && (import.meta as { env?: Record<string, string> }).env?.VITE_OSRM_ROUTER_URL)
    ? (import.meta as { env?: Record<string, string> }).env!.VITE_OSRM_ROUTER_URL.replace(/\/+$/, '')
    : 'https://router.project-osrm.org'

const ESTIMATE_NOTICE =
  'Duration is an estimate from the routing engine and does not reflect live traffic or monsoon hazard delays.'

interface OsrmRouteGeometry {
  coordinates: [number, number][]
  type: string
}

interface OsrmRouteItem {
  distance: number
  duration: number
  geometry: OsrmRouteGeometry
}

interface OsrmResponse {
  code: string
  message?: string
  routes?: OsrmRouteItem[]
}

export interface FetchRoadRoutesOptions {
  /** Optional custom fetch implementation (useful for unit tests / mocking) */
  fetchFn?: typeof fetch
  /** Optional custom OSRM base URL */
  baseUrl?: string
}

/**
 * Parses raw OSRM route item into validated RoadRoute model.
 * Returns null if geometry is invalid or endpoints fail tolerance validation.
 */
function parseRouteItem(
  routeItem: OsrmRouteItem,
  id: string,
  label: string,
  origin: [number, number],
  destination: [number, number]
): RoadRoute | null {
  if (
    typeof routeItem.distance !== 'number' ||
    !Number.isFinite(routeItem.distance) ||
    routeItem.distance < 0 ||
    typeof routeItem.duration !== 'number' ||
    !Number.isFinite(routeItem.duration) ||
    routeItem.duration < 0
  ) {
    return null
  }

  const rawCoordinates = routeItem.geometry?.coordinates
  if (!Array.isArray(rawCoordinates) || rawCoordinates.length < 2) {
    return null
  }

  // Convert GeoJSON [longitude, latitude] into Leaflet [latitude, longitude]
  const leafletCoordinates: [number, number][] = []

  for (const point of rawCoordinates) {
    if (
      !Array.isArray(point) ||
      point.length < 2 ||
      typeof point[0] !== 'number' ||
      !Number.isFinite(point[0]) ||
      typeof point[1] !== 'number' ||
      !Number.isFinite(point[1])
    ) {
      return null
    }
    leafletCoordinates.push([point[1], point[0]])
  }

  if (leafletCoordinates.length < 2) {
    return null
  }

  const candidate: RoadRoute = {
    id,
    label,
    coordinates: leafletCoordinates,
    distanceMeters: routeItem.distance,
    durationSeconds: routeItem.duration,
    engineEstimateNotice: ESTIMATE_NOTICE,
  }

  // Validate that the route begins and ends near expected locations
  if (!validateRouteEndpoints(candidate, origin, destination)) {
    return null
  }

  return candidate
}

/**
 * Retrieves driving road routes from OSRM demo service.
 * Strategy:
 * 1. Queries native OSRM driving service requesting up to 3 alternatives.
 * 2. If provider returns multiple distinct valid candidates, returns them.
 * 3. If only 1 route is returned and a configured parallel corridor exists,
 *    attempts a real via-waypoint query along that specific corridor.
 * 4. Rejects duplicates, invalid geometries, and endpoint mismatches.
 * 5. If fallback fails, gracefully retains the primary route without error.
 */
export async function fetchRoadRoutes(
  origin: [number, number],
  destination: [number, number],
  signal?: AbortSignal,
  options?: FetchRoadRoutesOptions
): Promise<RoadRoute[]> {
  const fetcher = options?.fetchFn ?? fetch
  const baseUrl = options?.baseUrl ?? DEFAULT_OSRM_BASE_URL
  const [originLat, originLng] = origin
  const [destLat, destLng] = destination

  // OSRM contract: {longitude},{latitude};{longitude},{latitude}
  const coordsParam = `${originLng},${originLat};${destLng},${destLat}`
  const primaryUrl = `${baseUrl}/route/v1/driving/${coordsParam}?overview=full&geometries=geojson&steps=false&alternatives=3`

  let primaryResponse: Response
  try {
    primaryResponse = await fetcher(primaryUrl, { signal })
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw err
    }
    throw new Error('Unable to connect to routing service. Please check your internet connection and retry.')
  }

  let primaryData: OsrmResponse
  try {
    primaryData = (await primaryResponse.json()) as OsrmResponse
  } catch {
    throw new Error('Received an unreadable response from the routing service.')
  }

  if (!primaryResponse.ok || primaryData.code !== 'Ok') {
    if (primaryData.code === 'NoRoute') {
      throw new Error('No driving route found between selected points. Try choosing points on connected roads.')
    }
    if (primaryData.code === 'NoSegment') {
      throw new Error('One of the selected points is too far from a navigable road. Please adjust your pins.')
    }
    throw new Error(primaryData.message || `Routing service returned an error (${primaryData.code || primaryResponse.status}).`)
  }

  if (!Array.isArray(primaryData.routes) || primaryData.routes.length === 0) {
    throw new Error('Routing service returned no route options.')
  }

  // Parse and deduplicate native routes
  const validNativeRoutes: RoadRoute[] = []

  primaryData.routes.forEach((routeItem, index) => {
    const candidate = parseRouteItem(
      routeItem,
      `osrm-route-${index + 1}`,
      `Route ${index + 1}`,
      origin,
      destination
    )
    if (candidate) {
      // Exclude duplicate or near-identical geometries
      const isDuplicate = validNativeRoutes.some(
        (existing) => !isRouteDistinct(existing, candidate)
      )
      if (!isDuplicate) {
        validNativeRoutes.push(candidate)
      }
    }
  })

  if (validNativeRoutes.length === 0) {
    throw new Error('Routing service returned no usable route options within expected endpoint tolerance.')
  }

  // Case 1: Provider returned multiple distinct native routes
  if (validNativeRoutes.length > 1) {
    validNativeRoutes[0].label = 'Route 1 (Primary)'
    for (let i = 1; i < validNativeRoutes.length; i++) {
      validNativeRoutes[i].label = `Route ${i + 1} (Alternative)`
    }
    return validNativeRoutes
  }

  // Case 2: Exactly 1 route returned. Check for configured parallel corridor
  const primaryRoute = validNativeRoutes[0]
  const corridor = findMatchingCorridor(origin, destination)

  if (!corridor) {
    primaryRoute.label = 'Primary Road Route'
    return [primaryRoute]
  }

  // Attempt corridor via-point query safely
  try {
    const [viaLat, viaLng] = corridor.viaWaypoint
    const viaCoordsParam = `${originLng},${originLat};${viaLng},${viaLat};${destLng},${destLat}`
    const viaUrl = `${baseUrl}/route/v1/driving/${viaCoordsParam}?overview=full&geometries=geojson&steps=false`

    const viaResponse = await fetcher(viaUrl, { signal })
    if (viaResponse.ok) {
      const viaData = (await viaResponse.json()) as OsrmResponse
      const rawViaItem = viaData.routes?.[0]

      if (rawViaItem) {
        const candidateVia = parseRouteItem(
          rawViaItem,
          'osrm-route-2',
          `Route 2 (${corridor.alternativeLabel})`,
          origin,
          destination
        )

        // Only include if distinct from primary route
        if (candidateVia && isRouteDistinct(primaryRoute, candidateVia)) {
          primaryRoute.label = `Route 1 (${corridor.primaryLabel})`
          primaryRoute.corridorName = corridor.name

          candidateVia.corridorName = corridor.name
          candidateVia.isCorridorAlternative = true
          candidateVia.engineEstimateNotice = `Via-waypoint candidate route along ${corridor.viaName}. Duration does not reflect live traffic or monsoon hazard delays.`

          return [primaryRoute, candidateVia]
        }
      }
    }
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw err
    }
    // Fallback failure must not break primary route
  }

  primaryRoute.label = 'Primary Road Route'
  return [primaryRoute]
}

/**
 * Single-route backward compatibility wrapper.
 */
export async function fetchRoadRoute(
  origin: [number, number],
  destination: [number, number],
  signal?: AbortSignal
): Promise<RoadRoute> {
  const routes = await fetchRoadRoutes(origin, destination, signal)
  return routes[0]
}

/**
 * Format distance in meters or kilometers.
 */
export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)} m`
  }
  return `${(meters / 1000).toFixed(1)} km`
}

/**
 * Format duration in minutes or hours and minutes.
 */
export function formatDuration(seconds: number): string {
  const totalMinutes = Math.round(seconds / 60)
  if (totalMinutes < 60) {
    return `${Math.max(1, totalMinutes)} min${totalMinutes === 1 ? '' : 's'}`
  }
  const hours = Math.floor(totalMinutes / 60)
  const remainingMins = totalMinutes % 60
  if (remainingMins === 0) {
    return `${hours} hr${hours === 1 ? '' : 's'}`
  }
  return `${hours} hr ${remainingMins} min`
}
