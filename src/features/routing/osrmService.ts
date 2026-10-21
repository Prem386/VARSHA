import type { RoadRoute } from '../../types'

// ponytail: public client config, not a secret; falls back to public OSRM demo router
const OSRM_BASE_URL =
  (import.meta.env.VITE_OSRM_ROUTER_URL as string | undefined)?.replace(/\/+$/, '') ||
  'https://router.project-osrm.org'

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

/**
 * Retrieves driving road routes from OSRM demo service.
 * Coordinates are passed as Leaflet [lat, lng] and converted to OSRM [lng, lat].
 * Requests up to 3 alternative routes via alternatives=3.
 */
export async function fetchRoadRoutes(
  origin: [number, number],
  destination: [number, number],
  signal?: AbortSignal
): Promise<RoadRoute[]> {
  const [originLat, originLng] = origin
  const [destLat, destLng] = destination

  // OSRM contract: {longitude},{latitude};{longitude},{latitude}
  const coordsParam = `${originLng},${originLat};${destLng},${destLat}`
  const url = `${OSRM_BASE_URL}/route/v1/driving/${coordsParam}?overview=full&geometries=geojson&steps=false&alternatives=3`

  let response: Response
  try {
    response = await fetch(url, { signal })
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw err
    }
    throw new Error('Unable to connect to routing service. Please check your internet connection and retry.')
  }

  let data: OsrmResponse
  try {
    data = (await response.json()) as OsrmResponse
  } catch {
    throw new Error('Received an unreadable response from the routing service.')
  }

  if (!response.ok || data.code !== 'Ok') {
    if (data.code === 'NoRoute') {
      throw new Error('No driving route found between selected points. Try choosing points on connected roads.')
    }
    if (data.code === 'NoSegment') {
      throw new Error('One of the selected points is too far from a navigable road. Please adjust your pins.')
    }
    throw new Error(data.message || `Routing service returned an error (${data.code || response.status}).`)
  }

  if (!Array.isArray(data.routes) || data.routes.length === 0) {
    throw new Error('Routing service returned no route options.')
  }

  const validRoutes: RoadRoute[] = []

  data.routes.forEach((routeItem, index) => {
    if (
      typeof routeItem.distance !== 'number' ||
      !Number.isFinite(routeItem.distance) ||
      routeItem.distance < 0 ||
      typeof routeItem.duration !== 'number' ||
      !Number.isFinite(routeItem.duration) ||
      routeItem.duration < 0
    ) {
      return
    }

    const rawCoordinates = routeItem.geometry?.coordinates
    if (!Array.isArray(rawCoordinates) || rawCoordinates.length < 2) {
      return
    }

    // Convert GeoJSON [longitude, latitude] into Leaflet [latitude, longitude]
    const leafletCoordinates: [number, number][] = []
    let hasMalformedCoord = false

    for (const point of rawCoordinates) {
      if (
        !Array.isArray(point) ||
        point.length < 2 ||
        typeof point[0] !== 'number' ||
        !Number.isFinite(point[0]) ||
        typeof point[1] !== 'number' ||
        !Number.isFinite(point[1])
      ) {
        hasMalformedCoord = true
        break
      }
      leafletCoordinates.push([point[1], point[0]])
    }

    if (hasMalformedCoord || leafletCoordinates.length < 2) {
      return
    }

    validRoutes.push({
      id: `osrm-route-${index + 1}`,
      label: `Route ${index + 1}`,
      coordinates: leafletCoordinates,
      distanceMeters: routeItem.distance,
      durationSeconds: routeItem.duration,
      engineEstimateNotice: ESTIMATE_NOTICE,
    })
  })

  if (validRoutes.length === 0) {
    throw new Error('Routing service returned no usable route options.')
  }

  return validRoutes
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
