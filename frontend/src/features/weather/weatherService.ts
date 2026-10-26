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
 */
export async function fetchRainfallForecast(
  latitude: number = DEFAULT_PILOT_COORDINATES.latitude,
  longitude: number = DEFAULT_PILOT_COORDINATES.longitude,
  forecastHours: number = 24,
  options?: FetchOptions
): Promise<RainfallResponse> {
  const fetcher = options?.fetchFn ?? fetch
  const rawBaseUrl = options?.baseUrl ?? getDefaultBaseUrl()
  const baseUrl = rawBaseUrl.trim().replace(/\/+$/, '')
  const endpoint = `${baseUrl}/api/v1/rainfall?latitude=${latitude}&longitude=${longitude}&forecast_hours=${forecastHours}`

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

  return (await response.json()) as RainfallResponse
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
