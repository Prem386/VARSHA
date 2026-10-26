/**
 * Client service for querying backend Geoapify place search proxy.
 *
 * Normalizes place suggestions into provider-independent models,
 * enforces client-side coordinate validation, and supports request cancellation.
 */
import type { PlaceSearchResponse, PlaceSuggestion } from '../../types'

export interface FetchPlacesOptions {
  limit?: number
  signal?: AbortSignal
  baseUrl?: string
  fetchFn?: typeof fetch
}

export class PlaceSearchError extends Error {
  readonly statusCode?: number

  constructor(message: string, statusCode?: number) {
    super(message)
    this.name = 'PlaceSearchError'
    this.statusCode = statusCode
  }
}

function getDefaultBaseUrl(): string {
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL) {
      return (import.meta.env.VITE_API_BASE_URL as string).trim().replace(/\/+$/, '')
    }
  } catch {
    // Ignore in non-Vite environments (e.g. Node test runner)
  }
  return ''
}

export function isValidCoordinate(lat: unknown, lng: unknown): boolean {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  )
}

/**
 * Searches real-world places, POIs, landmarks, and addresses via the backend Geoapify proxy.
 */
export async function searchPlaces(
  query: string,
  options?: FetchPlacesOptions
): Promise<PlaceSearchResponse> {
  const cleanQuery = query.trim()
  const limit = options?.limit ?? 5
  const fetcher = options?.fetchFn ?? fetch
  const rawBaseUrl = options?.baseUrl ?? getDefaultBaseUrl()
  const baseUrl = rawBaseUrl.trim().replace(/\/+$/, '')

  if (cleanQuery.length < 2) {
    return {
      query: cleanQuery,
      total: 0,
      results: [],
      source: 'geoapify',
      cached: false,
    }
  }

  const endpoint = `${baseUrl}/api/v1/places/search?q=${encodeURIComponent(cleanQuery)}&limit=${limit}`

  let response: Response
  try {
    response = await fetcher(endpoint, {
      signal: options?.signal,
      headers: {
        Accept: 'application/json',
      },
    })
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw err
    }
    if (err instanceof Error && err.name === 'AbortError') {
      throw err
    }
    throw new PlaceSearchError(
      'Unable to connect to place search service. Check network or backend connectivity.',
      0
    )
  }

  if (!response.ok) {
    let detail = ''
    try {
      const errorJson = await response.json()
      if (errorJson && typeof errorJson.detail === 'string') {
        detail = errorJson.detail
      }
    } catch {
      // Non-JSON error payload
    }

    if (!detail) {
      if (response.status === 502 || response.status === 504 || response.status === 500) {
        detail = `Backend service unreachable (HTTP ${response.status}). Verify FastAPI server is running on port 8000.`
      }
    }

    if (response.status === 503) {
      throw new PlaceSearchError(
        detail || 'Geocoding service is unavailable (API key not configured).',
        503
      )
    }
    if (response.status === 429) {
      throw new PlaceSearchError(
        detail || 'Geocoding request rate limit exceeded. Please wait a moment.',
        429
      )
    }
    if (response.status === 504) {
      throw new PlaceSearchError(
        detail || 'Geocoding search request timed out.',
        504
      )
    }
    if (response.status >= 500) {
      throw new PlaceSearchError(
        detail || 'Geocoding provider encountered an upstream error.',
        response.status
      )
    }

    throw new PlaceSearchError(
      detail || `Geocoding search failed with status ${response.status}`,
      response.status
    )
  }

  const data = (await response.json()) as PlaceSearchResponse

  // Validate coordinates of each result and filter out any malformed items
  const validResults: PlaceSuggestion[] = (data.results || []).filter((item) =>
    isValidCoordinate(item.latitude, item.longitude)
  )

  return {
    query: data.query || cleanQuery,
    total: validResults.length,
    results: validResults,
    source: data.source || 'geoapify',
    cached: Boolean(data.cached),
  }
}
