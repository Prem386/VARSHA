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
}

export interface RoadRoute {
  id: string
  label?: string
  coordinates: [number, number][] // [lat, lng] Leaflet coordinate pairs
  distanceMeters: number
  durationSeconds: number
  engineEstimateNotice: string
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
