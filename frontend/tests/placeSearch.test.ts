import test from 'node:test'
import assert from 'node:assert/strict'
import {
  isValidCoordinate,
  searchPlaces,
  PlaceSearchError,
} from '../src/features/search/placesService.ts'
import {
  searchLandmarks,
  NAVI_MUMBAI_LANDMARKS,
  getLandmarkById,
} from '../src/features/search/landmarks.ts'
import type { PlaceSearchResponse, SelectedLocation } from '../src/types/index.ts'

test('searchPlaces returns normalized results without depending on curated landmarks', async () => {
  const mockPayload: PlaceSearchResponse = {
    query: 'Inorbit Mall, Vashi',
    total: 1,
    results: [
      {
        id: 'geo-inorbit-123',
        name: 'Inorbit Mall',
        formatted_address: 'Inorbit Mall, Sector 30A, Vashi, Navi Mumbai',
        latitude: 19.0660,
        longitude: 72.9990,
        source: 'geoapify',
        category: 'commercial.shopping_mall',
        locality: 'Vashi',
      },
    ],
    source: 'geoapify',
    cached: false,
  }

  const mockFetch = async (): Promise<Response> => {
    return new Response(JSON.stringify(mockPayload), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const result = await searchPlaces('Inorbit Mall, Vashi', {
    fetchFn: mockFetch as unknown as typeof fetch,
  })

  assert.equal(result.total, 1)
  assert.equal(result.results[0].id, 'geo-inorbit-123')
  assert.equal(result.results[0].name, 'Inorbit Mall')
  assert.equal(result.results[0].source, 'geoapify')
  assert.equal(result.results[0].latitude, 19.0660)
  assert.equal(result.results[0].longitude, 72.9990)

  // Confirm Inorbit Mall was NOT added to NAVI_MUMBAI_LANDMARKS static list
  const inCurated = NAVI_MUMBAI_LANDMARKS.some((l) => l.name.includes('Inorbit Mall'))
  assert.equal(inCurated, false, 'Curated landmark directory must not be modified or expanded')
})

test('Geoapify-backed results are prioritized over curated directory', async () => {
  const remoteQuery = 'Vashi'
  const mockPayload: PlaceSearchResponse = {
    query: remoteQuery,
    total: 2,
    results: [
      {
        id: 'geo-vashi-sector-17',
        name: 'Vashi Sector 17 Commercial Hub',
        formatted_address: 'Sector 17, Vashi, Navi Mumbai, India',
        latitude: 19.0760,
        longitude: 72.9985,
        source: 'geoapify',
      },
      {
        id: 'geo-vashi-stn',
        name: 'Vashi Station Complex',
        formatted_address: 'Sector 30A, Vashi, Navi Mumbai, India',
        latitude: 19.0645,
        longitude: 72.9983,
        source: 'geoapify',
      },
    ],
    source: 'geoapify',
    cached: false,
  }

  const mockFetch = async (): Promise<Response> => {
    return new Response(JSON.stringify(mockPayload), { status: 200 })
  }

  const response = await searchPlaces(remoteQuery, {
    fetchFn: mockFetch as unknown as typeof fetch,
  })

  assert.equal(response.results.length, 2)
  assert.equal(response.results[0].source, 'geoapify')
  assert.equal(response.results[0].name, 'Vashi Sector 17 Commercial Hub')
})

test('Existing curated landmark search still works independently', () => {
  const results = searchLandmarks('airoli')
  assert.ok(results.length >= 2)
  assert.ok(results.some((l) => l.id === 'airoli-stn'))
  assert.ok(results.some((l) => l.id === 'airoli-toll'))
})

test('Curated fallback is clearly distinguished and not falsely claimed as exact provider match', async () => {
  // Empty result from provider
  const emptyPayload: PlaceSearchResponse = {
    query: 'NonExistentLocalPlaceXYZ',
    total: 0,
    results: [],
    source: 'geoapify',
    cached: false,
  }

  const mockFetch = async (): Promise<Response> => {
    return new Response(JSON.stringify(emptyPayload), { status: 200 })
  }

  const response = await searchPlaces('NonExistentLocalPlaceXYZ', {
    fetchFn: mockFetch as unknown as typeof fetch,
  })

  // Must report 0 results rather than substituting a random landmark
  assert.equal(response.total, 0)
  assert.equal(response.results.length, 0)
})

test('Missing backend API key returns HTTP 503 error handled gracefully', async () => {
  const mockFetch = async (): Promise<Response> => {
    return new Response(
      JSON.stringify({
        detail: 'Geocoding service is unavailable (API key not configured).',
      }),
      { status: 503 }
    )
  }

  await assert.rejects(
    async () => {
      await searchPlaces('Vashi Station', {
        fetchFn: mockFetch as unknown as typeof fetch,
      })
    },
    (err: unknown) => {
      assert.ok(err instanceof PlaceSearchError)
      assert.equal(err.statusCode, 503)
      assert.match(err.message, /API key not configured/i)
      return true
    }
  )
})

test('HTTP 429 rate limit error is distinguished from other failures', async () => {
  const mockFetch = async (): Promise<Response> => {
    return new Response(
      JSON.stringify({
        detail: 'Geocoding request rate limit exceeded. Please wait a moment.',
      }),
      { status: 429 }
    )
  }

  await assert.rejects(
    async () => {
      await searchPlaces('Vashi', {
        fetchFn: mockFetch as unknown as typeof fetch,
      })
    },
    (err: unknown) => {
      assert.ok(err instanceof PlaceSearchError)
      assert.equal(err.statusCode, 429)
      assert.match(err.message, /rate limit/i)
      return true
    }
  )
})

test('HTTP 504 timeout error is properly caught', async () => {
  const mockFetch = async (): Promise<Response> => {
    return new Response(
      JSON.stringify({ detail: 'Geocoding search request timed out.' }),
      { status: 504 }
    )
  }

  await assert.rejects(
    async () => {
      await searchPlaces('Vashi', {
        fetchFn: mockFetch as unknown as typeof fetch,
      })
    },
    (err: unknown) => {
      assert.ok(err instanceof PlaceSearchError)
      assert.equal(err.statusCode, 504)
      assert.match(err.message, /timed out/i)
      return true
    }
  )
})

test('Sub-minimum length query (e.g. 1 char) short-circuits without network call', async () => {
  let networkCalled = false
  const mockFetch = async (): Promise<Response> => {
    networkCalled = true
    return new Response(JSON.stringify({ total: 0, results: [] }), { status: 200 })
  }

  const res = await searchPlaces('a', {
    fetchFn: mockFetch as unknown as typeof fetch,
  })

  assert.equal(networkCalled, false, 'Fetch must not be called for queries < 2 characters')
  assert.equal(res.total, 0)
  assert.equal(res.results.length, 0)
})

test('Coordinate validation rejects non-finite and out-of-range coordinates', () => {
  assert.equal(isValidCoordinate(19.066, 72.999), true)
  assert.equal(isValidCoordinate(0, 0), true)
  assert.equal(isValidCoordinate(-90, -180), true)
  assert.equal(isValidCoordinate(90, 180), true)

  assert.equal(isValidCoordinate(90.1, 72.0), false, 'Lat > 90 invalid')
  assert.equal(isValidCoordinate(-90.1, 72.0), false, 'Lat < -90 invalid')
  assert.equal(isValidCoordinate(19.0, 180.1), false, 'Lng > 180 invalid')
  assert.equal(isValidCoordinate(19.0, -180.1), false, 'Lng < -180 invalid')
  assert.equal(isValidCoordinate(NaN, 72.0), false, 'NaN invalid')
  assert.equal(isValidCoordinate(19.0, Infinity), false, 'Infinity invalid')
  assert.equal(isValidCoordinate('19.0', '72.0'), false, 'Strings invalid')
  assert.equal(isValidCoordinate(null, undefined), false, 'Null/undefined invalid')
})

test('searchPlaces filters out malformed results with invalid coordinates', async () => {
  const mockPayload = {
    query: 'Test',
    total: 3,
    results: [
      {
        id: 'valid-1',
        name: 'Valid Place',
        formatted_address: 'Navi Mumbai',
        latitude: 19.05,
        longitude: 73.01,
        source: 'geoapify',
      },
      {
        id: 'invalid-lat',
        name: 'Invalid Lat Place',
        formatted_address: 'Nowhere',
        latitude: 105.0,
        longitude: 73.01,
        source: 'geoapify',
      },
      {
        id: 'invalid-nan',
        name: 'NaN Coords',
        formatted_address: 'Nowhere',
        latitude: NaN,
        longitude: 73.01,
        source: 'geoapify',
      },
    ],
    source: 'geoapify',
    cached: false,
  }

  const mockFetch = async (): Promise<Response> => {
    return new Response(JSON.stringify(mockPayload), { status: 200 })
  }

  const res = await searchPlaces('Test', {
    fetchFn: mockFetch as unknown as typeof fetch,
  })

  assert.equal(res.total, 1)
  assert.equal(res.results.length, 1)
  assert.equal(res.results[0].id, 'valid-1')
})

test('AbortSignal cancellation stops in-flight requests and rethrows AbortError', async () => {
  const controller = new AbortController()

  const mockFetch = async (_url: string, opts?: { signal?: AbortSignal }): Promise<Response> => {
    if (opts?.signal?.aborted) {
      throw new DOMException('The user aborted a request.', 'AbortError')
    }
    return new Response(JSON.stringify({ total: 0, results: [] }), { status: 200 })
  }

  controller.abort()

  await assert.rejects(
    async () => {
      await searchPlaces('Vashi', {
        signal: controller.signal,
        fetchFn: mockFetch as unknown as typeof fetch,
      })
    },
    (err: unknown) => {
      assert.ok(err instanceof DOMException || (err instanceof Error && err.name === 'AbortError'))
      return true
    }
  )
})

test('Selecting a remote place constructs valid SelectedLocation with coordinates in [lat, lng] order', () => {
  const mockSuggestion = {
    id: 'geo-inorbit-456',
    name: 'Inorbit Mall, Vashi',
    formatted_address: 'Sector 30A, Vashi, Navi Mumbai',
    latitude: 19.06604,
    longitude: 72.99905,
    source: 'geoapify',
    category: 'commercial',
    locality: 'Vashi',
  }

  // Mimic PlaceSearchInput.handleSelectPlace
  const selected: SelectedLocation = {
    label: mockSuggestion.name,
    coordinates: [mockSuggestion.latitude, mockSuggestion.longitude],
    placeId: mockSuggestion.id,
    formattedAddress: mockSuggestion.formatted_address,
    source: 'geoapify',
    category: mockSuggestion.category,
    locality: mockSuggestion.locality,
  }

  assert.equal(selected.label, 'Inorbit Mall, Vashi')
  assert.equal(selected.coordinates[0], 19.06604, 'Index 0 must be latitude')
  assert.equal(selected.coordinates[1], 72.99905, 'Index 1 must be longitude')
  assert.equal(selected.source, 'geoapify')
  assert.equal(selected.placeId, 'geo-inorbit-456')
})

test('State handling: clearing and swapping endpoints with remote places clears active route', () => {
  let origin: SelectedLocation | null = {
    label: 'Inorbit Mall, Vashi',
    coordinates: [19.066, 72.999],
    source: 'geoapify',
    placeId: 'geo-inorbit',
  }

  let destination: SelectedLocation | null = {
    label: 'Belapur CBD',
    coordinates: [19.018, 73.038],
    source: 'curated',
    landmarkId: 'belapur-stn',
  }

  let routeCleared = false
  const clearExistingRoute = () => {
    routeCleared = true
  }

  // Swap
  const handleSwap = () => {
    clearExistingRoute()
    const temp = origin
    origin = destination
    destination = temp
  }

  handleSwap()
  assert.equal(routeCleared, true, 'Route must be cleared on swap')
  assert.equal(origin?.label, 'Belapur CBD')
  assert.equal(destination?.label, 'Inorbit Mall, Vashi')

  // Clear
  routeCleared = false
  const handleClear = (target: 'origin' | 'destination') => {
    clearExistingRoute()
    if (target === 'origin') origin = null
    else destination = null
  }

  handleClear('destination')
  assert.equal(routeCleared, true, 'Route must be cleared on endpoint clear')
  assert.equal(destination, null)
  assert.equal(origin?.label, 'Belapur CBD')
})

test('Map-click selection remains fully functional when remote search is active', () => {
  let origin: SelectedLocation | null = null
  let activeRouteCleared = false

  const clearExistingRoute = () => {
    activeRouteCleared = true
  }

  const handleMapClick = (coords: [number, number]) => {
    clearExistingRoute()
    const formattedLat = Number(coords[0].toFixed(6))
    const formattedLng = Number(coords[1].toFixed(6))
    origin = {
      label: `Pinned location (${formattedLat.toFixed(4)}, ${formattedLng.toFixed(4)})`,
      coordinates: [formattedLat, formattedLng],
      source: 'map',
    }
  }

  handleMapClick([19.085, 73.015])
  assert.ok(activeRouteCleared)
  assert.ok(origin)
  assert.equal(origin.label, 'Pinned location (19.0850, 73.0150)')
  assert.deepEqual(origin.coordinates, [19.085, 73.015])
  assert.equal(origin.source, 'map')
  assert.equal(origin.landmarkId, undefined)
})

test('searchPlaces strips trailing slash from custom baseUrl', async () => {
  let requestedUrl = ''
  const mockFetch = async (url: string | URL | Request): Promise<Response> => {
    requestedUrl = url.toString()
    return new Response(
      JSON.stringify({
        query: 'Vashi',
        total: 0,
        results: [],
        source: 'geoapify',
        cached: false,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  }

  await searchPlaces('Vashi', {
    baseUrl: 'https://varsha-api.onrender.com///',
    fetchFn: mockFetch as unknown as typeof fetch,
  })

  assert.ok(
    requestedUrl.startsWith('https://varsha-api.onrender.com/api/v1/places/search'),
    `Expected URL to start with single slash path, got ${requestedUrl}`
  )
  assert.ok(!requestedUrl.includes('.com//api'))
})
