import type {
  HazardLocation,
  RoadRoute,
  RouteRiskAssessment,
  RouteRiskScoringOptions,
} from '../../types'
import { evaluateRouteHazardProximity } from './hazardProximity.ts'
import { calculateRouteRiskScore } from './routeRiskScoring.ts'

/**
 * Assesses prototype monsoon risk for a single road route against a collection of hazards.
 *
 * Algorithm:
 * - Runs proximity detection using route geometry and hazard coordinates.
 * - Passes proximity results to the explainable risk scoring engine.
 * - Isolates calculation errors safely so failures do not crash the UI.
 */
// ponytail: pure integration helper chaining proximity -> scoring; isolates errors per route
export function assessRouteRisk(
  route: RoadRoute | null | undefined,
  hazards: HazardLocation[] | null | undefined,
  options?: RouteRiskScoringOptions
): RouteRiskAssessment {
  const routeId = route?.id ?? 'unknown'

  if (!route || !Array.isArray(route.coordinates) || route.coordinates.length === 0) {
    return {
      routeId,
      status: 'error',
      error: 'Risk assessment unavailable: missing or empty route coordinates.',
    }
  }

  try {
    const proximity = evaluateRouteHazardProximity(route, hazards, {
      thresholdMeters: options?.thresholdMeters,
    })
    const result = calculateRouteRiskScore(proximity, options)

    return {
      routeId,
      status: 'success',
      result,
    }
  } catch (err: unknown) {
    return {
      routeId,
      status: 'error',
      error: err instanceof Error ? err.message : 'Risk assessment unavailable.',
    }
  }
}

/**
 * Assesses prototype risk for multiple road routes against a collection of hazards.
 * Returns a dictionary mapping route ID to its RouteRiskAssessment.
 */
export function assessRoutesRisk(
  routes: RoadRoute[] | null | undefined,
  hazards: HazardLocation[] | null | undefined,
  options?: RouteRiskScoringOptions
): Record<string, RouteRiskAssessment> {
  const assessments: Record<string, RouteRiskAssessment> = {}

  if (!Array.isArray(routes) || routes.length === 0) {
    return assessments
  }

  for (const route of routes) {
    if (route && typeof route.id === 'string') {
      assessments[route.id] = assessRouteRisk(route, hazards, options)
    }
  }

  return assessments
}
