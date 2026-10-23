export type PilotArea = 'Navi Mumbai'

export type HazardSeverity = 'low' | 'medium' | 'high'

export type HazardType =
  | 'waterlogging'
  | 'flooded_underpass'
  | 'submerged_road'
  | 'traffic_obstruction'

export interface HazardLocation {
  id: string
  name: string
  area: string
  coordinates: [number, number] // [lat, lng]
  hazardType: HazardType
  severity: HazardSeverity
  description: string
  isSimulated: true
}

export interface RouteOption {
  id: string
  name: string
  distanceKm: number
  estimatedDurationMinutes: number
  hazardCount: number
  safetyScore: number // 0-100 (higher = safer)
  isRecommended: boolean
}

export type RouteEndpointType = 'origin' | 'destination'

export interface SelectedLocation {
  label: string
  coordinates: [number, number] // [lat, lng]
  landmarkId?: string
}

export interface RoadRoute {
  id: string
  label?: string
  coordinates: [number, number][] // [lat, lng] Leaflet coordinate pairs
  distanceMeters: number
  durationSeconds: number
  engineEstimateNotice: string
  corridorName?: string
  isCorridorAlternative?: boolean
}

export type RouteStatus = 'idle' | 'loading' | 'success' | 'error'

export interface HazardProximityResult {
  hazardId: string
  hazardName: string
  hazardType: HazardType
  severity: HazardSeverity
  distanceMeters: number
  isNearby: boolean
  hazard: HazardLocation
}

export interface ProximityDetectionOptions {
  thresholdMeters?: number
}

export interface RouteHazardProximitySummary {
  thresholdMeters: number
  evaluatedHazardCount: number
  nearbyHazards: HazardProximityResult[]
  allHazards: HazardProximityResult[]
}

export type RouteRiskCategory =
  | 'No nearby simulated hazards'
  | 'Low'
  | 'Moderate'
  | 'High'
  | 'Very High'

export interface HazardRiskContribution {
  hazardId: string
  hazardName: string
  severity: HazardSeverity
  distanceMeters: number
  baseWeight: number
  proximityMultiplier: number
  scoreContribution: number
  explanation: string
}

export interface RouteRiskScoringOptions {
  thresholdMeters?: number
  severityWeights?: Partial<Record<HazardSeverity, number>>
}

export interface RouteRiskScoreResult {
  score: number
  riskCategory: RouteRiskCategory
  evaluatedHazardCount: number
  includedHazardCount: number
  thresholdMeters: number
  contributions: HazardRiskContribution[]
  summaryExplanation: string
}

export interface RouteRiskAssessment {
  routeId: string
  status: 'success' | 'error'
  result?: RouteRiskScoreResult
  error?: string
}
