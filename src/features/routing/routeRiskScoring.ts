import type {
  HazardProximityResult,
  HazardRiskContribution,
  HazardSeverity,
  RouteHazardProximitySummary,
  RouteRiskCategory,
  RouteRiskScoreResult,
  RouteRiskScoringOptions,
} from '../../types'

/**
 * Default proximity threshold in meters.
 */
export const DEFAULT_PROXIMITY_THRESHOLD_METERS = 100

/**
 * Illustrative prototype severity weights.
 * Low: 10, Medium: 20, High: 35.
 */
export const DEFAULT_SEVERITY_BASE_WEIGHTS: Record<HazardSeverity, number> = {
  low: 10,
  medium: 20,
  high: 35,
}

/**
 * Returns proximity multiplier based on distance to route and effective threshold.
 *
 * Bands:
 * - Within 25 meters: 1.0
 * - Greater than 25m up to 50m: 0.75
 * - Greater than 50m up to configured threshold: 0.5
 * - Beyond threshold or invalid/negative distance: 0 (excluded)
 */
// ponytail: simple stepped multiplier bands; avoid arbitrary continuous polynomials
export function calculateProximityMultiplier(
  distanceMeters: number,
  thresholdMeters: number
): number {
  if (
    typeof distanceMeters !== 'number' ||
    !Number.isFinite(distanceMeters) ||
    distanceMeters < 0
  ) {
    return 0
  }

  // Tolerance of 1e-6 accounts for floating-point imprecision at threshold boundary
  if (distanceMeters > thresholdMeters + 1e-6) {
    return 0
  }

  if (distanceMeters <= 25 + 1e-6) {
    return 1.0
  }

  if (distanceMeters <= 50 + 1e-6) {
    return 0.75
  }

  return 0.5
}

/**
 * Maps a bounded score [0, 100] to explicit, non-overlapping risk categories.
 *
 * Boundaries:
 * - 0: 'No nearby simulated hazards'
 * - 1 to 24 (score < 25): 'Low'
 * - 25 to 49 (score < 50): 'Moderate'
 * - 50 to 74 (score < 75): 'High'
 * - 75 to 100: 'Very High'
 */
export function getRiskCategory(score: number): RouteRiskCategory {
  if (typeof score !== 'number' || !Number.isFinite(score) || score <= 0) {
    return 'No nearby simulated hazards'
  }
  if (score < 25) {
    return 'Low'
  }
  if (score < 50) {
    return 'Moderate'
  }
  if (score < 75) {
    return 'High'
  }
  return 'Very High'
}

/**
 * Helper to build band description string for explanation.
 */
function getBandDescription(distanceMeters: number, thresholdMeters: number): string {
  if (distanceMeters <= 25 + 1e-6) {
    return 'within 25m band'
  }
  if (distanceMeters <= 50 + 1e-6) {
    return '25m–50m band'
  }
  return `50m–${thresholdMeters}m band`
}

/**
 * Calculates a pure, deterministic, explainable risk score for a route
 * based on evaluated hazard proximity results.
 *
 * Scoring Model:
 * - Each qualifying hazard within effective threshold contributes:
 *   scoreContribution = baseWeight * proximityMultiplier
 * - Contributions are summed and clamped to [0, 100].
 * - If no hazards are within threshold, returns score 0 and
 *   'No nearby simulated hazards' category.
 *
 * Input Validation Policy:
 * - Negative or non-finite threshold: throws RangeError.
 * - Negative or non-finite severity weights: throws RangeError.
 * - Malformed individual hazard entries (negative/NaN distance, unknown severity):
 *   safely excluded from contribution list so they cannot generate misleading scores.
 * - Null/undefined summary: safely returns score 0 result.
 * - Duplicated hazard entries (same hazardId): deduplicated to the minimum distance entry.
 * - Does not mutate input objects.
 */
export function calculateRouteRiskScore(
  summaryOrHazards:
    | RouteHazardProximitySummary
    | HazardProximityResult[]
    | null
    | undefined,
  options?: RouteRiskScoringOptions
): RouteRiskScoreResult {
  // Determine effective threshold
  let summaryThreshold: number | undefined
  let evaluatedCount = 0
  let rawCandidates: HazardProximityResult[] = []

  if (summaryOrHazards) {
    if (Array.isArray(summaryOrHazards)) {
      rawCandidates = summaryOrHazards
      evaluatedCount = summaryOrHazards.length
    } else {
      summaryThreshold = summaryOrHazards.thresholdMeters
      evaluatedCount = summaryOrHazards.evaluatedHazardCount ?? 0
      // Prefer allHazards if available to re-evaluate against potential custom threshold,
      // fallback to nearbyHazards
      if (Array.isArray(summaryOrHazards.allHazards) && summaryOrHazards.allHazards.length > 0) {
        rawCandidates = summaryOrHazards.allHazards
        if (evaluatedCount === 0) {
          evaluatedCount = rawCandidates.length
        }
      } else if (Array.isArray(summaryOrHazards.nearbyHazards)) {
        rawCandidates = summaryOrHazards.nearbyHazards
        if (evaluatedCount === 0) {
          evaluatedCount = rawCandidates.length
        }
      }
    }
  }

  const effectiveThreshold =
    options?.thresholdMeters ?? summaryThreshold ?? DEFAULT_PROXIMITY_THRESHOLD_METERS

  if (
    typeof effectiveThreshold !== 'number' ||
    !Number.isFinite(effectiveThreshold) ||
    effectiveThreshold < 0
  ) {
    throw new RangeError(
      `Proximity threshold must be a non-negative finite number of meters. Received: ${String(
        effectiveThreshold
      )}`
    )
  }

  // Resolve severity base weights
  const weights: Record<HazardSeverity, number> = {
    low: options?.severityWeights?.low ?? DEFAULT_SEVERITY_BASE_WEIGHTS.low,
    medium: options?.severityWeights?.medium ?? DEFAULT_SEVERITY_BASE_WEIGHTS.medium,
    high: options?.severityWeights?.high ?? DEFAULT_SEVERITY_BASE_WEIGHTS.high,
  }

  for (const [sev, weight] of Object.entries(weights)) {
    if (typeof weight !== 'number' || !Number.isFinite(weight) || weight < 0) {
      throw new RangeError(
        `Severity base weight for "${sev}" must be a non-negative finite number. Received: ${String(
          weight
        )}`
      )
    }
  }

  // Deduplicate candidates by hazardId, keeping the nearest distance
  const candidateMap = new Map<string, HazardProximityResult>()
  for (const item of rawCandidates) {
    if (!item || typeof item !== 'object' || typeof item.hazardId !== 'string') {
      continue
    }
    const existing = candidateMap.get(item.hazardId)
    if (!existing || item.distanceMeters < existing.distanceMeters) {
      candidateMap.set(item.hazardId, item)
    }
  }

  const contributions: HazardRiskContribution[] = []

  for (const item of candidateMap.values()) {
    // Malformed distance validation policy: exclude from score
    if (
      typeof item.distanceMeters !== 'number' ||
      !Number.isFinite(item.distanceMeters) ||
      item.distanceMeters < 0
    ) {
      continue
    }

    // Malformed severity validation policy: exclude unknown severities
    if (item.severity !== 'low' && item.severity !== 'medium' && item.severity !== 'high') {
      continue
    }

    const multiplier = calculateProximityMultiplier(item.distanceMeters, effectiveThreshold)
    if (multiplier <= 0) {
      continue
    }

    const baseWeight = weights[item.severity]
    const scoreContribution = Math.round(baseWeight * multiplier * 100) / 100
    const bandDesc = getBandDescription(item.distanceMeters, effectiveThreshold)
    const severityLabel = item.severity.charAt(0).toUpperCase() + item.severity.slice(1)

    contributions.push({
      hazardId: item.hazardId,
      hazardName: item.hazardName ?? `Hazard ${item.hazardId}`,
      severity: item.severity,
      distanceMeters: item.distanceMeters,
      baseWeight,
      proximityMultiplier: multiplier,
      scoreContribution,
      explanation: `${severityLabel} severity (base weight ${baseWeight}) at ${item.distanceMeters}m (${bandDesc}, multiplier ${multiplier}) contributes ${scoreContribution} to risk score.`,
    })
  }

  // Sort contributions nearest-first, then by hazardId
  contributions.sort((a, b) => {
    if (a.distanceMeters !== b.distanceMeters) {
      return a.distanceMeters - b.distanceMeters
    }
    return a.hazardId.localeCompare(b.hazardId)
  })

  // Aggregate contributions and clamp to [0, 100]
  const rawScore = contributions.reduce((acc, c) => acc + c.scoreContribution, 0)
  const score = Math.min(100, Math.max(0, Math.round(rawScore * 100) / 100))
  const riskCategory = getRiskCategory(score)
  const includedHazardCount = contributions.length

  const summaryExplanation =
    includedHazardCount === 0
      ? `No simulated hazards were detected within the ${effectiveThreshold}m proximity threshold. Note: this prototype score reflects only simulated hazards and does not guarantee hazard-free conditions.`
      : `Evaluated ${evaluatedCount} simulated hazard(s); ${includedHazardCount} within ${effectiveThreshold}m threshold contributed to an aggregate risk score of ${score}/100 (${riskCategory}). Note: prototype model based solely on simulated hazard proximity.`

  return {
    score,
    riskCategory,
    evaluatedHazardCount: evaluatedCount,
    includedHazardCount,
    thresholdMeters: effectiveThreshold,
    contributions,
    summaryExplanation,
  }
}
