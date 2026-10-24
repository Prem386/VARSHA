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
  placeId?: string
  formattedAddress?: string
  source?: 'geoapify' | 'curated' | 'map'
  category?: string
  locality?: string
}

export interface PlaceSuggestion {
  id: string
  name: string
  formatted_address: string
  latitude: number
  longitude: number
  source: string // 'geoapify' | 'curated'
  category?: string | null
  locality?: string | null
}

export interface PlaceSearchResponse {
  query: string
  total: number
  results: PlaceSuggestion[]
  source: string
  cached: boolean
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

// -------------------------------------------------------------
// Official Weather & Alert Integration Types (Open-Meteo & NDMA SACHET)
// -------------------------------------------------------------

export interface RainfallProviderStatus {
  provider: string
  status: 'ok' | 'degraded' | 'unavailable' | string
  is_cached: boolean
  is_stale: boolean
  retrieved_at: string | null
  error_message: string | null
  endpoint_url: string
}

export interface CurrentRainfall {
  timestamp: string
  interval_seconds: number
  precipitation_mm: number | null
  unit: string
  is_model_derived: boolean
  is_physical_observation: boolean
  interval_description: string
}

export interface PrecipitationStep {
  timestamp: string
  precipitation_mm: number | null
  precipitation_probability_pct: number | null
  interval_minutes: number
  unit: string
  is_model_derived: boolean
}

export interface RainfallSummary {
  forecast_hours: number
  total_precipitation_mm: number | null
  max_hourly_precipitation_mm: number | null
  max_probability_pct: number | null
}

export interface RainfallResponse {
  provider: RainfallProviderStatus
  requested_coordinate: { latitude: number; longitude: number }
  data_type: string
  is_model_derived: boolean
  is_physical_observation: boolean
  current?: CurrentRainfall | null
  hourly: PrecipitationStep[]
  summary?: RainfallSummary | null
  caveats: string[]
}

export interface AlertProviderStatus {
  provider: string
  status: 'ok' | 'degraded' | 'unavailable' | string
  is_cached: boolean
  is_stale: boolean
  retrieved_at: string | null
  error_message: string | null
  feed_url: string
}

export interface AlertGeocode {
  value_name: string
  value: string
}

export interface NormalizedAlert {
  provider: string
  identifier: string
  sender: string
  sent?: string | null
  status: string
  msg_type: string
  references?: string | null
  category?: string | null
  event?: string | null
  headline?: string | null
  description?: string | null
  instruction?: string | null
  severity: string
  urgency: string
  certainty: string
  is_active: boolean
  effective?: string | null
  onset?: string | null
  expires?: string | null
  retrieved_at: string
  language?: string | null
  alternate_languages: string[]
  area_description?: string | null
  geocodes: AlertGeocode[]
  geometry_type: string
  coordinates?: { latitude: number; longitude: number }[] | null
  has_spatial_geometry: boolean
  raw_severity?: string | null
  raw_urgency?: string | null
  raw_certainty?: string | null
  warnings: string[]
}

export interface AlertListResponse {
  provider: AlertProviderStatus
  total: number
  alerts: NormalizedAlert[]
  spatial_filter_applied: boolean
  spatial_filter_note?: string | null
}
