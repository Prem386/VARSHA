import type { FC } from 'react'
import type { DemoScenarioId } from './scenarios.ts'
import { getAllDemoScenarios, getDemoScenario } from './scenarios.ts'

interface ScenarioSelectorProps {
  selectedScenarioId: DemoScenarioId
  onSelectScenario: (id: DemoScenarioId) => void
}

// ponytail: compact accessible segmented control; no external component library needed
export const ScenarioSelector: FC<ScenarioSelectorProps> = ({
  selectedScenarioId,
  onSelectScenario,
}) => {
  const scenarios = getAllDemoScenarios()
  const activeScenario = getDemoScenario(selectedScenarioId)
  const isNonBaseline = selectedScenarioId !== 'baseline'

  return (
    <div
      className="scenario-selector-container"
      role="region"
      aria-label="Monsoon Risk Demo Scenarios"
    >
      <div className="scenario-selector-top">
        <div className="scenario-header-text">
          <span className="scenario-badge">Demo Scenarios</span>
          <span className="scenario-subtitle">Differential Risk Testing</span>
        </div>
        <span className="scenario-hazard-count">
          {activeScenario.hazards.length === 0
            ? '0 simulated hazards'
            : `${activeScenario.hazards.length} simulated hazard${activeScenario.hazards.length > 1 ? 's' : ''}`}
        </span>
      </div>

      <div
        className="scenario-options-group segmented"
        role="radiogroup"
        aria-label="Select demo risk scenario"
      >
        {scenarios.map((scenario) => {
          const isSelected = scenario.id === selectedScenarioId
          return (
            <button
              key={scenario.id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              className={`scenario-option-btn segmented-item ${isSelected ? 'scenario-btn-selected active' : ''}`}
              onClick={() => onSelectScenario(scenario.id)}
              title={scenario.description}
            >
              <span className="scenario-btn-dot" aria-hidden="true"></span>
              <span className="scenario-btn-label">{scenario.shortLabel}</span>
            </button>
          )
        })}
      </div>

      <p className="scenario-description-note">
        {activeScenario.description}
      </p>

      {/* Prominent warning notice displayed whenever a non-baseline scenario is active */}
      {isNonBaseline && (
        <div className="scenario-warning-notice" role="status">
          <span className="warning-notice-icon" aria-hidden="true">⚠️</span>
          <div className="warning-notice-content">
            <strong className="warning-notice-heading">
              DEMO SCENARIO ACTIVE — SYNTHETIC HAZARDS, NOT LIVE CONDITIONS
            </strong>
            <p className="warning-notice-detail">{activeScenario.notice}</p>
          </div>
        </div>
      )}
    </div>
  )
}

export default ScenarioSelector
