import test from 'node:test'
import assert from 'node:assert/strict'
import type { HazardLocation, RoadRoute } from '../src/types/index.ts'
import {
  assessRouteRisk,
  assessRoutesRisk,
} from '../src/features/routing/routeRiskAssessment.ts'
import { SIMULATED_HAZARDS } from '../src/features/map/hazardData.ts'

const MOCK_HAZARD_A: HazardLocation = {
  id: 'mock-haz-1',
  name: 'Mock High Flood Point',
  area: 'Belapur Area',
  coordinates: [19.0180, 73.0420],
  hazardType: 'submerged_road',
  severity: 'high',
  description: 'Simulated high flood point for test.',
  isSimulated: true,
}

const MOCK_HAZARD_B: HazardLocation = {
  id: 'mock-haz-2',
  name: 'Mock Low Hazard',
  area: 'Vashi Area',
  coordinates: [19.0760, 72.9985],
  hazardType: 'waterlogging',
  severity: 'low',
  description: 'Simulated low waterlogging for test.',
  isSimulated: true,
}

test('assessRouteRisk associates risk results with the correct route', () => {
  const route: RoadRoute = {
    id: 'route-test-1',
    label: 'Primary Route',
    coordinates: [
      [19.0179, 73.0419],
      [19.0181, 73.0421],
    ],
    distanceMeters: 500,
    durationSeconds: 60,
    engineEstimateNotice: 'OSRM Demo',
  }

  const assessment = assessRouteRisk(route, [MOCK_HAZARD_A])
  assert.equal(assessment.routeId, 'route-test-1')
  assert.equal(assessment.status, 'success')
  assert.ok(assessment.result)
  assert.equal(assessment.result.includedHazardCount, 1)
  assert.equal(assessment.result.contributions[0].hazardId, 'mock-haz-1')
  assert.ok(assessment.result.score > 0)
})

test('assessRoutesRisk provides independent assessments for multiple routes', () => {
  // Route 1 passes directly through Hazard A (CBD Belapur)
  const route1: RoadRoute = {
    id: 'route-near-hazard',
    label: 'Hazardous Route',
    coordinates: [
      [19.0180, 73.0419],
      [19.0180, 73.0421],
    ],
    distanceMeters: 500,
    durationSeconds: 60,
    engineEstimateNotice: 'OSRM Demo',
  }

  // Route 2 is far away from both hazards
  const route2: RoadRoute = {
    id: 'route-far-away',
    label: 'Clear Route',
    coordinates: [
      [19.2000, 73.1000],
      [19.2010, 73.1010],
    ],
    distanceMeters: 600,
    durationSeconds: 70,
    engineEstimateNotice: 'OSRM Demo',
  }

  const assessments = assessRoutesRisk([route1, route2], [MOCK_HAZARD_A, MOCK_HAZARD_B])

  assert.ok(assessments['route-near-hazard'])
  assert.ok(assessments['route-far-away'])

  // Route 1 should detect Hazard A
  assert.equal(assessments['route-near-hazard'].status, 'success')
  assert.ok((assessments['route-near-hazard'].result?.score ?? 0) > 0)
  assert.equal(assessments['route-near-hazard'].result?.includedHazardCount, 1)

  // Route 2 should have 0 nearby hazards
  assert.equal(assessments['route-far-away'].status, 'success')
  assert.equal(assessments['route-far-away'].result?.score, 0)
  assert.equal(
    assessments['route-far-away'].result?.riskCategory,
    'No nearby simulated hazards'
  )
  assert.equal(assessments['route-far-away'].result?.includedHazardCount, 0)
})

test('assessRouteRisk isolates scoring failure to its route', () => {
  // Invalid route with empty coordinates
  const badRoute: RoadRoute = {
    id: 'bad-route',
    coordinates: [],
    distanceMeters: 0,
    durationSeconds: 0,
    engineEstimateNotice: 'OSRM Demo',
  }

  const assessment = assessRouteRisk(badRoute, [MOCK_HAZARD_A])
  assert.equal(assessment.routeId, 'bad-route')
  assert.equal(assessment.status, 'error')
  assert.ok(assessment.error?.includes('unavailable'))
  assert.equal(assessment.result, undefined)
})

test('assessRoutesRisk safely handles mixed valid and invalid routes', () => {
  const badRoute: RoadRoute = {
    id: 'bad-route',
    coordinates: [],
    distanceMeters: 0,
    durationSeconds: 0,
    engineEstimateNotice: 'OSRM Demo',
  }

  const goodRoute: RoadRoute = {
    id: 'good-route',
    coordinates: [
      [19.0180, 73.0419],
      [19.0180, 73.0421],
    ],
    distanceMeters: 500,
    durationSeconds: 60,
    engineEstimateNotice: 'OSRM Demo',
  }

  const assessments = assessRoutesRisk([badRoute, goodRoute], [MOCK_HAZARD_A])
  assert.equal(assessments['bad-route'].status, 'error')
  assert.equal(assessments['good-route'].status, 'success')
  assert.ok((assessments['good-route'].result?.score ?? 0) > 0)
})

test('empty contribution lists render correct no-nearby-hazards state', () => {
  const route: RoadRoute = {
    id: 'isolated-route',
    coordinates: [
      [18.9000, 72.8000],
      [18.9050, 72.8050],
    ],
    distanceMeters: 1000,
    durationSeconds: 120,
    engineEstimateNotice: 'OSRM Demo',
  }

  const assessment = assessRouteRisk(route, SIMULATED_HAZARDS)
  assert.equal(assessment.status, 'success')
  assert.equal(assessment.result?.score, 0)
  assert.equal(assessment.result?.riskCategory, 'No nearby simulated hazards')
  assert.equal(assessment.result?.includedHazardCount, 0)
  assert.equal(assessment.result?.contributions.length, 0)
  assert.ok(assessment.result?.summaryExplanation.includes('No simulated hazards'))
})

test('handles empty routes array gracefully', () => {
  const assessments = assessRoutesRisk([], SIMULATED_HAZARDS)
  assert.deepEqual(assessments, {})
})
