import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_PROXIMITY_THRESHOLD_METERS,
  calculatePointToPointDistanceMeters,
  calculatePointToSegmentDistanceMeters,
  calculateHazardRouteDistanceMeters,
  evaluateRouteHazardProximity,
  detectNearbyHazards,
  isValidCoordinate,
} from '../src/features/routing/hazardProximity.ts'
import { SIMULATED_HAZARDS } from '../src/features/map/hazardData.ts'
import type { HazardLocation, RoadRoute } from '../src/types/index.ts'

// Helper to make test hazards
function createTestHazard(
  id: string,
  coordinates: [number, number],
  name = `Hazard ${id}`,
  severity: HazardLocation['severity'] = 'medium'
): HazardLocation {
  return {
    id,
    name,
    area: 'Navi Mumbai Test Area',
    coordinates,
    hazardType: 'waterlogging',
    severity,
    description: 'Test hazard description',
    isSimulated: true,
  }
}

test('Test A — Hazard on the route: minimum distance ~0m and considered nearby', () => {
  // Route from Vashi toward Sanpada along 19.0650 N
  const routeCoords: [number, number][] = [
    [19.0650, 72.9900],
    [19.0650, 73.0100],
  ]
  // Hazard placed directly on the segment at midpoint
  const onRouteHazard = createTestHazard('haz-a', [19.0650, 73.0000])

  const summary = evaluateRouteHazardProximity(routeCoords, [onRouteHazard])

  assert.equal(summary.evaluatedHazardCount, 1)
  assert.equal(summary.nearbyHazards.length, 1)
  assert.equal(summary.nearbyHazards[0].hazardId, 'haz-a')
  assert.equal(summary.nearbyHazards[0].isNearby, true)
  assert.ok(
    summary.nearbyHazards[0].distanceMeters <= 0.1,
    `Expected distance ~0m, got ${summary.nearbyHazards[0].distanceMeters}m`
  )
})

test('Test B — Hazard near a segment, not a vertex: detected when far from endpoints', () => {
  // Long segment (~1 km long) between endpoints
  // At ~19.07 N, 0.01 deg lon is ~1051m
  const start: [number, number] = [19.0700, 72.9900]
  const end: [number, number] = [19.0700, 73.0000]
  const routeCoords: [number, number][] = [start, end]

  // Midpoint is [19.0700, 72.9950].
  // Place hazard 0.0003 deg north (~33.4m) at midpoint longitude 72.9950
  // Distance to start is > 500m; distance to end is > 500m.
  const midpointHazard = createTestHazard('haz-b', [19.0703, 72.9950])

  // Verify distance to vertices is far
  const distToStart = calculatePointToPointDistanceMeters(midpointHazard.coordinates, start)
  const distToEnd = calculatePointToPointDistanceMeters(midpointHazard.coordinates, end)
  assert.ok(distToStart > 500, `Dist to start must be > 500m, was ${distToStart}`)
  assert.ok(distToEnd > 500, `Dist to end must be > 500m, was ${distToEnd}`)

  // Evaluate with default 100m threshold
  const summary = evaluateRouteHazardProximity(routeCoords, [midpointHazard])

  assert.equal(summary.nearbyHazards.length, 1)
  assert.equal(summary.nearbyHazards[0].isNearby, true)
  // Perpendicular distance is ~33.4 meters
  assert.ok(
    summary.nearbyHazards[0].distanceMeters >= 30 &&
      summary.nearbyHazards[0].distanceMeters <= 36,
    `Expected ~33m, got ${summary.nearbyHazards[0].distanceMeters}m`
  )
})

test('Test C — Hazard outside the threshold: excluded from nearby-hazard results', () => {
  const routeCoords: [number, number][] = [
    [19.0600, 73.0000],
    [19.0600, 73.0100],
  ]
  // 0.0015 deg north at lat 19 deg is ~166.8 meters away (> 100m threshold)
  const farHazard = createTestHazard('haz-c', [19.0615, 73.0050])

  const summary = evaluateRouteHazardProximity(routeCoords, [farHazard], {
    thresholdMeters: 100,
  })

  assert.equal(summary.evaluatedHazardCount, 1)
  assert.equal(summary.nearbyHazards.length, 0)
  assert.equal(summary.allHazards[0].isNearby, false)
  assert.ok(
    summary.allHazards[0].distanceMeters > 150,
    `Expected > 150m, got ${summary.allHazards[0].distanceMeters}m`
  )
})

test('Test D — Threshold boundary: inclusive boundary behavior at exact threshold', () => {
  const routeCoords: [number, number][] = [
    [19.0000, 73.0000],
    [19.0100, 73.0000],
  ]

  // Construct a point exactly 100.0 meters away perpendicular to the segment
  // At latitude 19.0050, 100m east corresponds to delta lon = 100 / (R * cos(19.005) * degToRad)
  const latMid = 19.0050
  const degToRad = Math.PI / 180
  const cosLat = Math.cos(latMid * degToRad)
  const deltaLon = 100 / (6371000 * cosLat * degToRad)
  const boundaryHazard = createTestHazard('haz-d', [latMid, 73.0000 + deltaLon])

  const dist = calculatePointToSegmentDistanceMeters(
    boundaryHazard.coordinates,
    routeCoords[0],
    routeCoords[1]
  )
  assert.ok(
    Math.abs(dist - 100) < 0.05,
    `Boundary test setup should be ~100m, was ${dist}`
  )

  const summary = evaluateRouteHazardProximity(routeCoords, [boundaryHazard], {
    thresholdMeters: 100,
  })

  assert.equal(summary.nearbyHazards.length, 1)
  assert.equal(summary.nearbyHazards[0].isNearby, true)
  assert.equal(Math.round(summary.nearbyHazards[0].distanceMeters), 100)
})

test('Test E — Multiple hazards: correct identification and nearest-first sorting', () => {
  const routeCoords: [number, number][] = [
    [19.0500, 73.0000],
    [19.0500, 73.0200],
  ]

  // 1 deg lat is ~111195m => 0.0001 deg is ~11.1m
  const hazNear = createTestHazard('haz-near', [19.0502, 73.0050]) // ~22.2m
  const hazMid = createTestHazard('haz-mid', [19.0506, 73.0100]) // ~66.7m
  const hazFar = createTestHazard('haz-far', [19.0515, 73.0150]) // ~166.8m (outside 100m)

  // Pass in mixed order: far, mid, near
  const summary = evaluateRouteHazardProximity(
    routeCoords,
    [hazFar, hazMid, hazNear],
    { thresholdMeters: 100 }
  )

  assert.equal(summary.evaluatedHazardCount, 3)
  assert.equal(summary.nearbyHazards.length, 2)
  // Verify nearest first
  assert.equal(summary.nearbyHazards[0].hazardId, 'haz-near')
  assert.equal(summary.nearbyHazards[1].hazardId, 'haz-mid')
  assert.ok(
    summary.nearbyHazards[0].distanceMeters < summary.nearbyHazards[1].distanceMeters
  )
})

test('Test F — Multiple route segments: minimum distance evaluated across all segments', () => {
  // 3 segments: Segment 1 (far), Segment 2 (near hazard), Segment 3 (far)
  const routeCoords: [number, number][] = [
    [19.0000, 73.0000], // S1 start
    [19.0000, 73.0100], // S1 end / S2 start
    [19.0100, 73.0100], // S2 end / S3 start
    [19.0100, 73.0200], // S3 end
  ]

  // Hazard placed near middle of Segment 2: [19.0050, 73.0100]
  // Put hazard 25m east at [19.0050, 73.01024]
  const hazardNearS2 = createTestHazard('haz-s2', [19.0050, 73.01024])

  const distToS1 = calculatePointToSegmentDistanceMeters(
    hazardNearS2.coordinates,
    routeCoords[0],
    routeCoords[1]
  )
  const distToS2 = calculatePointToSegmentDistanceMeters(
    hazardNearS2.coordinates,
    routeCoords[1],
    routeCoords[2]
  )
  const distToS3 = calculatePointToSegmentDistanceMeters(
    hazardNearS2.coordinates,
    routeCoords[2],
    routeCoords[3]
  )

  assert.ok(distToS1 > 500, `Dist to S1 should be > 500m, was ${distToS1}`)
  assert.ok(distToS2 < 30, `Dist to S2 should be < 30m, was ${distToS2}`)
  assert.ok(distToS3 > 500, `Dist to S3 should be > 500m, was ${distToS3}`)

  const totalMinDist = calculateHazardRouteDistanceMeters(
    hazardNearS2.coordinates,
    routeCoords
  )
  assert.equal(Math.round(totalMinDist * 10) / 10, Math.round(distToS2 * 10) / 10)

  const summary = evaluateRouteHazardProximity(routeCoords, [hazardNearS2])
  assert.equal(summary.nearbyHazards.length, 1)
  assert.equal(summary.nearbyHazards[0].hazardId, 'haz-s2')
})

test('Test G — Single-point route: evaluates point-to-point distance to single vertex', () => {
  const singlePointRoute: [number, number][] = [[19.0700, 73.0000]]
  // Place hazard ~55m away
  const hazard = createTestHazard('haz-g', [19.0705, 73.0000])

  const summary = evaluateRouteHazardProximity(singlePointRoute, [hazard])

  assert.equal(summary.evaluatedHazardCount, 1)
  assert.equal(summary.nearbyHazards.length, 1)
  assert.equal(summary.nearbyHazards[0].hazardId, 'haz-g')
  assert.ok(
    summary.nearbyHazards[0].distanceMeters >= 50 &&
      summary.nearbyHazards[0].distanceMeters <= 60
  )
})

test('Test H — Empty route geometry: returns empty summary safely', () => {
  const hazards = [createTestHazard('haz-h', [19.0700, 73.0000])]

  // Empty coordinate array
  const summaryEmpty = evaluateRouteHazardProximity([], hazards)
  assert.equal(summaryEmpty.evaluatedHazardCount, 0)
  assert.equal(summaryEmpty.nearbyHazards.length, 0)
  assert.equal(summaryEmpty.allHazards.length, 0)

  // Null route
  const summaryNull = evaluateRouteHazardProximity(null, hazards)
  assert.equal(summaryNull.evaluatedHazardCount, 0)
  assert.equal(summaryNull.nearbyHazards.length, 0)

  // RoadRoute with empty coordinates
  const roadRouteEmpty: RoadRoute = {
    id: 'r-empty',
    coordinates: [],
    distanceMeters: 0,
    durationSeconds: 0,
    engineEstimateNotice: 'Test',
  }
  const summaryRoadRoute = evaluateRouteHazardProximity(roadRouteEmpty, hazards)
  assert.equal(summaryRoadRoute.evaluatedHazardCount, 0)
  assert.equal(summaryRoadRoute.nearbyHazards.length, 0)
})

test('Test I — Repeated route points: duplicate consecutive points do not divide by zero', () => {
  // Segment where start == end
  const degenerateRoute: [number, number][] = [
    [19.0700, 73.0000],
    [19.0700, 73.0000], // duplicate
    [19.0750, 73.0000],
  ]
  const hazard = createTestHazard('haz-i', [19.0700, 73.0002]) // ~21m from duplicate vertex

  const summary = evaluateRouteHazardProximity(degenerateRoute, [hazard])

  assert.equal(summary.evaluatedHazardCount, 1)
  assert.equal(summary.nearbyHazards.length, 1)
  assert.ok(Number.isFinite(summary.nearbyHazards[0].distanceMeters))
  assert.ok(!Number.isNaN(summary.nearbyHazards[0].distanceMeters))
  assert.ok(summary.nearbyHazards[0].distanceMeters > 0)
})

test('Test J — Invalid coordinates: malformed route or hazard values handled safely', () => {
  const hazard = createTestHazard('haz-j', [19.0700, 73.0000])

  // Route containing NaN latitude
  const nanRoute: [number, number][] = [
    [NaN, 73.0000],
    [19.0700, 73.0000],
  ]
  const summaryNan = evaluateRouteHazardProximity(nanRoute, [hazard])
  assert.equal(summaryNan.evaluatedHazardCount, 0)
  assert.equal(summaryNan.nearbyHazards.length, 0)

  // Route containing out-of-range latitude (> 90)
  const oobRoute: [number, number][] = [
    [95.0000, 73.0000],
    [19.0700, 73.0000],
  ]
  const summaryOob = evaluateRouteHazardProximity(oobRoute, [hazard])
  assert.equal(summaryOob.evaluatedHazardCount, 0)
  assert.equal(summaryOob.nearbyHazards.length, 0)

  // Valid route, but hazard with NaN coordinates
  const validRoute: [number, number][] = [
    [19.0700, 73.0000],
    [19.0800, 73.0000],
  ]
  const malformedHazard = createTestHazard('haz-bad', [NaN, 73.0000] as unknown as [number, number])
  const summaryBadHazard = evaluateRouteHazardProximity(validRoute, [malformedHazard])
  assert.equal(summaryBadHazard.evaluatedHazardCount, 0)
  assert.equal(summaryBadHazard.nearbyHazards.length, 0)
})

test('Test K — Empty hazard collection: returns empty summary safely', () => {
  const validRoute: [number, number][] = [
    [19.0700, 73.0000],
    [19.0800, 73.0000],
  ]

  const summaryEmpty = evaluateRouteHazardProximity(validRoute, [])
  assert.equal(summaryEmpty.evaluatedHazardCount, 0)
  assert.equal(summaryEmpty.nearbyHazards.length, 0)
  assert.equal(summaryEmpty.allHazards.length, 0)

  const summaryNull = evaluateRouteHazardProximity(validRoute, null)
  assert.equal(summaryNull.evaluatedHazardCount, 0)
  assert.equal(summaryNull.nearbyHazards.length, 0)
})

test('Test L — Threshold validation: rejects negative or non-finite thresholds with RangeError', () => {
  const validRoute: [number, number][] = [
    [19.0700, 73.0000],
    [19.0800, 73.0000],
  ]
  const hazards = [createTestHazard('haz-l', [19.0750, 73.0000])]

  assert.throws(
    () => evaluateRouteHazardProximity(validRoute, hazards, { thresholdMeters: -5 }),
    RangeError
  )

  assert.throws(
    () => evaluateRouteHazardProximity(validRoute, hazards, { thresholdMeters: NaN }),
    RangeError
  )

  assert.throws(
    () => evaluateRouteHazardProximity(validRoute, hazards, { thresholdMeters: Infinity }),
    RangeError
  )
})

test('Test M — Coordinate order: strictly respects [lat, lng] without reversing coordinates', () => {
  // Reference point in Navi Mumbai: 19.0000 N, 73.0000 E
  const refPoint: [number, number] = [19.0000, 73.0000]

  // Point A shifted north by 0.001 deg latitude (same longitude)
  // Distance = 0.001 * (pi/180) * 6371000 = 111.19 meters
  const northPoint: [number, number] = [19.0010, 73.0000]
  const northDist = calculatePointToPointDistanceMeters(refPoint, northPoint)

  // Point B shifted east by 0.001 deg longitude (same latitude)
  // Distance = 0.001 * (pi/180) * 6371000 * cos(19 deg) = 105.14 meters
  const eastPoint: [number, number] = [19.0000, 73.0010]
  const eastDist = calculatePointToPointDistanceMeters(refPoint, eastPoint)

  assert.ok(
    Math.abs(northDist - 111.19) < 0.2,
    `North latitude delta distance should be ~111.19m, was ${northDist}`
  )
  assert.ok(
    Math.abs(eastDist - 105.14) < 0.2,
    `East longitude delta distance should be ~105.14m, was ${eastDist}`
  )

  // If coordinates were reversed [lng, lat], northDist would be 105.14 and eastDist would be 111.19
  assert.ok(
    northDist > eastDist,
    `1 degree latitude delta must be greater than 1 degree longitude delta at 19 deg latitude (northDist=${northDist}, eastDist=${eastDist})`
  )
})

test('Test SIMULATED_HAZARDS integration: actual project hazards evaluate with RoadRoute', () => {
  // RoadRoute simulating a journey across Navi Mumbai past Vashi (near sim-haz-01 at [19.0760, 72.9985])
  const testRoute: RoadRoute = {
    id: 'test-osrm-route-1',
    label: 'Route 1',
    coordinates: [
      [19.0700, 72.9985],
      [19.0758, 72.9985], // passing within ~22m of sim-haz-01
      [19.0800, 72.9985],
    ],
    distanceMeters: 1110,
    durationSeconds: 120,
    engineEstimateNotice: 'Test notice',
  }

  const summary = evaluateRouteHazardProximity(testRoute, SIMULATED_HAZARDS, {
    thresholdMeters: DEFAULT_PROXIMITY_THRESHOLD_METERS,
  })

  assert.equal(summary.thresholdMeters, 100)
  assert.equal(summary.evaluatedHazardCount, SIMULATED_HAZARDS.length)
  // sim-haz-01 is located at [19.0760, 72.9985], which is ~22.2m from [19.0758, 72.9985]
  const nearby = detectNearbyHazards(testRoute, SIMULATED_HAZARDS)
  assert.ok(nearby.length >= 1)
  assert.equal(nearby[0].hazardId, 'sim-haz-01')
  assert.equal(nearby[0].hazardName, 'Illustrative Waterlogging Point A')
  assert.equal(nearby[0].hazardType, 'waterlogging')
  assert.equal(nearby[0].severity, 'medium')
  assert.ok(nearby[0].distanceMeters <= 25)
  assert.equal(nearby[0].isNearby, true)
  assert.equal(nearby[0].hazard.isSimulated, true)
})
