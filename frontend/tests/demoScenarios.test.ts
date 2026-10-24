import test from 'node:test'
import assert from 'node:assert/strict'
import type { RoadRoute } from '../src/types/index.ts'
import { SIMULATED_HAZARDS } from '../src/features/map/hazardData.ts'
import {
  DEMO_SCENARIOS,
  DEFAULT_SCENARIO_ID,
  getDemoScenario,
  getAllDemoScenarios,
  SYNTHETIC_SCENARIO_NOTICE,
  ALL_CLEAR_EXPLANATION,
  SIMULATED_HIGHWAY_FLOOD_HAZARD,
  SIMULATED_WEST_BYPASS_CORRIDOR_HAZARD,
} from '../src/features/scenarios/scenarios.ts'
import { assessRouteRisk, assessRoutesRisk } from '../src/features/routing/routeRiskAssessment.ts'

// Deterministic test fixtures: Vashi – Belapur alternative routes
const FIXTURE_VASHI_BELAPUR_HIGHWAY: RoadRoute = {
  id: 'fixture-route-highway',
  label: 'via Sion-Panvel Hwy',
  distanceMeters: 9700,
  durationSeconds: 720,
  engineEstimateNotice: 'OSRM prototype route estimate',
  coordinates: [
    [19.0763, 72.9984], // Vashi
    [19.0597, 73.0193], // Highway section (matches SIMULATED_HIGHWAY_FLOOD_HAZARD)
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
    [19.0410, 73.0135], // Palm Beach Rd waypoint (~1.48km from highway hazard)
    [19.0182, 73.0425], // Belapur
  ],
}

// Deterministic test fixtures: Airoli – Vashi alternative routes
const FIXTURE_AIROLI_VASHI_THANE_BELAPUR: RoadRoute = {
  id: 'fixture-route-thane-belapur',
  label: 'via Thane-Belapur Rd',
  distanceMeters: 11200,
  durationSeconds: 910,
  engineEstimateNotice: 'OSRM prototype route estimate',
  coordinates: [
    [19.1550, 72.9950], // Airoli
    [19.0922, 73.0176], // Thane-Belapur Road (matches SIMULATED_WEST_BYPASS_CORRIDOR_HAZARD)
    [19.0763, 72.9984], // Vashi
  ],
}

const FIXTURE_AIROLI_VASHI_WEST_BYPASS: RoadRoute = {
  id: 'fixture-route-west-bypass',
  label: 'via West Bypass',
  distanceMeters: 11500,
  durationSeconds: 960,
  corridorName: 'Airoli – Vashi Trans-Harbour Corridor',
  isCorridorAlternative: true,
  engineEstimateNotice: 'OSRM prototype route estimate',
  coordinates: [
    [19.1550, 72.9950], // Airoli
    [19.1025, 73.0035], // West Bypass waypoint (~1.26km from Thane-Belapur hazard)
    [19.0763, 72.9984], // Vashi
  ],
}

// ---------------------------------------------------------------------------
// 1. Baseline selects the existing baseline hazard data unchanged
// ---------------------------------------------------------------------------
test('Baseline scenario selects the existing baseline hazard data unchanged', () => {
  assert.equal(DEFAULT_SCENARIO_ID, 'baseline')

  const baseline = getDemoScenario('baseline')
  assert.equal(baseline.id, 'baseline')
  assert.equal(baseline.shortLabel, 'Baseline')
  assert.equal(baseline.isSynthetic, false)
  assert.equal(baseline.notice, undefined, 'Baseline must not display synthetic demo notice')

  // Hazards must match the 5 SIMULATED_HAZARDS exactly
  assert.equal(baseline.hazards.length, SIMULATED_HAZARDS.length)
  assert.equal(baseline.hazards.length, 5)
  assert.deepEqual(baseline.hazards, SIMULATED_HAZARDS)

  // Verify baseline hazard coordinates were not altered
  assert.deepEqual(baseline.hazards[0].coordinates, [19.0760, 72.9985])
  assert.deepEqual(baseline.hazards[1].coordinates, [19.1550, 72.9990])
  assert.deepEqual(baseline.hazards[2].coordinates, [19.0620, 73.0180])
  assert.deepEqual(baseline.hazards[3].coordinates, [19.0320, 73.0180])
  assert.deepEqual(baseline.hazards[4].coordinates, [19.0180, 73.0420])
})

// ---------------------------------------------------------------------------
// 2. Each demo scenario returns the intended synthetic hazard configuration
// ---------------------------------------------------------------------------
test('Each demo scenario returns the intended synthetic hazard configuration', () => {
  const allScenarios = getAllDemoScenarios()
  assert.equal(allScenarios.length, 4)

  const scenarioIds = allScenarios.map((s) => s.id)
  assert.deepEqual(scenarioIds, ['baseline', 'flood-highway', 'flood-west-bypass', 'all-clear'])

  // Flood on Highway scenario
  const hwyScenario = getDemoScenario('flood-highway')
  assert.equal(hwyScenario.id, 'flood-highway')
  assert.equal(hwyScenario.shortLabel, 'Flood on Highway')
  assert.equal(hwyScenario.isSynthetic, true)
  assert.equal(hwyScenario.hazards.length, 1)

  const hwyHaz = hwyScenario.hazards[0]
  assert.equal(hwyHaz.id, 'sim-scenario-hwy-flood')
  assert.equal(hwyHaz.severity, 'high')
  assert.equal(hwyHaz.isSimulated, true)
  assert.deepEqual(hwyHaz.coordinates, [19.0597, 73.0193])
  assert.deepEqual(hwyHaz, SIMULATED_HIGHWAY_FLOOD_HAZARD)

  // Flood on West Bypass scenario
  const wbScenario = getDemoScenario('flood-west-bypass')
  assert.equal(wbScenario.id, 'flood-west-bypass')
  assert.equal(wbScenario.shortLabel, 'Flood on West Bypass')
  assert.equal(wbScenario.isSynthetic, true)
  assert.equal(wbScenario.hazards.length, 1)

  const wbHaz = wbScenario.hazards[0]
  assert.equal(wbHaz.id, 'sim-scenario-tb-flood')
  assert.equal(wbHaz.severity, 'high')
  assert.equal(wbHaz.isSimulated, true)
  assert.deepEqual(wbHaz.coordinates, [19.0922, 73.0176])
  assert.deepEqual(wbHaz, SIMULATED_WEST_BYPASS_CORRIDOR_HAZARD)

  // All Clear scenario
  const allClearScenario = getDemoScenario('all-clear')
  assert.equal(allClearScenario.id, 'all-clear')
  assert.equal(allClearScenario.shortLabel, 'All Clear')
  assert.equal(allClearScenario.isSynthetic, true)
  assert.equal(allClearScenario.hazards.length, 0)
  assert.deepEqual(allClearScenario.hazards, [])
})

// ---------------------------------------------------------------------------
// 3. All Clear returns empty hazard list and zero nearby-simulated-hazard result
// ---------------------------------------------------------------------------
test('All Clear returns empty hazard list and zero nearby-simulated-hazard result for valid test routes', () => {
  const allClear = getDemoScenario('all-clear')
  assert.equal(allClear.hazards.length, 0)

  const assessments = assessRoutesRisk(
    [FIXTURE_VASHI_BELAPUR_HIGHWAY, FIXTURE_VASHI_BELAPUR_PALM_BEACH],
    allClear.hazards
  )

  const hwyAssessment = assessments['fixture-route-highway']
  const pbAssessment = assessments['fixture-route-palm-beach']

  assert.ok(hwyAssessment)
  assert.equal(hwyAssessment.status, 'success')
  assert.ok(hwyAssessment.result)
  assert.equal(hwyAssessment.result.score, 0)
  assert.equal(hwyAssessment.result.riskCategory, 'No nearby simulated hazards')
  assert.equal(hwyAssessment.result.includedHazardCount, 0)
  assert.equal(hwyAssessment.result.contributions.length, 0)

  assert.ok(pbAssessment)
  assert.equal(pbAssessment.status, 'success')
  assert.ok(pbAssessment.result)
  assert.equal(pbAssessment.result.score, 0)
  assert.equal(pbAssessment.result.riskCategory, 'No nearby simulated hazards')
  assert.equal(pbAssessment.result.includedHazardCount, 0)
  assert.equal(pbAssessment.result.contributions.length, 0)
})

// ---------------------------------------------------------------------------
// 4. Deterministic pair of alternative routes produces different scores
// ---------------------------------------------------------------------------
test('Deterministic alternative routes produce different scores in Flood on Highway scenario', () => {
  const scenario = getDemoScenario('flood-highway')

  const assessments = assessRoutesRisk(
    [FIXTURE_VASHI_BELAPUR_HIGHWAY, FIXTURE_VASHI_BELAPUR_PALM_BEACH],
    scenario.hazards
  )

  const hwyResult = assessments['fixture-route-highway']?.result
  const pbResult = assessments['fixture-route-palm-beach']?.result

  assert.ok(hwyResult, 'Highway route result must exist')
  assert.ok(pbResult, 'Palm Beach route result must exist')

  // Highway intersects simulated hazard: distance 0m -> multiplier 1.0 * high (35) = 35
  assert.equal(hwyResult.score, 35)
  assert.equal(hwyResult.riskCategory, 'Moderate')
  assert.equal(hwyResult.includedHazardCount, 1)
  assert.equal(hwyResult.contributions[0].hazardId, 'sim-scenario-hwy-flood')

  // Palm Beach is ~1.48km away from hazard (> 100m threshold): score = 0
  assert.equal(pbResult.score, 0)
  assert.equal(pbResult.riskCategory, 'No nearby simulated hazards')
  assert.equal(pbResult.includedHazardCount, 0)

  // Explicit divergence check
  assert.notEqual(hwyResult.score, pbResult.score, 'Alternative routes must produce differential scores')
  assert.ok(hwyResult.score > pbResult.score, 'Highway route must have higher simulated risk than Palm Beach')
})

test('Deterministic alternative routes produce different scores in Flood on West Bypass scenario', () => {
  const scenario = getDemoScenario('flood-west-bypass')

  const assessments = assessRoutesRisk(
    [FIXTURE_AIROLI_VASHI_THANE_BELAPUR, FIXTURE_AIROLI_VASHI_WEST_BYPASS],
    scenario.hazards
  )

  const tbResult = assessments['fixture-route-thane-belapur']?.result
  const wbResult = assessments['fixture-route-west-bypass']?.result

  assert.ok(tbResult, 'Thane-Belapur route result must exist')
  assert.ok(wbResult, 'West Bypass route result must exist')

  // Thane-Belapur intersects simulated hazard: distance 0m -> multiplier 1.0 * high (35) = 35
  assert.equal(tbResult.score, 35)
  assert.equal(tbResult.riskCategory, 'Moderate')
  assert.equal(tbResult.includedHazardCount, 1)
  assert.equal(tbResult.contributions[0].hazardId, 'sim-scenario-tb-flood')

  // West Bypass is ~1.26km away (> 100m threshold): score = 0
  assert.equal(wbResult.score, 0)
  assert.equal(wbResult.riskCategory, 'No nearby simulated hazards')
  assert.equal(wbResult.includedHazardCount, 0)

  // Explicit divergence check
  assert.notEqual(tbResult.score, wbResult.score, 'Alternative routes must produce differential scores')
  assert.ok(tbResult.score > wbResult.score, 'Thane-Belapur route must have higher simulated risk than West Bypass')
})

// ---------------------------------------------------------------------------
// 5. Scenario selector changes the hazard data used for risk assessment
// ---------------------------------------------------------------------------
test('Switching scenarios changes hazard data used for risk assessment without mutating route', () => {
  const testRoute: RoadRoute = {
    ...FIXTURE_VASHI_BELAPUR_HIGHWAY,
  }

  // Assess under Baseline
  const baselineAssessment = assessRouteRisk(testRoute, getDemoScenario('baseline').hazards)
  assert.equal(baselineAssessment.status, 'success')

  // Assess under Flood on Highway
  const hwyAssessment = assessRouteRisk(testRoute, getDemoScenario('flood-highway').hazards)
  assert.equal(hwyAssessment.status, 'success')
  assert.equal(hwyAssessment.result?.score, 35)
  assert.equal(hwyAssessment.result?.includedHazardCount, 1)

  // Assess under All Clear
  const allClearAssessment = assessRouteRisk(testRoute, getDemoScenario('all-clear').hazards)
  assert.equal(allClearAssessment.status, 'success')
  assert.equal(allClearAssessment.result?.score, 0)
  assert.equal(allClearAssessment.result?.includedHazardCount, 0)

  // Switching scenario updated risk assessment while route coordinates remain untouched
  assert.equal(testRoute.coordinates.length, 3)
  assert.deepEqual(testRoute.coordinates[1], [19.0597, 73.0193])
})

// ---------------------------------------------------------------------------
// 6. Active scenario warning notice displayed and removed appropriately
// ---------------------------------------------------------------------------
test('Active scenario warning notice is present for non-baseline and absent for baseline', () => {
  // Baseline: no warning notice
  const baseline = getDemoScenario('baseline')
  assert.equal(baseline.notice, undefined)

  // Flood on Highway: warning active with synthetic notice
  const floodHwy = getDemoScenario('flood-highway')
  assert.ok(floodHwy.notice)
  assert.ok(floodHwy.notice.includes(SYNTHETIC_SCENARIO_NOTICE))
  assert.ok(floodHwy.notice.includes('Sion-Panvel Highway'))

  // Flood on West Bypass: warning active with synthetic notice
  const floodWb = getDemoScenario('flood-west-bypass')
  assert.ok(floodWb.notice)
  assert.ok(floodWb.notice.includes(SYNTHETIC_SCENARIO_NOTICE))
  assert.ok(floodWb.notice.includes('Thane-Belapur Road'))

  // All Clear: warning active and explicitly states absence of hazards does not prove safety
  const allClear = getDemoScenario('all-clear')
  assert.ok(allClear.notice)
  assert.ok(allClear.notice.includes(SYNTHETIC_SCENARIO_NOTICE))
  assert.ok(allClear.notice.includes(ALL_CLEAR_EXPLANATION))
  assert.ok(allClear.notice.includes('does NOT represent verified road safety'))
})

// ---------------------------------------------------------------------------
// 7. Invalid or empty route geometry continues to be handled safely
// ---------------------------------------------------------------------------
test('Invalid or empty route geometry continues to return safe error assessment across scenarios', () => {
  const emptyRoute: RoadRoute = {
    id: 'empty-route',
    distanceMeters: 0,
    durationSeconds: 0,
    engineEstimateNotice: 'Test notice',
    coordinates: [],
  }

  const hwyHazards = getDemoScenario('flood-highway').hazards

  const emptyAssessment = assessRouteRisk(emptyRoute, hwyHazards)
  assert.equal(emptyAssessment.routeId, 'empty-route')
  assert.equal(emptyAssessment.status, 'error')
  assert.match(emptyAssessment.error ?? '', /missing or empty route coordinates/)

  const nullAssessment = assessRouteRisk(null, hwyHazards)
  assert.equal(nullAssessment.status, 'error')

  const undefinedAssessment = assessRouteRisk(undefined, hwyHazards)
  assert.equal(undefinedAssessment.status, 'error')
})
