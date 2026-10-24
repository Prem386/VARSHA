import type { HazardLocation } from '../../types/index.ts'
import { SIMULATED_HAZARDS } from '../map/hazardData.ts'

export type DemoScenarioId = 'baseline' | 'flood-highway' | 'flood-west-bypass' | 'all-clear'

export interface DemoScenario {
  id: DemoScenarioId
  name: string
  shortLabel: string
  description: string
  notice?: string
  hazards: HazardLocation[]
  isSynthetic: boolean
}

export const SYNTHETIC_SCENARIO_NOTICE =
  'DEMO SCENARIO ACTIVE — SYNTHETIC HAZARDS, NOT LIVE CONDITIONS'

export const ALL_CLEAR_EXPLANATION =
  'Empty demo dataset showing 0 simulated hazards. This does NOT represent verified road safety or the absence of real-world monsoon hazards.'

/**
 * High-severity simulated hazard positioned directly along the Sion-Panvel Highway
 * in the Turbhe/Sanpada section (lat: 19.0597, lng: 73.0193).
 * Within ~3.6m of Sion-Panvel Highway OSRM geometry, and ~1,482m from Palm Beach Road.
 */
// ponytail: single synthetic hazard with verified OSRM centerline proximity; no fake API
export const SIMULATED_HIGHWAY_FLOOD_HAZARD: HazardLocation = {
  id: 'sim-scenario-hwy-flood',
  name: 'Simulated Inundation — Sion-Panvel Highway',
  area: 'Turbhe / Sanpada Highway Section (Demo Scenario)',
  coordinates: [19.0597, 73.0193],
  hazardType: 'submerged_road',
  severity: 'high',
  description:
    'Simulated high-severity highway carriageway submergence modeled to demonstrate differential risk scoring along the Sion-Panvel arterial corridor.',
  isSimulated: true,
}

/**
 * High-severity simulated hazard positioned directly along Thane-Belapur Road
 * in the Mahape/Kopar Khairane section (lat: 19.0922, lng: 73.0176).
 * Within ~6.4m of Thane-Belapur Road OSRM geometry, and ~1,259m from West Bypass.
 */
// ponytail: single synthetic hazard with verified OSRM centerline proximity; no fake API
export const SIMULATED_WEST_BYPASS_CORRIDOR_HAZARD: HazardLocation = {
  id: 'sim-scenario-tb-flood',
  name: 'Simulated Flooded Underpass — Thane-Belapur Road',
  area: 'Mahape / Kopar Khairane Arterial (Demo Scenario)',
  coordinates: [19.0922, 73.0176],
  hazardType: 'flooded_underpass',
  severity: 'high',
  description:
    'Simulated high-severity underpass inundation along Thane-Belapur Road modeled to demonstrate West Bypass as a lower-risk alternative during an Airoli–Vashi journey.',
  isSimulated: true,
}

export const DEMO_SCENARIOS: Record<DemoScenarioId, DemoScenario> = {
  baseline: {
    id: 'baseline',
    name: 'Baseline Simulated Hazards',
    shortLabel: 'Baseline',
    description:
      'Standard prototype simulated hazards across Navi Mumbai transit nodes.',
    hazards: SIMULATED_HAZARDS,
    isSynthetic: false,
  },
  'flood-highway': {
    id: 'flood-highway',
    name: 'Flood on Highway',
    shortLabel: 'Flood on Highway',
    description:
      'Simulated flood on Sion-Panvel Highway (Vashi–Belapur journey), demonstrating Palm Beach Road as a lower-risk alternative.',
    notice: `${SYNTHETIC_SCENARIO_NOTICE}. Simulated high-severity submergence placed on Sion-Panvel Highway corridor.`,
    hazards: [SIMULATED_HIGHWAY_FLOOD_HAZARD],
    isSynthetic: true,
  },
  'flood-west-bypass': {
    id: 'flood-west-bypass',
    name: 'Flood on West Bypass',
    shortLabel: 'Flood on West Bypass',
    description:
      'Simulated flood affecting Thane-Belapur Road route during an Airoli–Vashi journey, demonstrating West Bypass as a lower-risk alternative.',
    notice: `${SYNTHETIC_SCENARIO_NOTICE}. Simulated high-severity underpass flood affecting Thane-Belapur Road route.`,
    hazards: [SIMULATED_WEST_BYPASS_CORRIDOR_HAZARD],
    isSynthetic: true,
  },
  'all-clear': {
    id: 'all-clear',
    name: 'All Clear',
    shortLabel: 'All Clear',
    description:
      'Empty hazard dataset showing zero nearby simulated hazards for baseline validation.',
    notice: `${SYNTHETIC_SCENARIO_NOTICE}. ${ALL_CLEAR_EXPLANATION}`,
    hazards: [],
    isSynthetic: true,
  },
}

export const DEFAULT_SCENARIO_ID: DemoScenarioId = 'baseline'

export function getDemoScenario(id: DemoScenarioId): DemoScenario {
  return DEMO_SCENARIOS[id] ?? DEMO_SCENARIOS.baseline
}

export function getAllDemoScenarios(): DemoScenario[] {
  return [
    DEMO_SCENARIOS.baseline,
    DEMO_SCENARIOS['flood-highway'],
    DEMO_SCENARIOS['flood-west-bypass'],
    DEMO_SCENARIOS['all-clear'],
  ]
}
