export type PilotArea = 'Navi Mumbai'

export type HazardSeverity = 'low' | 'moderate' | 'high' | 'severe'

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
