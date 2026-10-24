import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { MapView } from '../../src/features/map/MapView.tsx'
import type { RoadRoute, PlaceSearchResponse } from '../../src/types/index.ts'
import * as osrmService from '../../src/features/routing/osrmService.ts'
import * as placesService from '../../src/features/search/placesService.ts'

// Stub react-leaflet components to render in happy-dom
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children, className }: any) => (
    <div data-testid="map-container" className={className}>
      {children}
    </div>
  ),
  TileLayer: () => <div data-testid="tile-layer" />,
  Polyline: ({ positions, pathOptions, eventHandlers }: any) => (
    <div
      data-testid="map-polyline"
      data-positions={JSON.stringify(positions)}
      onClick={eventHandlers?.click}
    />
  ),
  Marker: ({ children, position }: any) => (
    <div data-testid="map-marker" data-position={JSON.stringify(position)}>
      {children}
    </div>
  ),
  Popup: ({ children }: any) => <div data-testid="map-popup">{children}</div>,
  useMapEvents: () => ({}),
  useMap: () => ({
    setView: vi.fn(),
    fitBounds: vi.fn(),
  }),
}))

// Mock external service boundaries only
vi.mock('../../src/features/routing/osrmService.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof osrmService>()
  return {
    ...actual,
    fetchRoadRoutes: vi.fn(),
  }
})

vi.mock('../../src/features/search/placesService.ts', () => ({
  searchPlaces: vi.fn(),
}))

const mockFetchRoadRoutes = vi.mocked(osrmService.fetchRoadRoutes)
const mockSearchPlaces = vi.mocked(placesService.searchPlaces)

// Deterministic fixtures
const FIXTURE_VASHI_BELAPUR_HIGHWAY: RoadRoute = {
  id: 'fixture-route-highway',
  label: 'via Sion-Panvel Hwy',
  distanceMeters: 9700,
  durationSeconds: 720,
  engineEstimateNotice: 'OSRM prototype route estimate',
  coordinates: [
    [19.0763, 72.9984],
    [19.0597, 73.0193],
    [19.0182, 73.0425],
  ],
}

const FIXTURE_VASHI_BELAPUR_PALM_BEACH: RoadRoute = {
  id: 'fixture-route-palm-beach',
  label: 'via Palm Beach Rd',
  distanceMeters: 11300,
  durationSeconds: 880,
  corridorName: 'Vashi – Belapur Arterial Corridor',
  isCorridorAlternative: true,
  engineEstimateNotice: 'OSRM prototype route estimate',
  coordinates: [
    [19.0763, 72.9984],
    [19.0410, 73.0135],
    [19.0182, 73.0425],
  ],
}

const FIXTURE_VASHI_NERUL_PRIMARY: RoadRoute = {
  id: 'fixture-route-nerul-1',
  label: 'via Uran Rd & Nerul Sector',
  distanceMeters: 5200,
  durationSeconds: 420,
  engineEstimateNotice: 'OSRM prototype route estimate',
  coordinates: [
    [19.0763, 72.9984],
    [19.0550, 73.0080],
    [19.0330, 73.0160],
  ],
}

const FIXTURE_VASHI_NERUL_ALT: RoadRoute = {
  id: 'fixture-route-nerul-2',
  label: 'via Sion-Panvel Hwy & MIDC',
  distanceMeters: 6400,
  durationSeconds: 510,
  engineEstimateNotice: 'OSRM prototype route estimate',
  coordinates: [
    [19.0763, 72.9984],
    [19.0620, 73.0110],
    [19.0330, 73.0160],
  ],
}

const DETERMINISTIC_ROUTES: RoadRoute[] = [
  FIXTURE_VASHI_BELAPUR_HIGHWAY,
  FIXTURE_VASHI_BELAPUR_PALM_BEACH,
]

const VASHI_SEARCH_RESPONSE: PlaceSearchResponse = {
  query: 'Vashi',
  total: 1,
  results: [
    {
      id: 'place-vashi',
      name: 'Vashi Railway Station',
      formatted_address: 'Sector 30A, Vashi, Navi Mumbai',
      latitude: 19.0763,
      longitude: 72.9984,
      source: 'geoapify',
      category: 'transit.railway',
      locality: 'Vashi',
    },
  ],
  source: 'geoapify',
  cached: false,
}

const BELAPUR_SEARCH_RESPONSE: PlaceSearchResponse = {
  query: 'Belapur',
  total: 1,
  results: [
    {
      id: 'place-belapur',
      name: 'CBD Belapur Station',
      formatted_address: 'Sector 11, CBD Belapur, Navi Mumbai',
      latitude: 19.0182,
      longitude: 73.0425,
      source: 'geoapify',
      category: 'transit.railway',
      locality: 'CBD Belapur',
    },
  ],
  source: 'geoapify',
  cached: false,
}

const NERUL_SEARCH_RESPONSE: PlaceSearchResponse = {
  query: 'Nerul',
  total: 1,
  results: [
    {
      id: 'place-nerul',
      name: 'Nerul Station',
      formatted_address: 'Sector 20, Nerul, Navi Mumbai',
      latitude: 19.0330,
      longitude: 73.0160,
      source: 'geoapify',
      category: 'transit.railway',
      locality: 'Nerul',
    },
  ],
  source: 'geoapify',
  cached: false,
}

// Identical coordinates to Vashi (lat: 19.0763, lng: 72.9984)
const VASHI_IDENTICAL_SEARCH_RESPONSE: PlaceSearchResponse = {
  query: 'Vashi Twin',
  total: 1,
  results: [
    {
      id: 'place-vashi-twin',
      name: 'Vashi Plaza (Identical Point)',
      formatted_address: 'Sector 30A, Vashi, Navi Mumbai',
      latitude: 19.0763,
      longitude: 72.9984,
      source: 'geoapify',
      category: 'commercial',
      locality: 'Vashi',
    },
  ],
  source: 'geoapify',
  cached: false,
}

// Near-identical coordinates to Vashi within tolerance (< 0.0001 delta)
// diff lat = 0.00005, diff lng = 0.00005
const VASHI_NEAR_SEARCH_RESPONSE: PlaceSearchResponse = {
  query: 'Vashi Near',
  total: 1,
  results: [
    {
      id: 'place-vashi-near',
      name: 'Vashi Bus Depot (Near Point)',
      formatted_address: 'Sector 30A, Vashi, Navi Mumbai',
      latitude: 19.07635,
      longitude: 72.99845,
      source: 'geoapify',
      category: 'transit.bus',
      locality: 'Vashi',
    },
  ],
  source: 'geoapify',
  cached: false,
}

describe('MapView Recovery and Invalidation Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()

    mockSearchPlaces.mockImplementation(async (query: string) => {
      const q = query.toLowerCase()
      if (q.includes('vashi twin')) {
        return VASHI_IDENTICAL_SEARCH_RESPONSE
      }
      if (q.includes('vashi near')) {
        return VASHI_NEAR_SEARCH_RESPONSE
      }
      if (q.includes('vashi')) {
        return VASHI_SEARCH_RESPONSE
      }
      if (q.includes('belapur')) {
        return BELAPUR_SEARCH_RESPONSE
      }
      if (q.includes('nerul')) {
        return NERUL_SEARCH_RESPONSE
      }
      return { query, total: 0, results: [], source: 'geoapify', cached: false }
    })
  })

  afterEach(() => {
    cleanup()
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })

  async function selectOriginThroughUI(query = 'Vashi', placeLabel = 'Vashi Railway Station') {
    const originInput = screen.getByRole('textbox', { name: 'Origin search input' })
    fireEvent.change(originInput, { target: { value: query } })
    await act(async () => {
      vi.advanceTimersByTime(400)
    })
    const option = screen.getByText(placeLabel)
    fireEvent.mouseDown(option)
  }

  async function selectDestinationThroughUI(query = 'Belapur', placeLabel = 'CBD Belapur Station') {
    const destInput = screen.getByRole('textbox', { name: 'Destination search input' })
    fireEvent.change(destInput, { target: { value: query } })
    await act(async () => {
      vi.advanceTimersByTime(400)
    })
    const option = screen.getByText(placeLabel)
    fireEvent.mouseDown(option)
  }

  async function planRoutesSuccessfully() {
    mockFetchRoadRoutes.mockResolvedValueOnce(DETERMINISTIC_ROUTES)
    const planButton = screen.getByRole('button', { name: /Plan Driving Routes/i })
    await act(async () => {
      fireEvent.click(planButton)
    })
    expect(screen.getByRole('region', { name: 'Retrieved alternative routes comparison' })).toBeTruthy()
  }

  it('1. Changing origin invalidates existing routes and resets relevant route state', async () => {
    render(<MapView />)
    await selectOriginThroughUI('Vashi', 'Vashi Railway Station')
    await selectDestinationThroughUI('Belapur', 'CBD Belapur Station')
    await planRoutesSuccessfully()

    // Route state is initially populated
    expect(screen.getByText('via Sion-Panvel Hwy')).toBeTruthy()
    expect(screen.getByText('Recalculate Routes')).toBeTruthy()

    // User changes Origin to Nerul Station
    await selectOriginThroughUI('Nerul', 'Nerul Station')

    // Stale route comparison and cards are cleared
    expect(screen.queryByRole('region', { name: 'Retrieved alternative routes comparison' })).toBeNull()
    expect(screen.queryByText('via Sion-Panvel Hwy')).toBeNull()

    // Button reverts from "Recalculate Routes" to "Plan Driving Routes"
    expect(screen.getByRole('button', { name: /Plan Driving Routes/i })).toBeTruthy()

    // Endpoints reflect new origin and previous destination
    const originRegion = screen.getByRole('region', { name: 'Origin place selection' })
    const destRegion = screen.getByRole('region', { name: 'Destination place selection' })
    expect(originRegion.textContent).toContain('19.0330° N, 73.0160° E')
    expect(destRegion.textContent).toContain('19.0182° N, 73.0425° E')
  })

  it('2. Changing destination invalidates existing routes and resets relevant route state', async () => {
    render(<MapView />)
    await selectOriginThroughUI('Vashi', 'Vashi Railway Station')
    await selectDestinationThroughUI('Belapur', 'CBD Belapur Station')
    await planRoutesSuccessfully()

    expect(screen.getByText('via Sion-Panvel Hwy')).toBeTruthy()
    expect(screen.getByText('Recalculate Routes')).toBeTruthy()

    // User changes Destination to Nerul Station
    await selectDestinationThroughUI('Nerul', 'Nerul Station')

    // Stale route comparison is cleared
    expect(screen.queryByRole('region', { name: 'Retrieved alternative routes comparison' })).toBeNull()
    expect(screen.queryByText('via Sion-Panvel Hwy')).toBeNull()

    // Button reverts to "Plan Driving Routes"
    expect(screen.getByRole('button', { name: /Plan Driving Routes/i })).toBeTruthy()

    // Endpoints reflect original origin and new destination
    const originRegion = screen.getByRole('region', { name: 'Origin place selection' })
    const destRegion = screen.getByRole('region', { name: 'Destination place selection' })
    expect(originRegion.textContent).toContain('19.0763° N, 72.9984° E')
    expect(destRegion.textContent).toContain('19.0330° N, 73.0160° E')
  })

  it('3. Swapping endpoints reverses origin/destination and invalidates prior routes', async () => {
    render(<MapView />)
    await selectOriginThroughUI('Vashi', 'Vashi Railway Station')
    await selectDestinationThroughUI('Belapur', 'CBD Belapur Station')
    await planRoutesSuccessfully()

    // Prior routes are active
    expect(screen.getByRole('region', { name: 'Retrieved alternative routes comparison' })).toBeTruthy()

    // Swap endpoints
    const swapButton = screen.getByRole('button', { name: 'Swap origin and destination locations' })
    await act(async () => {
      fireEvent.click(swapButton)
    })

    // Stale routes are invalidated
    expect(screen.queryByRole('region', { name: 'Retrieved alternative routes comparison' })).toBeNull()

    // Origin is now Belapur, Destination is now Vashi
    const originRegion = screen.getByRole('region', { name: 'Origin place selection' })
    const destRegion = screen.getByRole('region', { name: 'Destination place selection' })

    expect(originRegion.textContent).toContain('19.0182° N, 73.0425° E')
    expect(destRegion.textContent).toContain('19.0763° N, 72.9984° E')

    // Route planning is ready for the reversed journey
    const planButton = screen.getByRole('button', { name: /Plan Driving Routes/i })
    expect(planButton.hasAttribute('disabled')).toBe(false)
  })

  it('4. Clearing either endpoint removes stale routes and prevents planning until endpoints are valid again', async () => {
    render(<MapView />)
    await selectOriginThroughUI('Vashi', 'Vashi Railway Station')
    await selectDestinationThroughUI('Belapur', 'CBD Belapur Station')
    await planRoutesSuccessfully()

    // Clear Origin
    const clearOriginBtn = screen.getByRole('button', { name: 'Clear origin location' })
    await act(async () => {
      fireEvent.click(clearOriginBtn)
    })

    // Stale routes removed
    expect(screen.queryByRole('region', { name: 'Retrieved alternative routes comparison' })).toBeNull()

    // Planning disabled because origin is missing
    const planButton = screen.getByRole('button', { name: /Plan Driving Routes/i })
    expect(planButton.hasAttribute('disabled')).toBe(true)
    expect(screen.getByText('Select an origin and destination on the map to calculate a route.')).toBeTruthy()

    // Re-select Origin
    await selectOriginThroughUI('Vashi', 'Vashi Railway Station')
    expect(planButton.hasAttribute('disabled')).toBe(false)

    // Clear Destination
    const clearDestBtn = screen.getByRole('button', { name: 'Clear destination location' })
    await act(async () => {
      fireEvent.click(clearDestBtn)
    })

    // Planning disabled because destination is missing
    expect(planButton.hasAttribute('disabled')).toBe(true)
  })

  it('5. In-flight routing request is aborted via AbortSignal when endpoints change', async () => {
    render(<MapView />)
    await selectOriginThroughUI('Vashi', 'Vashi Railway Station')
    await selectDestinationThroughUI('Belapur', 'CBD Belapur Station')

    let capturedSignal: AbortSignal | undefined
    mockFetchRoadRoutes.mockImplementation((_orig, _dest, signal) => {
      capturedSignal = signal
      return new Promise(() => {}) // pending in-flight
    })

    const planButton = screen.getByRole('button', { name: /Plan Driving Routes/i })
    await act(async () => {
      fireEvent.click(planButton)
    })

    expect(mockFetchRoadRoutes).toHaveBeenCalledTimes(1)
    expect(capturedSignal).toBeDefined()
    expect(capturedSignal?.aborted).toBe(false)
    expect(screen.getByText(/Querying public OSRM routing service/i)).toBeTruthy()

    // Changing endpoint triggers clearExistingRoute and aborts in-flight request
    await selectOriginThroughUI('Nerul', 'Nerul Station')

    expect(capturedSignal?.aborted).toBe(true)
    expect(screen.queryByText(/Querying public OSRM routing service/i)).toBeNull()
  })

  it('6. Stale response from earlier aborted request cannot overwrite latest route state', async () => {
    render(<MapView />)
    await selectOriginThroughUI('Vashi', 'Vashi Railway Station')
    await selectDestinationThroughUI('Belapur', 'CBD Belapur Station')

    let rejectFirstRequest!: (reason: DOMException) => void
    const firstRequestPromise = new Promise<RoadRoute[]>((_resolve, reject) => {
      rejectFirstRequest = reject
    })

    let resolveSecondRequest!: (routes: RoadRoute[]) => void
    const secondRequestPromise = new Promise<RoadRoute[]>((resolve) => {
      resolveSecondRequest = resolve
    })

    let callCount = 0
    mockFetchRoadRoutes.mockImplementation((_orig, _dest, signal) => {
      callCount++
      if (callCount === 1) {
        signal?.addEventListener('abort', () => {
          rejectFirstRequest(new DOMException('The user aborted a request.', 'AbortError'))
        })
        return firstRequestPromise
      }
      return secondRequestPromise
    })

    // 1. Plan first route (Vashi -> Belapur)
    const planButton = screen.getByRole('button', { name: /Plan Driving Routes/i })
    await act(async () => {
      fireEvent.click(planButton)
    })
    expect(callCount).toBe(1)

    // 2. Change destination to Nerul before first resolves, then plan new route (Vashi -> Nerul)
    await selectDestinationThroughUI('Nerul', 'Nerul Station')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Plan Driving Routes/i }))
    })
    expect(callCount).toBe(2)

    // 3. Resolve second request with Nerul routes
    await act(async () => {
      resolveSecondRequest([FIXTURE_VASHI_NERUL_PRIMARY, FIXTURE_VASHI_NERUL_ALT])
    })

    // UI displays second route results
    expect(screen.getByText('via Uran Rd & Nerul Sector')).toBeTruthy()
    expect(screen.getByText('via Sion-Panvel Hwy & MIDC')).toBeTruthy()
    expect(screen.queryByText('via Sion-Panvel Hwy')).toBeNull()
    expect(screen.queryByText('via Palm Beach Rd')).toBeNull()

    // 4. Ensure abort of first request did not trigger an error state or wipe second route
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByText('via Uran Rd & Nerul Sector')).toBeTruthy()
  })

  it('7. Routing failure renders an accessible error state with retry action', async () => {
    render(<MapView />)
    await selectOriginThroughUI('Vashi', 'Vashi Railway Station')
    await selectDestinationThroughUI('Belapur', 'CBD Belapur Station')

    mockFetchRoadRoutes.mockRejectedValueOnce(
      new Error('Unable to connect to routing service. Please check your internet connection and retry.')
    )

    const planButton = screen.getByRole('button', { name: /Plan Driving Routes/i })
    await act(async () => {
      fireEvent.click(planButton)
    })

    // Accessible error alert is rendered
    const alert = screen.getByRole('alert')
    expect(alert).toBeTruthy()
    expect(screen.getByText('Route retrieval failed:')).toBeTruthy()
    expect(
      screen.getByText('Unable to connect to routing service. Please check your internet connection and retry.')
    ).toBeTruthy()

    // Retry button is available and enabled
    const retryButton = screen.getByRole('button', { name: 'Retry Request' })
    expect(retryButton).toBeTruthy()
    expect(retryButton.hasAttribute('disabled')).toBe(false)

    // No route comparison rendered
    expect(screen.queryByRole('region', { name: 'Retrieved alternative routes comparison' })).toBeNull()
  })

  it('8. Retrying after a failure calls routing service again and recovers on success', async () => {
    render(<MapView />)
    await selectOriginThroughUI('Vashi', 'Vashi Railway Station')
    await selectDestinationThroughUI('Belapur', 'CBD Belapur Station')

    // Initial attempt fails
    mockFetchRoadRoutes.mockRejectedValueOnce(
      new Error('Unable to connect to routing service. Please check your internet connection and retry.')
    )

    const planButton = screen.getByRole('button', { name: /Plan Driving Routes/i })
    await act(async () => {
      fireEvent.click(planButton)
    })

    expect(screen.getByRole('alert')).toBeTruthy()
    expect(mockFetchRoadRoutes).toHaveBeenCalledTimes(1)

    // Prepare success response for retry
    mockFetchRoadRoutes.mockResolvedValueOnce(DETERMINISTIC_ROUTES)

    const retryButton = screen.getByRole('button', { name: 'Retry Request' })
    await act(async () => {
      fireEvent.click(retryButton)
    })

    // Routing service was called a second time
    expect(mockFetchRoadRoutes).toHaveBeenCalledTimes(2)
    expect(mockFetchRoadRoutes).toHaveBeenLastCalledWith(
      [19.0763, 72.9984],
      [19.0182, 73.0425],
      expect.any(AbortSignal)
    )

    // Error alert is removed
    expect(screen.queryByRole('alert')).toBeNull()

    // Route options rendered successfully
    expect(screen.getByRole('region', { name: 'Retrieved alternative routes comparison' })).toBeTruthy()
    expect(screen.getByText('via Sion-Panvel Hwy')).toBeTruthy()
    expect(screen.getByText('via Palm Beach Rd')).toBeTruthy()
  })

  it('9. Identical and near-identical endpoints trigger validation guard and prevent routing request', async () => {
    render(<MapView />)

    // Select Vashi as origin
    await selectOriginThroughUI('Vashi', 'Vashi Railway Station')

    // Select identical coordinates as destination
    await selectDestinationThroughUI('Vashi Twin', 'Vashi Plaza (Identical Point)')

    // Validation alert is rendered
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain(
      'Origin and destination cannot be the same location. Please click the map to choose distinct coordinates.'
    )

    // Plan route button is disabled
    const planButton = screen.getByRole('button', { name: /Plan Driving Routes/i })
    expect(planButton.hasAttribute('disabled')).toBe(true)

    // Attempting to click does not issue routing request
    await act(async () => {
      fireEvent.click(planButton)
    })
    expect(mockFetchRoadRoutes).not.toHaveBeenCalled()

    // Test near-identical coordinates within 0.0001 tolerance (lat diff = 0.00005, lng diff = 0.00005)
    await selectDestinationThroughUI('Vashi Near', 'Vashi Bus Depot (Near Point)')

    expect(screen.getByRole('alert')).toBeTruthy()
    expect(planButton.hasAttribute('disabled')).toBe(true)

    await act(async () => {
      fireEvent.click(planButton)
    })
    expect(mockFetchRoadRoutes).not.toHaveBeenCalled()

    // Changing to distinct destination clears validation error and enables planning
    await selectDestinationThroughUI('Belapur', 'CBD Belapur Station')

    expect(screen.queryByRole('alert')).toBeNull()
    expect(planButton.hasAttribute('disabled')).toBe(false)
  })

  it('10. Resolving a stale promise after endpoint invalidation does not overwrite state', async () => {
    render(<MapView />)
    await selectOriginThroughUI('Vashi', 'Vashi Railway Station')
    await selectDestinationThroughUI('Belapur', 'CBD Belapur Station')

    let resolveStalePromise!: (routes: RoadRoute[]) => void
    const stalePromise = new Promise<RoadRoute[]>((resolve) => {
      resolveStalePromise = resolve
    })

    mockFetchRoadRoutes.mockImplementationOnce(() => stalePromise)

    // 1. Start routing request
    const planButton = screen.getByRole('button', { name: /Plan Driving Routes/i })
    await act(async () => {
      fireEvent.click(planButton)
    })

    expect(screen.getByText(/Querying public OSRM routing service/i)).toBeTruthy()

    // 2. Clear origin so the request is aborted/invalidated
    const clearOriginBtn = screen.getByRole('button', { name: 'Clear origin location' })
    await act(async () => {
      fireEvent.click(clearOriginBtn)
    })

    // Routing status reset to idle, routes cleared, plan button disabled
    expect(screen.queryByText(/Querying public OSRM routing service/i)).toBeNull()
    expect(screen.queryByRole('region', { name: 'Retrieved alternative routes comparison' })).toBeNull()
    expect(planButton.hasAttribute('disabled')).toBe(true)

    // 3. Resolve old promise successfully anyway (simulating stale response resolving after abort)
    await act(async () => {
      resolveStalePromise(DETERMINISTIC_ROUTES)
    })

    // 4. Stale routes must NOT be rendered and state must remain clean/idle
    expect(screen.queryByRole('region', { name: 'Retrieved alternative routes comparison' })).toBeNull()
    expect(screen.queryByText('via Sion-Panvel Hwy')).toBeNull()
    expect(screen.queryByText('via Palm Beach Rd')).toBeNull()
    expect(screen.queryByText('Recalculate Routes')).toBeNull()
    expect(planButton.hasAttribute('disabled')).toBe(true)
  })
})
