import { render, screen, fireEvent, cleanup, within } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { RouteSelector } from '../../src/features/map/RouteSelector.tsx'
import type {
  RoadRoute,
  RouteEndpointType,
  RouteRiskAssessment,
  RouteStatus,
} from '../../src/types/index.ts'
import type { DemoScenarioId } from '../../src/features/scenarios/scenarios.ts'

// Mock placesService to prevent any possible network search requests from nested PlaceSearchInput
vi.mock('../../src/features/search/placesService.ts', () => ({
  searchPlaces: vi.fn(),
}))

const mockRoutes: RoadRoute[] = [
  {
    id: 'route-highway',
    label: 'Thane–Belapur Highway',
    coordinates: [
      [19.0645, 72.9983],
      [19.0435, 73.018],
      [19.0185, 73.0385],
    ],
    distanceMeters: 14200, // 14.2 km (shortest)
    durationSeconds: 1320, // 22 mins
    corridorName: 'Thane–Belapur Corridor',
    engineEstimateNotice: 'OSRM router estimate based on standard road network.',
  },
  {
    id: 'route-palm-beach',
    label: 'Palm Beach Road Arterial',
    coordinates: [
      [19.0645, 72.9983],
      [19.0635, 73.0062],
      [19.0336, 73.0163],
      [19.0185, 73.0385],
    ],
    distanceMeters: 15800, // 15.8 km
    durationSeconds: 1200, // 20 mins (fastest)
    corridorName: 'Palm Beach Corridor',
    isCorridorAlternative: true,
    engineEstimateNotice: 'OSRM router estimate based on standard road network.',
  },
]

const mockRiskAssessments: Record<string, RouteRiskAssessment> = {
  'route-highway': {
    routeId: 'route-highway',
    status: 'success',
    result: {
      score: 45,
      riskCategory: 'Moderate',
      evaluatedHazardCount: 5,
      includedHazardCount: 2,
      thresholdMeters: 100,
      summaryExplanation: '2 simulated hazards detected within 100m threshold.',
      contributions: [
        {
          hazardId: 'haz-turbhe',
          hazardName: 'Turbhe Underpass Flooding',
          severity: 'high',
          distanceMeters: 25,
          baseWeight: 20,
          proximityMultiplier: 0.9,
          scoreContribution: 18,
          explanation: 'Severe waterlogging near underpass road bed.',
        },
      ],
    },
  },
  'route-palm-beach': {
    routeId: 'route-palm-beach',
    status: 'success',
    result: {
      score: 0,
      riskCategory: 'No nearby simulated hazards',
      evaluatedHazardCount: 5,
      includedHazardCount: 0,
      thresholdMeters: 100,
      summaryExplanation: 'No simulated hazards detected within 100m proximity threshold.',
      contributions: [],
    },
  },
}

function createDefaultProps() {
  return {
    origin: {
      label: 'Vashi Station',
      coordinates: [19.0645, 72.9983] as [number, number],
      source: 'curated' as const,
    },
    destination: {
      label: 'CBD Belapur Station',
      coordinates: [19.0185, 73.0385] as [number, number],
      source: 'curated' as const,
    },
    activeTarget: 'origin' as RouteEndpointType,
    onSelectTarget: vi.fn(),
    onSelectOrigin: vi.fn(),
    onSelectDestination: vi.fn(),
    onSwap: vi.fn(),
    onClear: vi.fn(),
    isIdentical: false,
    routes: mockRoutes,
    selectedRouteId: 'route-highway',
    onSelectRoute: vi.fn(),
    routeStatus: 'success' as RouteStatus,
    routeError: null as string | null,
    onPlanRoute: vi.fn(),
    onClearRoute: vi.fn(),
    riskAssessments: mockRiskAssessments,
    selectedScenarioId: 'baseline' as DemoScenarioId,
    onSelectScenario: vi.fn(),
  }
}

describe('RouteSelector Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  // 1. Initial rendering with multiple routes
  it('renders alternative route comparison heading and radiogroup when multiple routes exist', () => {
    const props = createDefaultProps()
    render(<RouteSelector {...props} />)

    const summaryRegion = screen.getByRole('region', {
      name: 'Retrieved alternative routes comparison',
    })
    expect(summaryRegion).toBeTruthy()

    expect(screen.getByText('OSRM Alternatives • 2 Found')).toBeTruthy()
    expect(screen.getByText('Alternative Route Comparison')).toBeTruthy()

    const routesGroup = screen.getByRole('radiogroup', {
      name: 'Available alternative routes',
    })
    expect(routesGroup).toBeTruthy()

    const routeCards = within(routesGroup).getAllByRole('radio')
    expect(routeCards.length).toBe(2)
  })

  // 2. Metadata display & tradeoff badges
  it('displays route names, formatted distance, duration, coordinate points, and tradeoff badges', () => {
    const props = createDefaultProps()
    render(<RouteSelector {...props} />)

    // Route 1 (Highway)
    expect(screen.getByText('Thane–Belapur Highway')).toBeTruthy()
    expect(screen.getByText('Thane–Belapur Corridor')).toBeTruthy()
    expect(screen.getByText('14.2 km')).toBeTruthy()
    expect(screen.getByText('22 mins')).toBeTruthy()
    expect(screen.getByText('3 pts')).toBeTruthy()
    expect(screen.getByText('📏 Shortest Distance')).toBeTruthy()

    // Route 2 (Palm Beach)
    expect(screen.getByText('Palm Beach Road Arterial')).toBeTruthy()
    expect(screen.getByText('Palm Beach Corridor')).toBeTruthy()
    expect(screen.getByText('15.8 km')).toBeTruthy()
    expect(screen.getByText('20 mins')).toBeTruthy()
    expect(screen.getByText('4 pts')).toBeTruthy()
    expect(screen.getByText('⚡ Fastest Estimate')).toBeTruthy()

    // Engine notice and disclaimer
    expect(
      screen.getByText(/Prototype risk estimate based on simulated hazards/)
    ).toBeTruthy()
    expect(
      screen.getByText('OSRM router estimate based on standard road network.')
    ).toBeTruthy()
  })

  // 3. Risk assessment rendering
  it('displays risk assessment scores, categories, explanations, and hazard contributions', () => {
    const props = createDefaultProps()
    render(<RouteSelector {...props} />)

    // Moderate risk on route 1
    expect(screen.getByText('45')).toBeTruthy()
    expect(screen.getByText('Moderate')).toBeTruthy()
    expect(
      screen.getByText(
        '2 simulated hazards detected within 100m threshold contributing to score.'
      )
    ).toBeTruthy()

    // Contributing hazards details
    expect(screen.getByText('Contributing Hazards (1)')).toBeTruthy()
    expect(screen.getByText('Turbhe Underpass Flooding')).toBeTruthy()
    expect(screen.getByText('HIGH')).toBeTruthy()
    expect(screen.getByText('25m from route')).toBeTruthy()
    expect(screen.getByText('+18 pts')).toBeTruthy()
    expect(screen.getByText('Severe waterlogging near underpass road bed.')).toBeTruthy()

    // No nearby hazards on route 2
    expect(screen.getByText('0')).toBeTruthy()
    expect(screen.getByText('No nearby simulated hazards')).toBeTruthy()
    expect(
      screen.getByText(
        'No simulated hazards detected within 100m proximity threshold.'
      )
    ).toBeTruthy()
  })

  // 4. Correct identification of the selected route
  it('correctly marks the selected route card with active tags and aria-checked', () => {
    const props = createDefaultProps()
    render(<RouteSelector {...props} selectedRouteId="route-highway" />)

    const highwayCard = screen.getByRole('radio', { name: /Thane–Belapur Highway/ })
    const palmBeachCard = screen.getByRole('radio', { name: /Palm Beach Road Arterial/ })

    expect(highwayCard.getAttribute('aria-checked')).toBe('true')
    expect(palmBeachCard.getAttribute('aria-checked')).toBe('false')

    // Selected route has highlighted tags and active button
    expect(screen.getByText('✓ Highlighted')).toBeTruthy()
    expect(
      screen.getByRole('button', {
        name: 'Select Thane–Belapur Highway to display on map',
      }).textContent
    ).toBe('Highlighted on Map')

    // Unselected route has alternative tag and select button
    expect(screen.getByText('Alternative')).toBeTruthy()
    expect(
      screen.getByRole('button', {
        name: 'Select Palm Beach Road Arterial to display on map',
      }).textContent
    ).toBe('Select This Route')
  })

  // 5. Selecting another route via card click and action button
  it('invokes onSelectRoute when clicking an unselected route card or its action button', () => {
    const onSelectRoute = vi.fn()
    const props = createDefaultProps()
    render(<RouteSelector {...props} onSelectRoute={onSelectRoute} />)

    const palmBeachCard = screen.getByRole('radio', { name: /Palm Beach Road Arterial/ })

    // Click Palm Beach card
    fireEvent.click(palmBeachCard)
    expect(onSelectRoute).toHaveBeenCalledTimes(1)
    expect(onSelectRoute).toHaveBeenCalledWith('route-palm-beach')

    // Click action button in Palm Beach card
    const selectBtn = screen.getByRole('button', {
      name: 'Select Palm Beach Road Arterial to display on map',
    })
    fireEvent.click(selectBtn)
    expect(onSelectRoute).toHaveBeenCalledTimes(2)
    expect(onSelectRoute).toHaveBeenLastCalledWith('route-palm-beach')
  })

  // 6. Prop updates & selected route synchronization
  it('synchronizes selected state when selectedRouteId prop changes', () => {
    const props = createDefaultProps()
    const { rerender } = render(
      <RouteSelector {...props} selectedRouteId="route-highway" />
    )

    let highwayCard = screen.getByRole('radio', { name: /Thane–Belapur Highway/ })
    let palmBeachCard = screen.getByRole('radio', { name: /Palm Beach Road Arterial/ })

    expect(highwayCard.getAttribute('aria-checked')).toBe('true')
    expect(palmBeachCard.getAttribute('aria-checked')).toBe('false')

    // Switch selected route to Palm Beach
    rerender(<RouteSelector {...props} selectedRouteId="route-palm-beach" />)

    highwayCard = screen.getByRole('radio', { name: /Thane–Belapur Highway/ })
    palmBeachCard = screen.getByRole('radio', { name: /Palm Beach Road Arterial/ })

    expect(highwayCard.getAttribute('aria-checked')).toBe('false')
    expect(palmBeachCard.getAttribute('aria-checked')).toBe('true')
  })

  // 7. Single route rendering
  it('renders single-route summary layout when only one route is returned', () => {
    const props = createDefaultProps()
    const singleRoute: RoadRoute = {
      ...mockRoutes[0],
      label: 'Primary Road Route',
    }

    render(
      <RouteSelector
        {...props}
        routes={[singleRoute]}
        selectedRouteId="route-highway"
      />
    )

    expect(
      screen.getByRole('region', { name: 'Retrieved road route summary' })
    ).toBeTruthy()
    expect(screen.getByText('Route Retrieved')).toBeTruthy()
    expect(screen.getByText('OSRM Road Route')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Clear Route Line' })).toBeTruthy()

    // Metrics in single route container
    expect(screen.getByText('Road Distance')).toBeTruthy()
    expect(screen.getByText('Est. Duration')).toBeTruthy()
    expect(screen.getByText('Waypoints')).toBeTruthy()
    expect(screen.getByText('3 points')).toBeTruthy()

    // Single route fallback notice
    expect(
      screen.getByText(
        'Single driving route returned by routing service. No distinct alternative corridor found for these endpoints.'
      )
    ).toBeTruthy()
  })

  // 8. Empty & missing route states
  it('renders empty route state when routes array is empty', () => {
    const props = createDefaultProps()
    render(
      <RouteSelector
        {...props}
        routes={[]}
        selectedRouteId={null}
        routeStatus="idle"
      />
    )

    // Alternative routes radiogroup and single route header should not be present
    expect(
      screen.queryByRole('radiogroup', { name: 'Available alternative routes' })
    ).toBeNull()
    expect(screen.queryByText('OSRM Road Route')).toBeNull()

    // Footer indicates endpoints ready to plan
    expect(screen.getByRole('button', { name: 'Plan Driving Routes OSRM' })).toBeTruthy()
    expect(
      screen.getByText(/Endpoints ready. Click "Plan Driving Routes" to calculate path./)
    ).toBeTruthy()
  })

  it('indicates waiting for endpoints when origin or destination is missing', () => {
    const props = createDefaultProps()
    render(
      <RouteSelector
        {...props}
        origin={null}
        destination={null}
        routes={[]}
        selectedRouteId={null}
        routeStatus="idle"
      />
    )

    const planBtn = screen.getByRole('button', { name: 'Plan Driving Routes OSRM' })
    expect(planBtn.getAttribute('disabled')).not.toBeNull()
    expect(
      screen.getByText('Select an origin and destination on the map to calculate a route.')
    ).toBeTruthy()
  })

  it('invokes onPlanRoute when Plan Driving Routes button is clicked', () => {
    const onPlanRoute = vi.fn()
    const props = createDefaultProps()
    render(
      <RouteSelector
        {...props}
        routes={[]}
        selectedRouteId={null}
        routeStatus="idle"
        onPlanRoute={onPlanRoute}
      />
    )

    const planBtn = screen.getByRole('button', { name: 'Plan Driving Routes OSRM' })
    fireEvent.click(planBtn)
    expect(onPlanRoute).toHaveBeenCalledTimes(1)
  })

  // 9. Loading & error status panels
  it('renders loading panel and disables plan button during route fetching', () => {
    const props = createDefaultProps()
    render(
      <RouteSelector
        {...props}
        routes={[]}
        selectedRouteId={null}
        routeStatus="loading"
      />
    )

    const loadingPanel = screen.getByRole('status')
    expect(loadingPanel.textContent).toContain(
      'Querying public OSRM routing service for driving road geometry...'
    )

    const planBtn = screen.getByRole('button', { name: 'Fetching Routes...' })
    expect(planBtn.getAttribute('disabled')).not.toBeNull()
    expect(planBtn.getAttribute('aria-busy')).toBe('true')
  })

  it('renders error panel with retry button when routeStatus is error', () => {
    const onPlanRoute = vi.fn()
    const props = createDefaultProps()
    render(
      <RouteSelector
        {...props}
        routes={[]}
        selectedRouteId={null}
        routeStatus="error"
        routeError="Routing service unreachable (HTTP 502)"
        onPlanRoute={onPlanRoute}
      />
    )

    const errorAlert = screen.getByRole('alert')
    expect(errorAlert.textContent).toContain('Routing service unreachable (HTTP 502)')

    const retryBtn = screen.getByRole('button', { name: 'Retry Request' })
    fireEvent.click(retryBtn)
    expect(onPlanRoute).toHaveBeenCalledTimes(1)
  })

  // 10. Identical endpoints validation alert
  it('renders validation alert and disables planning when origin and destination are identical', () => {
    const props = createDefaultProps()
    render(
      <RouteSelector
        {...props}
        isIdentical={true}
        routes={[]}
        selectedRouteId={null}
        routeStatus="idle"
      />
    )

    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain(
      'Origin and destination cannot be the same location'
    )

    const planBtn = screen.getByRole('button', { name: 'Plan Driving Routes OSRM' })
    expect(planBtn.getAttribute('disabled')).not.toBeNull()
  })

  // 11. Optional and missing route metadata tolerance
  it('falls back to default route labels when label is omitted', () => {
    const props = createDefaultProps()
    const unlabeledRoutes: RoadRoute[] = [
      { ...mockRoutes[0], label: undefined },
      { ...mockRoutes[1], label: undefined },
    ]

    render(
      <RouteSelector
        {...props}
        routes={unlabeledRoutes}
        selectedRouteId="route-highway"
      />
    )

    expect(screen.getByText('Route 1')).toBeTruthy()
    expect(screen.getByText('Route 2')).toBeTruthy()
  })

  it('renders cleanly when riskAssessments prop is missing or contains error status', () => {
    const props = createDefaultProps()
    const errorRiskAssessments: Record<string, RouteRiskAssessment> = {
      'route-highway': {
        routeId: 'route-highway',
        status: 'error',
        error: 'Failed to evaluate proximity to hazard clusters.',
      },
    }

    const { rerender } = render(
      <RouteSelector
        {...props}
        riskAssessments={undefined}
      />
    )
    // Does not throw without riskAssessments
    expect(screen.getByText('Alternative Route Comparison')).toBeTruthy()

    // Rerender with error status in assessment
    rerender(
      <RouteSelector
        {...props}
        riskAssessments={errorRiskAssessments}
      />
    )

    expect(screen.getByText('Risk Assessment Unavailable')).toBeTruthy()
    expect(
      screen.getByText('Failed to evaluate proximity to hazard clusters.')
    ).toBeTruthy()
  })

  // 12. Keyboard interaction and accessibility
  it('supports Enter and Space key navigation to select alternative route cards', () => {
    const onSelectRoute = vi.fn()
    const props = createDefaultProps()
    render(<RouteSelector {...props} onSelectRoute={onSelectRoute} />)

    const palmBeachCard = screen.getByRole('radio', { name: /Palm Beach Road Arterial/ })

    // Press Enter on Palm Beach card
    fireEvent.keyDown(palmBeachCard, { key: 'Enter' })
    expect(onSelectRoute).toHaveBeenCalledTimes(1)
    expect(onSelectRoute).toHaveBeenCalledWith('route-palm-beach')

    // Press Space on Palm Beach card
    fireEvent.keyDown(palmBeachCard, { key: ' ' })
    expect(onSelectRoute).toHaveBeenCalledTimes(2)
    expect(onSelectRoute).toHaveBeenLastCalledWith('route-palm-beach')
  })

  // 13. Endpoint swap, clear, and fallback selection
  it('triggers onSwap when clicking the swap button', () => {
    const onSwap = vi.fn()
    const props = createDefaultProps()
    render(<RouteSelector {...props} onSwap={onSwap} />)

    const swapBtn = screen.getByRole('button', {
      name: 'Swap origin and destination locations',
    })
    fireEvent.click(swapBtn)
    expect(onSwap).toHaveBeenCalledTimes(1)
  })

  it('triggers onClearRoute when clicking Clear All Routes button', () => {
    const onClearRoute = vi.fn()
    const props = createDefaultProps()
    render(<RouteSelector {...props} onClearRoute={onClearRoute} />)

    const clearBtn = screen.getByRole('button', { name: 'Clear All Routes' })
    fireEvent.click(clearBtn)
    expect(onClearRoute).toHaveBeenCalledTimes(1)
  })

  it('defaults to first route when selectedRouteId is null or does not match any route', () => {
    const props = createDefaultProps()
    render(<RouteSelector {...props} selectedRouteId="non-existent-id" />)

    const highwayCard = screen.getByRole('radio', { name: /Thane–Belapur Highway/ })
    const palmBeachCard = screen.getByRole('radio', { name: /Palm Beach Road Arterial/ })

    // Defaults to routes[0] (Highway)
    expect(highwayCard.getAttribute('aria-checked')).toBe('true')
    expect(palmBeachCard.getAttribute('aria-checked')).toBe('false')
  })
})
