import test from 'node:test'
import assert from 'node:assert/strict'
import type { RoadRoute, HazardLocation } from '../src/types/index.ts'
import {
  findMatchingCorridor,
  validateRouteEndpoints,
  isRouteDistinct,
  NAVI_MUMBAI_CORRIDORS,
} from '../src/features/routing/corridors.ts'
import { fetchRoadRoutes } from '../src/features/routing/osrmService.ts'
import { assessRoutesRisk, assessRouteRisk } from '../src/features/routing/routeRiskAssessment.ts'

// Coordinates for Vashi (North) and CBD Belapur (South)
const VASHI_ORIGIN: [number, number] = [19.0763, 72.9984]
const BELAPUR_DEST: [number, number] = [19.0182, 73.0425]

// Coordinates outside configured corridor (e.g. Panvel to Uran)
const PANVEL_ORIGIN: [number, number] = [18.9894, 73.1175]
const URAN_DEST: [number, number] = [18.8800, 72.9300]

/**
 * Helper to construct a mock Response object for OSRM GeoJSON format.
 */
function createMockOsrmResponse(
  routes: Array<{
    distance: number
    duration: number
    coordinates: [number, number][] // [lat, lng]
  }>,
  code = 'Ok'
): Response {
  const osrmRoutes = routes.map((r) => ({
    distance: r.distance,
    duration: r.duration,
    geometry: {
      type: 'LineString',
      // OSRM GeoJSON uses [lng, lat]
      coordinates: r.coordinates.map(([lat, lng]) => [lng, lat]),
    },
  }))

  const body = JSON.stringify({
    code,
    routes: osrmRoutes,
  })

  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

// ---------------------------------------------------------------------------
// 1. Native OSRM Multiple Routes
// ---------------------------------------------------------------------------
test('fetchRoadRoutes returns multiple candidates when native OSRM returns multiple distinct routes', async () => {
  const mockFetch: typeof fetch = async () => {
    return createMockOsrmResponse([
      {
        distance: 10000,
        duration: 900,
        coordinates: [
          [19.0763, 72.9984],
          [19.0500, 73.0200],
          [19.0182, 73.0425],
        ],
      },
      {
        distance: 11500,
        duration: 1050,
        coordinates: [
          [19.0763, 72.9984],
          [19.0410, 73.0135],
          [19.0182, 73.0425],
        ],
      },
    ])
  }

  const routes = await fetchRoadRoutes(VASHI_ORIGIN, BELAPUR_DEST, undefined, {
    fetchFn: mockFetch,
  })

  assert.equal(routes.length, 2)
  assert.equal(routes[0].id, 'osrm-route-1')
  assert.equal(routes[1].id, 'osrm-route-2')
  assert.equal(routes[0].label, 'Route 1 (Primary)')
  assert.equal(routes[1].label, 'Route 2 (Alternative)')
  assert.equal(routes[0].distanceMeters, 10000)
  assert.equal(routes[1].distanceMeters, 11500)
  assert.equal(routes[0].isCorridorAlternative, undefined)
  assert.equal(routes[1].isCorridorAlternative, undefined)
})

// ---------------------------------------------------------------------------
// 2. Single Route Without Matching Corridor
// ---------------------------------------------------------------------------
test('fetchRoadRoutes returns single route when OSRM returns 1 route and corridor does NOT match', async () => {
  let callCount = 0
  const mockFetch: typeof fetch = async () => {
    callCount++
    return createMockOsrmResponse([
      {
        distance: 15000,
        duration: 1400,
        coordinates: [
          [18.9894, 73.1175],
          [18.9300, 73.0200],
          [18.8800, 72.9300],
        ],
      },
    ])
  }

  const routes = await fetchRoadRoutes(PANVEL_ORIGIN, URAN_DEST, undefined, {
    fetchFn: mockFetch,
  })

  assert.equal(callCount, 1, 'Should NOT trigger via-waypoint query for unconfigured journey')
  assert.equal(routes.length, 1)
  assert.equal(routes[0].id, 'osrm-route-1')
  assert.equal(routes[0].label, 'Primary Road Route')
  assert.equal(routes[0].isCorridorAlternative, undefined)
})

// ---------------------------------------------------------------------------
// 3. Configured Corridor Fallback Succeeding
// ---------------------------------------------------------------------------
test('fetchRoadRoutes queries corridor via-waypoint when OSRM returns 1 route on configured corridor', async () => {
  const requestedUrls: string[] = []

  const mockFetch: typeof fetch = async (input) => {
    const url = input.toString()
    requestedUrls.push(url)

    if (url.includes('alternatives=3') && !url.includes('73.0135,19.041')) {
      // First call: primary query returns single highway route
      return createMockOsrmResponse([
        {
          distance: 9800,
          duration: 720,
          coordinates: [
            [19.0763, 72.9984],
            [19.0550, 73.0220],
            [19.0182, 73.0425],
          ],
        },
      ])
    } else {
      // Second call: via-waypoint (Palm Beach Road) query
      return createMockOsrmResponse([
        {
          distance: 11200,
          duration: 890,
          coordinates: [
            [19.0763, 72.9984],
            [19.0410, 73.0135], // Nerul Palm Beach Road
            [19.0182, 73.0425],
          ],
        },
      ])
    }
  }

  const routes = await fetchRoadRoutes(VASHI_ORIGIN, BELAPUR_DEST, undefined, {
    fetchFn: mockFetch,
  })

  assert.equal(requestedUrls.length, 2, 'Should have made 2 calls: primary and via-waypoint')
  // Verify via-point coordinate was included in second URL
  assert.ok(requestedUrls[1].includes('73.0135,19.041'))

  assert.equal(routes.length, 2)
  assert.equal(routes[0].id, 'osrm-route-1')
  assert.equal(routes[1].id, 'osrm-route-2')
  assert.equal(routes[0].label, 'Route 1 (via Sion-Panvel Hwy)')
  assert.equal(routes[1].label, 'Route 2 (via Palm Beach Rd)')
  assert.equal(routes[1].corridorName, 'Vashi – Belapur Arterial Corridor')
  assert.equal(routes[1].isCorridorAlternative, true)
  assert.equal(routes[1].distanceMeters, 11200)
})

// ---------------------------------------------------------------------------
// 4. Corridor Fallback Failing Without Breaking Primary Route
// ---------------------------------------------------------------------------
test('fetchRoadRoutes safely returns primary route if corridor fallback throws network error', async () => {
  let callCount = 0
  const mockFetch: typeof fetch = async () => {
    callCount++
    if (callCount === 1) {
      return createMockOsrmResponse([
        {
          distance: 9800,
          duration: 720,
          coordinates: [
            [19.0763, 72.9984],
            [19.0550, 73.0220],
            [19.0182, 73.0425],
          ],
        },
      ])
    } else {
      throw new Error('OSRM via-waypoint connection timeout')
    }
  }

  const routes = await fetchRoadRoutes(VASHI_ORIGIN, BELAPUR_DEST, undefined, {
    fetchFn: mockFetch,
  })

  assert.equal(routes.length, 1, 'Primary route must remain usable despite fallback error')
  assert.equal(routes[0].id, 'osrm-route-1')
  assert.equal(routes[0].distanceMeters, 9800)
  assert.equal(routes[0].label, 'Primary Road Route')
})

test('fetchRoadRoutes safely returns primary route if corridor fallback returns HTTP 500 error', async () => {
  let callCount = 0
  const mockFetch: typeof fetch = async () => {
    callCount++
    if (callCount === 1) {
      return createMockOsrmResponse([
        {
          distance: 9800,
          duration: 720,
          coordinates: [
            [19.0763, 72.9984],
            [19.0550, 73.0220],
            [19.0182, 73.0425],
          ],
        },
      ])
    } else {
      return new Response('Internal Server Error', { status: 500 })
    }
  }

  const routes = await fetchRoadRoutes(VASHI_ORIGIN, BELAPUR_DEST, undefined, {
    fetchFn: mockFetch,
  })

  assert.equal(routes.length, 1)
  assert.equal(routes[0].id, 'osrm-route-1')
})

// ---------------------------------------------------------------------------
// 5. Duplicate and Near-Identical Routes Excluded
// ---------------------------------------------------------------------------
test('isRouteDistinct correctly rejects identical geometries and keeps truly distinct paths', () => {
  const routeA: RoadRoute = {
    id: 'route-a',
    label: 'Route A',
    distanceMeters: 10000,
    durationSeconds: 900,
    coordinates: [
      [19.0763, 72.9984],
      [19.0500, 73.0200],
      [19.0182, 73.0425],
    ],
  }

  // Exact duplicate
  const exactDuplicate: RoadRoute = {
    ...routeA,
    id: 'route-dup',
  }
  assert.equal(isRouteDistinct(routeA, exactDuplicate), false)

  // Minor metadata difference but identical coordinates
  const metadataDifference: RoadRoute = {
    ...routeA,
    id: 'route-meta-diff',
    distanceMeters: 10300, // +300m reported
    durationSeconds: 960,
  }
  // Coordinates are identical, so isRouteDistinct checks coordsMatchExactly
  assert.equal(isRouteDistinct(routeA, metadataDifference), false)

  // Truly distinct route via Palm Beach Road
  const routeB: RoadRoute = {
    id: 'route-b',
    label: 'Route B',
    distanceMeters: 11400,
    durationSeconds: 1050,
    coordinates: [
      [19.0763, 72.9984],
      [19.0410, 73.0135],
      [19.0182, 73.0425],
    ],
  }
  assert.equal(isRouteDistinct(routeA, routeB), true)
})

test('fetchRoadRoutes excludes native duplicate routes from provider', async () => {
  const mockFetch: typeof fetch = async () => {
    return createMockOsrmResponse([
      {
        distance: 10000,
        duration: 900,
        coordinates: [
          [19.0763, 72.9984],
          [19.0500, 73.0200],
          [19.0182, 73.0425],
        ],
      },
      // Duplicate of route 1
      {
        distance: 10000,
        duration: 900,
        coordinates: [
          [19.0763, 72.9984],
          [19.0500, 73.0200],
          [19.0182, 73.0425],
        ],
      },
    ])
  }

  // Use matching coordinates for Vashi-Belapur
  const routes = await fetchRoadRoutes(VASHI_ORIGIN, BELAPUR_DEST, undefined, {
    fetchFn: mockFetch,
  })

  // Since native returned 1 deduplicated route and Vashi-Belapur matches corridor,
  // via fallback query is attempted; mockFetch returns the same geometry, which gets rejected as duplicate
  assert.equal(routes.length, 1, 'Duplicate native and duplicate via routes must be filtered out')
  assert.equal(routes[0].id, 'osrm-route-1')
})

test('fetchRoadRoutes rejects via-waypoint fallback route if it duplicates primary route', async () => {
  let callCount = 0
  const mockFetch: typeof fetch = async () => {
    callCount++
    // Both calls return identical geometry
    return createMockOsrmResponse([
      {
        distance: 9800,
        duration: 720,
        coordinates: [
          [19.0763, 72.9984],
          [19.0550, 73.0220],
          [19.0182, 73.0425],
        ],
      },
    ])
  }

  const routes = await fetchRoadRoutes(VASHI_ORIGIN, BELAPUR_DEST, undefined, {
    fetchFn: mockFetch,
  })

  assert.equal(callCount, 2)
  assert.equal(routes.length, 1, 'Duplicate fallback route must be rejected')
  assert.equal(routes[0].label, 'Primary Road Route')
})

// ---------------------------------------------------------------------------
// 6. Endpoint Validation & Geometry Checks
// ---------------------------------------------------------------------------
test('validateRouteEndpoints accepts route within 500m tolerance and rejects disconnected endpoints', () => {
  // Road point ~100m from landmark centroid
  const snappedStart: [number, number] = [19.0768, 72.9990]
  const snappedEnd: [number, number] = [19.0187, 73.0430]

  const validRoute: RoadRoute = {
    id: 'valid-snap-route',
    label: 'Valid Snapped Route',
    distanceMeters: 9000,
    durationSeconds: 700,
    coordinates: [snappedStart, [19.0400, 73.0200], snappedEnd],
  }

  assert.equal(validateRouteEndpoints(validRoute, VASHI_ORIGIN, BELAPUR_DEST), true)

  // Disconnected start point (>1km away)
  const disconnectedRoute: RoadRoute = {
    id: 'bad-endpoint-route',
    label: 'Bad Route',
    distanceMeters: 9000,
    durationSeconds: 700,
    coordinates: [[19.0900, 73.0200], [19.0400, 73.0200], snappedEnd],
  }

  assert.equal(validateRouteEndpoints(disconnectedRoute, VASHI_ORIGIN, BELAPUR_DEST), false)
})

test('fetchRoadRoutes rejects route with malformed or single-point geometry', async () => {
  const mockFetch: typeof fetch = async () => {
    return createMockOsrmResponse([
      {
        distance: 1000,
        duration: 60,
        coordinates: [
          [19.0763, 72.9984], // Only 1 coordinate point
        ],
      },
    ])
  }

  await assert.rejects(
    async () => {
      await fetchRoadRoutes(VASHI_ORIGIN, BELAPUR_DEST, undefined, {
        fetchFn: mockFetch,
      })
    },
    { message: /Routing service returned no usable route options/ }
  )
})

// ---------------------------------------------------------------------------
// 7. Independent Route Risk Assessment on Candidates
// ---------------------------------------------------------------------------
test('assessRoutesRisk assesses each candidate route independently against hazards', () => {
  // Mock hazard on highway route (near Turbhe / Sanpada)
  const highwayHazard: HazardLocation = {
    id: 'haz-turbhe-waterlogging',
    name: 'Turbhe Underpass Flood',
    area: 'Turbhe Area',
    coordinates: [19.0550, 73.0220],
    hazardType: 'waterlogging',
    severity: 'high',
    description: 'Submerged underpass near Sion-Panvel Hwy',
    isSimulated: true,
  }

  // Route 1 (Highway): passes right through the hazard
  const highwayRoute: RoadRoute = {
    id: 'route-highway',
    label: 'via Sion-Panvel Hwy',
    distanceMeters: 9800,
    durationSeconds: 720,
    coordinates: [
      [19.0763, 72.9984],
      [19.0550, 73.0220], // directly intersects hazard
      [19.0182, 73.0425],
    ],
  }

  // Route 2 (Palm Beach Rd): bypasses the hazard by ~1.5 km
  const palmBeachRoute: RoadRoute = {
    id: 'route-palmbeach',
    label: 'via Palm Beach Rd',
    distanceMeters: 11200,
    durationSeconds: 890,
    corridorName: 'Vashi – Belapur Arterial Corridor',
    isCorridorAlternative: true,
    coordinates: [
      [19.0763, 72.9984],
      [19.0410, 73.0135], // Nerul Palm Beach Road
      [19.0182, 73.0425],
    ],
  }

  const assessments = assessRoutesRisk([highwayRoute, palmBeachRoute], [highwayHazard])

  const assessment1 = assessments['route-highway']
  const assessment2 = assessments['route-palmbeach']

  assert.ok(assessment1, 'Assessment for route-highway must exist')
  assert.ok(assessment2, 'Assessment for route-palmbeach must exist')

  // Verify independence: Route 1 has high risk (score 35), Route 2 has 0 risk
  assert.equal(assessment1.routeId, 'route-highway')
  assert.equal(assessment1.status, 'success')
  assert.ok(assessment1.result)
  assert.equal(assessment1.result.score, 35, 'Highway route directly intersecting high hazard has score 35')
  assert.equal(assessment1.result.includedHazardCount, 1)

  assert.equal(assessment2.routeId, 'route-palmbeach')
  assert.equal(assessment2.status, 'success')
  assert.ok(assessment2.result)
  assert.equal(assessment2.result.score, 0, 'Palm Beach route should have zero score for this hazard')
  assert.equal(assessment2.result.includedHazardCount, 0)
})

// ---------------------------------------------------------------------------
// 8. Corridor Registry Coverage & Matching
// ---------------------------------------------------------------------------
test('findMatchingCorridor correctly identifies Vashi-Belapur and Airoli-Vashi journeys', () => {
  // Vashi -> Belapur (North -> South)
  const match1 = findMatchingCorridor([19.0763, 72.9984], [19.0182, 73.0425])
  assert.ok(match1)
  assert.equal(match1?.id, 'vashi-belapur-palm-beach')

  // Belapur -> Vashi (South -> North)
  const match2 = findMatchingCorridor([19.0182, 73.0425], [19.0763, 72.9984])
  assert.ok(match2)
  assert.equal(match2?.id, 'vashi-belapur-palm-beach')

  // Airoli -> Vashi (Upper North -> Lower)
  const match3 = findMatchingCorridor([19.1550, 72.9950], [19.0763, 72.9984])
  assert.ok(match3)
  assert.equal(match3?.id, 'airoli-vashi-west-bypass')

  // Out of zone journey
  const noMatch = findMatchingCorridor([18.9894, 73.1175], [18.8800, 72.9300])
  assert.equal(noMatch, undefined)
})
