import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_SEVERITY_BASE_WEIGHTS,
  calculateProximityMultiplier,
  calculateRouteRiskScore,
  getRiskCategory,
} from '../src/features/routing/routeRiskScoring.ts'
import {
  DEFAULT_PROXIMITY_THRESHOLD_METERS,
  evaluateRouteHazardProximity,
} from '../src/features/routing/hazardProximity.ts'
import { SIMULATED_HAZARDS } from '../src/features/map/hazardData.ts'
import type {
  HazardLocation,
  HazardProximityResult,
  HazardSeverity,
  RoadRoute,
  RouteHazardProximitySummary,
} from '../src/types/index.ts'

// Helper to construct test HazardProximityResult objects
function createTestProximityResult(
  hazardId: string,
  severity: HazardSeverity,
  distanceMeters: number,
  isNearby = true,
  hazardName = `Hazard ${hazardId}`
): HazardProximityResult {
  const hazard: HazardLocation = {
    id: hazardId,
    name: hazardName,
    area: 'Navi Mumbai Test Sector',
    coordinates: [19.0500, 73.0000],
    hazardType: 'waterlogging',
    severity,
    description: 'Simulated waterlogging test site',
    isSimulated: true,
  }

  return {
    hazardId,
    hazardName,
    hazardType: 'waterlogging',
    severity,
    distanceMeters,
    isNearby,
    hazard,
  }
}

// Helper to construct test RouteHazardProximitySummary
function createTestSummary(
  hazards: HazardProximityResult[],
  thresholdMeters = DEFAULT_PROXIMITY_THRESHOLD_METERS
): RouteHazardProximitySummary {
  return {
    thresholdMeters,
    evaluatedHazardCount: hazards.length,
    nearbyHazards: hazards.filter((h) => h.isNearby && h.distanceMeters <= thresholdMeters),
    allHazards: hazards,
  }
}

test('Test A — No nearby hazards: empty proximity summary returns score 0, designated category, no contributions', () => {
  const emptySummary = createTestSummary([])
  const result = calculateRouteRiskScore(emptySummary)

  assert.equal(result.score, 0)
  assert.equal(result.riskCategory, 'No nearby simulated hazards')
  assert.equal(result.includedHazardCount, 0)
  assert.equal(result.evaluatedHazardCount, 0)
  assert.equal(result.thresholdMeters, 100)
  assert.equal(result.contributions.length, 0)
  assert.ok(
    result.summaryExplanation.includes('No simulated hazards were detected'),
    'Explanation should state no simulated hazards detected'
  )
  assert.ok(
    !result.summaryExplanation.toLowerCase().includes('safe'),
    'Explanation should not state the route is safe'
  )

  // Null summary test
  const nullResult = calculateRouteRiskScore(null)
  assert.equal(nullResult.score, 0)
  assert.equal(nullResult.riskCategory, 'No nearby simulated hazards')
  assert.equal(nullResult.contributions.length, 0)

  // Undefined summary test
  const undefinedResult = calculateRouteRiskScore(undefined)
  assert.equal(undefinedResult.score, 0)
  assert.equal(undefinedResult.riskCategory, 'No nearby simulated hazards')
})

test('Test B — One low-severity hazard: verifies severity weight, distance multiplier, contribution, final score, and explanation', () => {
  // Low severity at 15m (within 25m band => multiplier 1.0)
  const lowHazard = createTestProximityResult('haz-low-1', 'low', 15.0, true, 'Vashi Low Point')
  const summary = createTestSummary([lowHazard])

  const result = calculateRouteRiskScore(summary)

  assert.equal(result.score, 10)
  assert.equal(result.riskCategory, 'Low')
  assert.equal(result.includedHazardCount, 1)
  assert.equal(result.evaluatedHazardCount, 1)
  assert.equal(result.contributions.length, 1)

  const c = result.contributions[0]
  assert.equal(c.hazardId, 'haz-low-1')
  assert.equal(c.hazardName, 'Vashi Low Point')
  assert.equal(c.severity, 'low')
  assert.equal(c.distanceMeters, 15.0)
  assert.equal(c.baseWeight, DEFAULT_SEVERITY_BASE_WEIGHTS.low)
  assert.equal(c.proximityMultiplier, 1.0)
  assert.equal(c.scoreContribution, 10)
  assert.ok(c.explanation.includes('Low severity (base weight 10) at 15m'))
  assert.ok(c.explanation.includes('within 25m band, multiplier 1'))
  assert.ok(c.explanation.includes('contributes 10 to risk score'))
})

test('Test C — Medium and high severity: verifies correct base weight mapping and contribution calculation', () => {
  // Medium severity at 20m (within 25m => mult 1.0 => contribution 20)
  const medHazard = createTestProximityResult('haz-med-1', 'medium', 20.0)
  const medSummary = createTestSummary([medHazard])
  const medResult = calculateRouteRiskScore(medSummary)

  assert.equal(medResult.score, 20)
  assert.equal(medResult.contributions[0].baseWeight, 20)
  assert.equal(medResult.contributions[0].proximityMultiplier, 1.0)
  assert.equal(medResult.contributions[0].scoreContribution, 20)
  assert.equal(medResult.riskCategory, 'Low')

  // High severity at 20m (within 25m => mult 1.0 => contribution 35)
  const highHazard = createTestProximityResult('haz-high-1', 'high', 20.0)
  const highSummary = createTestSummary([highHazard])
  const highResult = calculateRouteRiskScore(highSummary)

  assert.equal(highResult.score, 35)
  assert.equal(highResult.contributions[0].baseWeight, 35)
  assert.equal(highResult.contributions[0].proximityMultiplier, 1.0)
  assert.equal(highResult.contributions[0].scoreContribution, 35)
  assert.equal(highResult.riskCategory, 'Moderate')
})

test('Test D — Proximity bands: hazards within each band, including distances at 25m, 50m, and 100m', () => {
  // Band 1: <= 25m -> mult 1.0
  assert.equal(calculateProximityMultiplier(0, 100), 1.0)
  assert.equal(calculateProximityMultiplier(12.5, 100), 1.0)
  assert.equal(calculateProximityMultiplier(25.0, 100), 1.0)

  // Band 2: > 25m and <= 50m -> mult 0.75
  assert.equal(calculateProximityMultiplier(25.1, 100), 0.75)
  assert.equal(calculateProximityMultiplier(35.0, 100), 0.75)
  assert.equal(calculateProximityMultiplier(50.0, 100), 0.75)

  // Band 3: > 50m and <= 100m -> mult 0.5
  assert.equal(calculateProximityMultiplier(50.1, 100), 0.5)
  assert.equal(calculateProximityMultiplier(75.0, 100), 0.5)
  assert.equal(calculateProximityMultiplier(100.0, 100), 0.5)

  // Test contribution calculations for each band
  const at25 = createTestProximityResult('h25', 'medium', 25.0)
  const at50 = createTestProximityResult('h50', 'medium', 50.0)
  const at100 = createTestProximityResult('h100', 'medium', 100.0)

  const res25 = calculateRouteRiskScore(createTestSummary([at25]))
  assert.equal(res25.contributions[0].proximityMultiplier, 1.0)
  assert.equal(res25.contributions[0].scoreContribution, 20) // 20 * 1.0

  const res50 = calculateRouteRiskScore(createTestSummary([at50]))
  assert.equal(res50.contributions[0].proximityMultiplier, 0.75)
  assert.equal(res50.contributions[0].scoreContribution, 15) // 20 * 0.75

  const res100 = calculateRouteRiskScore(createTestSummary([at100]))
  assert.equal(res100.contributions[0].proximityMultiplier, 0.5)
  assert.equal(res100.contributions[0].scoreContribution, 10) // 20 * 0.5
})

test('Test E — Threshold boundary: inclusive boundary behavior at exact threshold', () => {
  const boundaryHazard = createTestProximityResult('h-boundary', 'high', 100.0, true)
  const summary = createTestSummary([boundaryHazard], 100)

  const result = calculateRouteRiskScore(summary)
  assert.equal(result.includedHazardCount, 1)
  assert.equal(result.contributions[0].hazardId, 'h-boundary')
  assert.equal(result.contributions[0].proximityMultiplier, 0.5)
  assert.equal(result.contributions[0].scoreContribution, 17.5) // 35 * 0.5
  assert.equal(result.score, 17.5)
})

test('Test F — Outside threshold: hazard beyond effective threshold does not contribute even with inconsistent isNearby flag', () => {
  // Distance is 120m (beyond 100m threshold), but isNearby is incorrectly true
  const inconsistentHazard = createTestProximityResult('h-inconsistent', 'high', 120.0, true)
  const summary = createTestSummary([inconsistentHazard], 100)

  const result = calculateRouteRiskScore(summary)
  assert.equal(result.includedHazardCount, 0)
  assert.equal(result.score, 0)
  assert.equal(result.riskCategory, 'No nearby simulated hazards')

  // Stale isNearby = false but distance is 30m (inside 100m threshold)
  const staleNearbyFalse = createTestProximityResult('h-stale', 'medium', 30.0, false)
  const summaryStale = createTestSummary([staleNearbyFalse], 100)
  const resultStale = calculateRouteRiskScore(summaryStale)

  assert.equal(resultStale.includedHazardCount, 1)
  assert.equal(resultStale.contributions[0].hazardId, 'h-stale')
  assert.equal(resultStale.contributions[0].scoreContribution, 15) // 20 * 0.75
})

test('Test G — Multiple hazards: aggregation, score clamping, contribution count, and nearest-first ordering', () => {
  const h1 = createTestProximityResult('h-far', 'low', 80.0) // 10 * 0.5 = 5
  const h2 = createTestProximityResult('h-mid', 'medium', 40.0) // 20 * 0.75 = 15
  const h3 = createTestProximityResult('h-near', 'high', 10.0) // 35 * 1.0 = 35

  // Passed in unsorted order: far, near, mid
  const summary = createTestSummary([h1, h3, h2], 100)
  const result = calculateRouteRiskScore(summary)

  assert.equal(result.evaluatedHazardCount, 3)
  assert.equal(result.includedHazardCount, 3)
  assert.equal(result.score, 55) // 35 + 15 + 5 = 55
  assert.equal(result.riskCategory, 'High')

  // Nearest-first verification
  assert.equal(result.contributions[0].hazardId, 'h-near')
  assert.equal(result.contributions[0].distanceMeters, 10.0)
  assert.equal(result.contributions[1].hazardId, 'h-mid')
  assert.equal(result.contributions[1].distanceMeters, 40.0)
  assert.equal(result.contributions[2].hazardId, 'h-far')
  assert.equal(result.contributions[2].distanceMeters, 80.0)
})

test('Test H — Category boundaries: scores 0, 1, 24, 25, 49, 50, 74, 75, and 100 map to expected categories', () => {
  assert.equal(getRiskCategory(0), 'No nearby simulated hazards')
  assert.equal(getRiskCategory(1), 'Low')
  assert.equal(getRiskCategory(24), 'Low')
  assert.equal(getRiskCategory(24.9), 'Low')
  assert.equal(getRiskCategory(25), 'Moderate')
  assert.equal(getRiskCategory(49), 'Moderate')
  assert.equal(getRiskCategory(49.9), 'Moderate')
  assert.equal(getRiskCategory(50), 'High')
  assert.equal(getRiskCategory(74), 'High')
  assert.equal(getRiskCategory(74.9), 'High')
  assert.equal(getRiskCategory(75), 'Very High')
  assert.equal(getRiskCategory(100), 'Very High')
})

test('Test I — Score cap: aggregate contributions cannot produce a score above 100', () => {
  // 4 high-severity hazards at 10m: 4 * 35 = 140
  const h1 = createTestProximityResult('h1', 'high', 10.0)
  const h2 = createTestProximityResult('h2', 'high', 15.0)
  const h3 = createTestProximityResult('h3', 'high', 20.0)
  const h4 = createTestProximityResult('h4', 'high', 22.0)

  const summary = createTestSummary([h1, h2, h3, h4])
  const result = calculateRouteRiskScore(summary)

  assert.equal(result.includedHazardCount, 4)
  assert.equal(result.score, 100, 'Score must be clamped to 100')
  assert.equal(result.riskCategory, 'Very High')
})

test('Test J — Determinism: repeated calls with identical input return equivalent results', () => {
  const h1 = createTestProximityResult('h1', 'medium', 30.0)
  const h2 = createTestProximityResult('h2', 'high', 60.0)
  const summary = createTestSummary([h1, h2])

  const run1 = calculateRouteRiskScore(summary)
  const run2 = calculateRouteRiskScore(summary)

  assert.deepEqual(run1, run2)
})

test('Test K — Invalid threshold: negative and non-finite thresholds are rejected with RangeError', () => {
  const h1 = createTestProximityResult('h1', 'low', 10.0)
  const summary = createTestSummary([h1])

  assert.throws(
    () => calculateRouteRiskScore(summary, { thresholdMeters: -10 }),
    RangeError
  )
  assert.throws(
    () => calculateRouteRiskScore(summary, { thresholdMeters: NaN }),
    RangeError
  )
  assert.throws(
    () => calculateRouteRiskScore(summary, { thresholdMeters: Infinity }),
    RangeError
  )
})

test('Test L — Invalid distances: negative and non-finite hazard distances excluded from score', () => {
  const nanDistHazard = createTestProximityResult('h-nan', 'high', NaN)
  const infDistHazard = createTestProximityResult('h-inf', 'high', Infinity)
  const negDistHazard = createTestProximityResult('h-neg', 'high', -15.0)
  const validHazard = createTestProximityResult('h-valid', 'low', 10.0)

  const summary = createTestSummary([nanDistHazard, infDistHazard, negDistHazard, validHazard])
  const result = calculateRouteRiskScore(summary)

  // Only the valid hazard contributes; malformed distances are excluded
  assert.equal(result.includedHazardCount, 1)
  assert.equal(result.contributions[0].hazardId, 'h-valid')
  assert.equal(result.score, 10)
})

test('Test M — Invalid severity: unknown severity values handled according to documented validation policy', () => {
  const badSeverityHazard = createTestProximityResult(
    'h-bad-sev',
    'extreme' as unknown as HazardSeverity,
    10.0
  )
  const validHazard = createTestProximityResult('h-valid', 'medium', 10.0)

  const summary = createTestSummary([badSeverityHazard, validHazard])
  const result = calculateRouteRiskScore(summary)

  assert.equal(result.includedHazardCount, 1)
  assert.equal(result.contributions[0].hazardId, 'h-valid')
  assert.equal(result.score, 20)
})

test('Test N — Input immutability: scoring engine does not mutate input summary or hazard objects', () => {
  const h1 = createTestProximityResult('h1', 'medium', 20.0)
  const h2 = createTestProximityResult('h2', 'high', 40.0)
  const summary = createTestSummary([h1, h2])

  // Deeply freeze objects to guarantee no mutation occurs
  Object.freeze(h1.hazard)
  Object.freeze(h1)
  Object.freeze(h2.hazard)
  Object.freeze(h2)
  Object.freeze(summary.nearbyHazards)
  Object.freeze(summary.allHazards)
  Object.freeze(summary)

  assert.doesNotThrow(() => {
    const result = calculateRouteRiskScore(summary)
    assert.equal(result.score, 46.25) // 20 * 1.0 + 35 * 0.75 = 20 + 26.25 = 46.25
  })
})

test('Test O — Existing integration: SIMULATED_HAZARDS and Feature 4.1 proximity output evaluate together', () => {
  // RoadRoute passing through Vashi near sim-haz-01 at [19.0760, 72.9985]
  const testRoute: RoadRoute = {
    id: 'route-test-vashi',
    label: 'Vashi Route',
    coordinates: [
      [19.0700, 72.9985],
      [19.0758, 72.9985], // ~22.2m from sim-haz-01 (medium severity)
      [19.0800, 72.9985],
    ],
    distanceMeters: 1110,
    durationSeconds: 120,
    engineEstimateNotice: 'Test notice',
  }

  // 1. Feature 4.1 proximity detection
  const proximitySummary = evaluateRouteHazardProximity(testRoute, SIMULATED_HAZARDS, {
    thresholdMeters: DEFAULT_PROXIMITY_THRESHOLD_METERS,
  })

  // 2. Feature 4.2 risk scoring
  const riskResult = calculateRouteRiskScore(proximitySummary)

  assert.equal(riskResult.thresholdMeters, 100)
  assert.equal(riskResult.evaluatedHazardCount, SIMULATED_HAZARDS.length)
  assert.ok(riskResult.includedHazardCount >= 1)

  // Verify sim-haz-01 is included and scored
  const sim1Contrib = riskResult.contributions.find((c) => c.hazardId === 'sim-haz-01')
  assert.ok(sim1Contrib, 'sim-haz-01 should be in contributions')
  assert.equal(sim1Contrib.severity, 'medium')
  assert.equal(sim1Contrib.baseWeight, 20)
  assert.equal(sim1Contrib.proximityMultiplier, 1.0)
  assert.equal(sim1Contrib.scoreContribution, 20)
  assert.ok(riskResult.score >= 20)
  assert.ok(riskResult.riskCategory === 'Low' || riskResult.riskCategory === 'Moderate')
})

test('Test P — Direct HazardProximityResult array input: calculateRouteRiskScore accepts array without wrapping in summary', () => {
  const h1 = createTestProximityResult('h-arr-1', 'high', 10.0)
  const h2 = createTestProximityResult('h-arr-2', 'low', 80.0)
  const result = calculateRouteRiskScore([h1, h2])

  assert.equal(result.score, 40) // 35 * 1.0 + 10 * 0.5 = 35 + 5 = 40
  assert.equal(result.includedHazardCount, 2)
  assert.equal(result.riskCategory, 'Moderate')
  assert.equal(result.thresholdMeters, DEFAULT_PROXIMITY_THRESHOLD_METERS)
})

test('Test Q — getRiskCategory: negative, NaN, and Infinity scores map to no-hazard category', () => {
  assert.equal(getRiskCategory(-1), 'No nearby simulated hazards')
  assert.equal(getRiskCategory(-100), 'No nearby simulated hazards')
  assert.equal(getRiskCategory(NaN), 'No nearby simulated hazards')
  assert.equal(getRiskCategory(Infinity), 'No nearby simulated hazards')
  assert.equal(getRiskCategory(-Infinity), 'No nearby simulated hazards')
})

test('Test R — calculateProximityMultiplier: zero threshold only qualifies hazard at 0m', () => {
  // At threshold=0: only distance=0 is within band 1 (<=25m), others excluded
  assert.equal(calculateProximityMultiplier(0, 0), 1.0)
  // distance=0.1 > threshold+1e-6=0+1e-6, so excluded
  assert.equal(calculateProximityMultiplier(0.1, 0), 0)
  assert.equal(calculateProximityMultiplier(1, 0), 0)
})
