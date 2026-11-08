/**
 * Service for querying backend rainfall forecasts and official disaster alerts.
 *
 * Connects to:
 * - GET /api/v1/rainfall (Open-Meteo numerical weather prediction forecasts)
 * - GET /api/v1/alerts   (NDMA SACHET CAP 1.2 official disaster alerts)
 */
import type { AlertListResponse, RainfallResponse } from '../../types'

export const DEFAULT_PILOT_COORDINATES = {
  latitude: 19.033,
  longitude: 73.0297,
}

export const RAINFALL_CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

interface RainfallCacheEntry {
  data: RainfallResponse
  timestamp: number
}

const rainfallCache = new Map<string, RainfallCacheEntry>()
const inFlightRainfallRequests = new Map<string, Promise<RainfallResponse>>()

/**
 * Clears the client-side rainfall response cache and in-flight promises.
 * Primarily used for isolated unit and component testing.
 */
export function clearRainfallCache(): void {
  rainfallCache.clear()
  inFlightRainfallRequests.clear()
}

export interface FetchOptions {
  signal?: AbortSignal
  baseUrl?: string
  fetchFn?: typeof fetch
}

export class WeatherApiError extends Error {
  readonly statusCode?: number

  constructor(message: string, statusCode?: number) {
    super(message)
    this.name = 'WeatherApiError'
    this.statusCode = statusCode
  }
}

function getDefaultBaseUrl(): string {
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL) {
      return (import.meta.env.VITE_API_BASE_URL as string).trim().replace(/\/+$/, '')
    }
  } catch {
    // Non-Vite test environment fallback
  }
  return ''
}

/**
 * Fetches numerical weather prediction rainfall forecast from backend.
 * Uses a 5-minute in-memory cache and in-flight request sharing to deduplicate requests.
 */
export async function fetchRainfallForecast(
  latitude: number = DEFAULT_PILOT_COORDINATES.latitude,
  longitude: number = DEFAULT_PILOT_COORDINATES.longitude,
  forecastHours: number = 24,
  options?: FetchOptions
): Promise<RainfallResponse> {
  const rawBaseUrl = options?.baseUrl ?? getDefaultBaseUrl()
  const baseUrl = rawBaseUrl.trim().replace(/\/+$/, '')
  const endpoint = `${baseUrl}/api/v1/rainfall?latitude=${latitude}&longitude=${longitude}&forecast_hours=${forecastHours}`

  // 1. Check 5-minute in-memory response cache
  const cached = rainfallCache.get(endpoint)
  if (cached && Date.now() - cached.timestamp < RAINFALL_CACHE_TTL_MS) {
    return cached.data
  }

  // 2. Reuse in-flight promise for concurrent callers
  const existingInFlight = inFlightRainfallRequests.get(endpoint)
  if (existingInFlight) {
    return existingInFlight
  }

  const fetcher = options?.fetchFn ?? fetch
  const requestPromise = (async () => {
    let response: Response
    try {
      response = await fetcher(endpoint, {
        signal: options?.signal,
        headers: { Accept: 'application/json' },
      })
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err
      if (err instanceof Error && err.name === 'AbortError') throw err
      throw new WeatherApiError('Unable to connect to rainfall service. Verify backend is running.', 0)
    }

    if (!response.ok) {
      let detail = ''
      try {
        const errJson = await response.json()
        if (errJson && typeof errJson.detail === 'string') {
          detail = errJson.detail
        }
      } catch {
        // Non-JSON payload
      }
      throw new WeatherApiError(
        detail || `Rainfall forecast service failed with status ${response.status}`,
        response.status
      )
    }

    const data = (await response.json()) as RainfallResponse
    // Only cache successful forecasts (ok) or usable stale fallbacks (degraded); do not cache unavailable states
    if (data.provider?.status === 'ok' || data.provider?.status === 'degraded') {
      rainfallCache.set(endpoint, { data, timestamp: Date.now() })
    }
    return data
  })()

  inFlightRainfallRequests.set(endpoint, requestPromise)

  try {
    return await requestPromise
  } finally {
    inFlightRainfallRequests.delete(endpoint)
  }
}

/**
 * Fetches official disaster alerts from backend (NDMA SACHET).
 */
export async function fetchOfficialAlerts(
  activeOnly: boolean = true,
  options?: FetchOptions
): Promise<AlertListResponse> {
  const fetcher = options?.fetchFn ?? fetch
  const rawBaseUrl = options?.baseUrl ?? getDefaultBaseUrl()
  const baseUrl = rawBaseUrl.trim().replace(/\/+$/, '')
  const endpoint = `${baseUrl}/api/v1/alerts?active_only=${activeOnly}`

  let response: Response
  try {
    response = await fetcher(endpoint, {
      signal: options?.signal,
      headers: { Accept: 'application/json' },
    })
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    if (err instanceof Error && err.name === 'AbortError') throw err
    throw new WeatherApiError('Unable to connect to official alerts service. Verify backend is running.', 0)
  }

  if (!response.ok) {
    let detail = ''
    try {
      const errJson = await response.json()
      if (errJson && typeof errJson.detail === 'string') {
        detail = errJson.detail
      }
    } catch {
      // Non-JSON payload
    }
    throw new WeatherApiError(
      detail || `Official alerts service failed with status ${response.status}`,
      response.status
    )
  }

  return (await response.json()) as AlertListResponse
}
