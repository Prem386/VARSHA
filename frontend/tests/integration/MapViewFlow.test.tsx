import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { MapView } from '../../src/features/map/MapView.tsx'
import type { RoadRoute, PlaceSearchResponse } from '../../src/types/index.ts'
import * as osrmService from '../../src/features/routing/osrmService.ts'
import * as placesService from '../../src/features/search/placesService.ts'
import {
  getDemoScenario,
  SYNTHETIC_SCENARIO_NOTICE,
} from '../../src/features/scenarios/scenarios.ts'
import { assessRoutesRisk } from '../../src/features/routing/routeRiskAssessment.ts'

// Stub react-leaflet components to render in happy-dom while preserving MapView state
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

// Realistic, deterministic route fixtures (Vashi to Belapur alternatives)
const FIXTURE_VASHI_BELAPUR_HIGHWAY: RoadRoute = {
  id: 'fixture-route-highway',
  label: 'via Sion-Panvel Hwy',
  distanceMeters: 9700,
  durationSeconds: 720,
  engineEstimateNotice: 'OSRM prototype route estimate',
  coordinates: [
    [19.0763, 72.9984], // Vashi
    [19.0597, 73.0193], // Highway section
    [19.0182, 73.0425], // Belapur
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
    [19.0763, 72.9984], // Vashi
    [19.0410, 73.0135], // Palm Beach Rd waypoint
    [19.0182, 73.0425], // Belapur
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

describe('MapView Integration Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()

    // Default place search mock responding to queries
    mockSearchPlaces.mockImplementation(async (query: string) => {
      const q = query.toLowerCase()
      if (q.includes('vashi')) {
        return VASHI_SEARCH_RESPONSE
      }
      if (q.includes('belapur')) {
        return BELAPUR_SEARCH_RESPONSE
      }
      return { query, total: 0, results: [], source: 'geoapify', cached: false }
    })
  })

  afterEach(() => {
    cleanup()
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })

  // Helper: sets origin and destination through actual PlaceSearchInput UI interactions
  async function selectEndpointsThroughUI() {
    // 1. Select Origin
    const originInput = screen.getByRole('textbox', { name: 'Origin search input' })
    fireEvent.change(originInput, { target: { value: 'Vashi' } })
    await act(async () => {
      vi.advanceTimersByTime(400)
    })
    const vashiOption = screen.getByText('Vashi Railway Station')
    fireEvent.mouseDown(vashiOption)

    // 2. Select Destination
    const destInput = screen.getByRole('textbox', { name: 'Destination search input' })
    fireEvent.change(destInput, { target: { value: 'Belapur' } })
    await act(async () => {
      vi.advanceTimersByTime(400)
    })
    const belapurOption = screen.getByText('CBD Belapur Station')
    fireEvent.mouseDown(belapurOption)
  }

  it('Test 1 — Complete routing flow: sets endpoints, calls OSRM, and renders routes with risk assessments', async () => {
    // 1. Render MapView
    render(<MapView />)

    // Deferred promise to inspect in-flight routing call before resolution
    let resolveRoutes!: (routes: RoadRoute[]) => void
    const routesPromise = new Promise<RoadRoute[]>((resolve) => {
      resolveRoutes = resolve
    })
    mockFetchRoadRoutes.mockImplementation(() => routesPromise)

    // 2. Use actual UI to set origin and destination
    await selectEndpointsThroughUI()

    // Verify endpoints set in UI
    expect(screen.getAllByText('19.0763° N, 72.9984° E').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('19.0182° N, 73.0425° E').length).toBeGreaterThanOrEqual(1)

    // 3. Click the route-planning action
    const planButton = screen.getByRole('button', { name: /Plan Driving Routes/i })
    expect(planButton.hasAttribute('disabled')).toBe(false)

    await act(async () => {
      fireEvent.click(planButton)
    })

    // 4. Verify fetchRoadRoutes is called with expected coordinates
    expect(mockFetchRoadRoutes).toHaveBeenCalledTimes(1)
    expect(mockFetchRoadRoutes).toHaveBeenCalledWith(
      [19.0763, 72.9984],
      [19.0182, 73.0425],
      expect.any(AbortSignal)
    )

    // Verify loading status in UI while in-flight
    expect(
      screen.getByText(/Querying public OSRM routing service for driving road geometry/i)
    ).toBeTruthy()

    // 5. Resolve mocked route response with realistic RoadRoute fixtures
    await act(async () => {
      resolveRoutes(DETERMINISTIC_ROUTES)
    })

    // 6. Verify RouteSelector renders route alternatives and expected risk assessments
    expect(
      screen.getByRole('region', { name: 'Retrieved alternative routes comparison' })
    ).toBeTruthy()
    expect(screen.getByText('Alternative Route Comparison')).toBeTruthy()
    expect(screen.getByText('OSRM Alternatives • 2 Found')).toBeTruthy()

    // Verify both route cards are rendered
    expect(screen.getByText('via Sion-Panvel Hwy')).toBeTruthy()
    expect(screen.getByText('via Palm Beach Rd')).toBeTruthy()
    expect(screen.getByText('Vashi – Belapur Arterial Corridor')).toBeTruthy()

    // Derive expected assessments directly from real risk engine and baseline hazards
    const expectedBaselineAssessments = assessRoutesRisk(
      DETERMINISTIC_ROUTES,
      getDemoScenario('baseline').hazards
    )
    const highwayExpected = expectedBaselineAssessments['fixture-route-highway'].result
    const palmBeachExpected = expectedBaselineAssessments['fixture-route-palm-beach'].result

    expect(highwayExpected).toBeDefined()
    expect(palmBeachExpected).toBeDefined()

    // Both routes should evaluate to score 30 and Moderate under baseline hazards
    expect(highwayExpected!.score).toBe(30)
    expect(highwayExpected!.riskCategory).toBe('Moderate')
    expect(palmBeachExpected!.score).toBe(30)
    expect(palmBeachExpected!.riskCategory).toBe('Moderate')

    // Verify scores and categories rendered in the UI
    const scoreElements = screen.getAllByText('30')
    expect(scoreElements.length).toBe(2)

    const categoryElements = screen.getAllByText('Moderate')
    expect(categoryElements.length).toBeGreaterThanOrEqual(2)

    const hazardExplanations = screen.getAllByText(
      /2 simulated hazards detected within 100m threshold contributing to score/i
    )
    expect(hazardExplanations.length).toBe(2)
  })

  it('Test 2 — Scenario switching recalculates risk: updates risk assessments without requesting route geometry again', async () => {
    // 1. Render MapView, set endpoints, and plan routes
    render(<MapView />)
    mockFetchRoadRoutes.mockResolvedValue(DETERMINISTIC_ROUTES)

    await selectEndpointsThroughUI()

    const planButton = screen.getByRole('button', { name: /Plan Driving Routes/i })
    await act(async () => {
      fireEvent.click(planButton)
    })

    // 2. Record OSRM service call count after routes are loaded
    const initialOsrmCallCount = mockFetchRoadRoutes.mock.calls.length
    expect(initialOsrmCallCount).toBe(1)

    // Initial baseline risk score check (score 30 for both routes)
    expect(screen.getAllByText('30').length).toBe(2)
    const baselineRadio = screen.getByRole('radio', { name: 'Baseline' })
    expect(baselineRadio.getAttribute('aria-checked')).toBe('true')
    expect(screen.queryByRole('status')).toBeNull()

    // 3. Change scenario to "Flood on Highway" using ScenarioSelector UI
    const floodHwyRadio = screen.getByRole('radio', { name: 'Flood on Highway' })
    await act(async () => {
      fireEvent.click(floodHwyRadio)
    })

    // 4. Verify risk assessments update according to real scenario data and risk engine
    const floodHwyExpected = assessRoutesRisk(
      DETERMINISTIC_ROUTES,
      getDemoScenario('flood-highway').hazards
    )
    const hwyFloodScore = floodHwyExpected['fixture-route-highway'].result!.score
    const pbFloodScore = floodHwyExpected['fixture-route-palm-beach'].result!.score

    expect(hwyFloodScore).toBe(35)
    expect(pbFloodScore).toBe(0)

    // Highway route shows updated score 35 and 1 contributing hazard
    expect(screen.getByText('35')).toBeTruthy()
    expect(
      screen.getByText(/1 simulated hazard detected within 100m threshold contributing to score/i)
    ).toBeTruthy()

    // Palm Beach route shows score 0 and no nearby hazards
    expect(screen.getByText('0')).toBeTruthy()
    expect(screen.getByText('No nearby simulated hazards')).toBeTruthy()
    expect(
      screen.getByText(/No simulated hazards detected within 100m proximity threshold/i)
    ).toBeTruthy()

    // Synthetic demo notice active
    expect(screen.getByRole('status')).toBeTruthy()
    expect(screen.getByText(SYNTHETIC_SCENARIO_NOTICE)).toBeTruthy()

    // 5. Verify route geometry request count did NOT increase
    expect(mockFetchRoadRoutes).toHaveBeenCalledTimes(initialOsrmCallCount)

    // Optional scenario step: Switch to "All Clear"
    const allClearRadio = screen.getByRole('radio', { name: 'All Clear' })
    await act(async () => {
      fireEvent.click(allClearRadio)
    })

    // Both routes now score 0
    const zeroScores = screen.getAllByText('0')
    expect(zeroScores.length).toBe(2)
    const noHazardTags = screen.getAllByText('No nearby simulated hazards')
    expect(noHazardTags.length).toBe(2)

    // Route geometry request count still unchanged
    expect(mockFetchRoadRoutes).toHaveBeenCalledTimes(initialOsrmCallCount)

    // Optional scenario step: Return to "Baseline"
    await act(async () => {
      fireEvent.click(screen.getByRole('radio', { name: 'Baseline' }))
    })

    // Baseline risk scores (30) restored
    expect(screen.getAllByText('30').length).toBe(2)
    expect(screen.queryByRole('status')).toBeNull()

    // Route geometry request count remains 1
    expect(mockFetchRoadRoutes).toHaveBeenCalledTimes(initialOsrmCallCount)
  })
})
