import type { FC, ReactNode } from 'react'
import type {
  RoadRoute,
  RouteEndpointType,
  RouteRiskAssessment,
  RouteRiskCategory,
  RouteStatus,
  SelectedLocation,
} from '../../types'
import { formatDistance, formatDuration } from '../routing/osrmService'
import PlaceSearchInput from '../search/PlaceSearchInput'
import ScenarioSelector from '../scenarios/ScenarioSelector.tsx'
import type { DemoScenarioId } from '../scenarios/scenarios.ts'
import {
  IconShield,
  IconAlert,
  IconInfo,
  IconSwap,
  IconChevron,
} from '../../components/Icons'

interface RouteSelectorProps {
  origin: SelectedLocation | null
  destination: SelectedLocation | null
  activeTarget: RouteEndpointType
  onSelectTarget: (target: RouteEndpointType) => void
  onSelectOrigin: (location: SelectedLocation) => void
  onSelectDestination: (location: SelectedLocation) => void
  onSwap: () => void
  onClear: (target: RouteEndpointType) => void
  isIdentical: boolean
  routes: RoadRoute[]
  selectedRouteId: string | null
  onSelectRoute: (routeId: string) => void
  routeStatus: RouteStatus
  routeError: string | null
  onPlanRoute: () => void
  onClearRoute: () => void
  riskAssessments?: Record<string, RouteRiskAssessment>
  selectedScenarioId?: DemoScenarioId
  onSelectScenario?: (id: DemoScenarioId) => void
}

const getRiskCategoryClass = (category?: RouteRiskCategory): string => {
  switch (category) {
    case 'Low':
      return 'risk-cat-low'
    case 'Moderate':
      return 'risk-cat-moderate'
    case 'High':
      return 'risk-cat-high'
    case 'Very High':
      return 'risk-cat-very-high'
    case 'No nearby simulated hazards':
    default:
      return 'risk-cat-none'
  }
}

const renderRiskCategoryIcon = (category?: RouteRiskCategory): ReactNode => {
  switch (category) {
    case 'Low':
      return <IconShield size={16} />
    case 'Moderate':
    case 'High':
    case 'Very High':
      return <IconAlert size={16} />
    case 'No nearby simulated hazards':
    default:
      return <IconInfo size={16} />
  }
}

interface RouteRiskDisplayProps {
  assessment?: RouteRiskAssessment
}

const RouteRiskDisplay: FC<RouteRiskDisplayProps> = ({ assessment }) => {
  if (!assessment) {
    return null
  }

  if (assessment.status === 'error' || !assessment.result) {
    return (
      <div className="route-risk-block risk-block-error" role="status">
        <div className="risk-header-row">
          <span className="risk-category-tag risk-cat-error">
            <span className="risk-tag-icon" aria-hidden="true">
              <IconAlert size={16} />
            </span>
            Risk Assessment Unavailable
          </span>
        </div>
        <p className="risk-error-text">
          {assessment.error || 'Unable to compute prototype risk assessment for this route.'}
        </p>
      </div>
    )
  }

  const { result } = assessment
  const categoryClass = getRiskCategoryClass(result.riskCategory)

  return (
    <div
      className={`route-risk-block ${categoryClass}`}
      role="region"
      aria-label={`Risk Assessment: ${result.riskCategory}, score ${result.score} out of 100`}
    >
      <div className="risk-header-row">
        <div className="risk-score-display">
          <span className="risk-score-label">Prototype Risk Score</span>
          <div className="risk-score-value">
            <strong className="score-num">{result.score}</strong>
            <span className="score-max">/100</span>
          </div>
        </div>

        <div className="risk-badge-container">
          <span className={`risk-category-tag ${categoryClass}`}>
            <span className="risk-tag-icon" aria-hidden="true">
              {renderRiskCategoryIcon(result.riskCategory)}
            </span>
            <span className="risk-tag-label">{result.riskCategory}</span>
          </span>
          <span className="risk-simulated-caption">Simulated Prototype</span>
        </div>
      </div>

      {/* Soft progress bar gauge with text label */}
      <div className="risk-progress-wrapper" aria-hidden="true">
        <div className="risk-progress-track">
          <div
            className={`risk-progress-bar progress-${categoryClass}`}
            style={{ width: `${Math.min(100, Math.max(0, result.score))}%` }}
          />
        </div>
      </div>

      <div className="risk-explanation-box">
        {result.includedHazardCount === 0 ? (
          <p className="risk-explanation-text">
            No simulated hazards detected within {result.thresholdMeters}m proximity threshold.
          </p>
        ) : (
          <p className="risk-explanation-text">
            {result.includedHazardCount} simulated hazard{result.includedHazardCount > 1 ? 's' : ''} detected within {result.thresholdMeters}m threshold contributing to score.
          </p>
        )}
      </div>

      {result.contributions.length > 0 && (
        <details className="risk-contributions-details">
          <summary
            className="risk-details-summary"
            onClick={(e) => {
              // Prevent toggling details from triggering parent route selection clicks
              e.stopPropagation()
            }}
          >
            <span className="summary-title">
              Contributing Hazards ({result.contributions.length})
            </span>
            <span className="summary-chevron" aria-hidden="true">
              <IconChevron direction="down" size={14} />
            </span>
          </summary>
          <div className="contributions-list" onClick={(e) => e.stopPropagation()}>
            {result.contributions.map((c) => (
              <div key={c.hazardId} className="contribution-item">
                <div className="contribution-top">
                  <span className="contribution-name">{c.hazardName}</span>
                  <span className={`contribution-severity-badge sev-${c.severity}`}>
                    {c.severity.toUpperCase()}
                  </span>
                </div>
                <div className="contribution-metrics">
                  <span className="contrib-dist">{c.distanceMeters}m from route</span>
                  <span className="contrib-score">+{c.scoreContribution} pts</span>
                </div>
                <p className="contribution-desc">{c.explanation}</p>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}

export const RouteSelector: FC<RouteSelectorProps> = ({
  origin,
  destination,
  activeTarget,
  onSelectTarget,
  onSelectOrigin,
  onSelectDestination,
  onSwap,
  onClear,
  isIdentical,
  routes,
  selectedRouteId,
  onSelectRoute,
  routeStatus,
  routeError,
  onPlanRoute,
  onClearRoute,
  riskAssessments,
  selectedScenarioId = 'baseline',
  onSelectScenario = () => {},
}) => {
  const selectedRoute =
    routes.find((r) => r.id === selectedRouteId) ?? routes[0] ?? null

  const bothSelected = origin !== null && destination !== null
  const canPlanRoute = bothSelected && !isIdentical

  return (
    <div className="route-selector-container" role="region" aria-label="Route Origin and Destination Controls">
      <div className="route-selector-header">
        <div className="selector-title-group">
          <div className="section-dash" />
          <h4 className="selector-heading">Plan your route</h4>
        </div>
        <p className="selector-instruction">
          Search a landmark or tap &quot;Pick on map&quot;.
        </p>
      </div>

      <div className="route-endpoints-grid">
        <PlaceSearchInput
          id="route-origin-search"
          endpointType="origin"
          label="Origin"
          tagLetter="A"
          placeholder="Search landmark or click map (e.g. Vashi Station)"
          value={origin}
          onSelect={onSelectOrigin}
          onClear={() => onClear('origin')}
          isActiveTarget={activeTarget === 'origin'}
          onActivateTarget={() => onSelectTarget('origin')}
        />

        {/* Swap Button */}
        <div className="swap-button-wrapper">
          <button
            type="button"
            className="btn-swap-endpoints btn"
            onClick={onSwap}
            disabled={!origin && !destination}
            title="Swap Origin and Destination"
            aria-label="Swap origin and destination locations"
          >
            <span className="swap-icon" aria-hidden="true">
              <IconSwap size={18} />
            </span>
            <span className="swap-sr-text">Swap</span>
          </button>
        </div>

        <PlaceSearchInput
          id="route-destination-search"
          endpointType="destination"
          label="Destination"
          tagLetter="B"
          placeholder="Where to? (e.g. Belapur CBD)"
          value={destination}
          onSelect={onSelectDestination}
          onClear={() => onClear('destination')}
          isActiveTarget={activeTarget === 'destination'}
          onActivateTarget={() => onSelectTarget('destination')}
        />
      </div>

      {/* Validation and Status Feedback */}
      {isIdentical && (
        <div className="validation-alert alert-error" role="alert">
          <span className="alert-icon" aria-hidden="true">
            <IconAlert size={16} />
          </span>
          <span>Origin and destination cannot be the same location. Please click the map to choose distinct coordinates.</span>
        </div>
      )}

      {/* Loading state indicator */}
      {routeStatus === 'loading' && (
        <div className="route-status-panel panel-loading" role="status">
          <span className="route-spinner" aria-hidden="true"></span>
          <span>Querying public OSRM routing service for driving road geometry...</span>
        </div>
      )}

      {/* Error state alert with Retry */}
      {routeStatus === 'error' && routeError && (
        <div className="route-status-panel panel-error" role="alert">
          <div className="status-error-content">
            <span className="status-error-icon" aria-hidden="true">
              <IconAlert size={16} />
            </span>
            <div className="status-error-text">
              <strong>Route retrieval failed:</strong>
              <p className="error-message">{routeError}</p>
            </div>
          </div>
          <button
            type="button"
            className="btn-retry-route"
            onClick={onPlanRoute}
            disabled={!canPlanRoute}
          >
            Retry Request
          </button>
        </div>
      )}

      {/* Success state: Single Route or Alternative Route Comparison */}
      {routeStatus === 'success' && routes.length > 0 && selectedRoute && (
        <div
          className="route-summary-panel"
          role="region"
          aria-label={routes.length > 1 ? 'Retrieved alternative routes comparison' : 'Retrieved road route summary'}
        >
          <div className="route-summary-header">
            <div className="summary-title-group">
              <span className="summary-badge">
                {routes.length > 1 ? `OSRM Alternatives • ${routes.length} Found` : 'Route Retrieved'}
              </span>
              <h5 className="summary-heading">
                {routes.length > 1 ? 'Alternative Route Comparison' : 'OSRM Road Route'}
              </h5>
            </div>
            <button
              type="button"
              className="btn-clear-route"
              onClick={onClearRoute}
              title="Clear all routes from map"
            >
              {routes.length > 1 ? 'Clear All Routes' : 'Clear Route Line'}
            </button>
          </div>

          {routes.length > 1 ? (
            <div className="route-comparison-section">
              <p className="route-comparison-intro">
                Select a route card below or click an alternative dashed line on the map to change the highlighted path:
              </p>
              <div className="route-options-grid" role="radiogroup" aria-label="Available alternative routes">
                {(() => {
                  const minDuration = Math.min(...routes.map((r) => r.durationSeconds))
                  const minDistance = Math.min(...routes.map((r) => r.distanceMeters))
                  const validScores = routes
                    .map((r) => riskAssessments?.[r.id]?.result?.score)
                    .filter((s): s is number => typeof s === 'number')
                  const minRiskScore = validScores.length > 0 ? Math.min(...validScores) : null

                  const sortedRoutes = [...routes].sort((a, b) => {
                    const scoreA = riskAssessments?.[a.id]?.result?.score ?? 999
                    const scoreB = riskAssessments?.[b.id]?.result?.score ?? 999
                    if (scoreA !== scoreB) {
                      return scoreA - scoreB
                    }
                    return a.durationSeconds - b.durationSeconds
                  })

                  return sortedRoutes.map((r, index) => {
                    const isSelected = r.id === selectedRoute.id
                    const label = r.label || `Route ${index + 1}`
                    const isFastest = r.durationSeconds === minDuration
                    const isShortest = r.distanceMeters === minDistance
                    const isSafer = minRiskScore !== null && riskAssessments?.[r.id]?.result?.score === minRiskScore

                    return (
                      <div
                        key={r.id}
                        className={`route-option-card card ${isSelected ? 'route-option-card-selected' : ''} ${isSafer ? 'route-card-recommended' : ''}`}
                        role="radio"
                        aria-checked={isSelected}
                        tabIndex={0}
                        onClick={() => onSelectRoute(r.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            onSelectRoute(r.id)
                          }
                        }}
                        aria-label={`${label}: ${formatDistance(r.distanceMeters)}, ${formatDuration(r.durationSeconds)}${isSelected ? ' (Currently Selected)' : ''}`}
                      >
                        <div className="route-card-top">
                          <div className="route-card-title-group">
                            <span className={`route-number-pill ${isSelected ? 'pill-selected' : ''}`}>
                              {index + 1}
                            </span>
                            <span className="route-card-name">{label}</span>
                          </div>
                          <div className="route-tags-group">
                            {r.corridorName && (
                              <span className="route-corridor-tag">
                                {r.corridorName}
                              </span>
                            )}
                            {isSelected ? (
                              <span className="route-status-tag tag-active">
                                ✓ Highlighted
                              </span>
                            ) : (
                              <span className="route-status-tag tag-alt">
                                Alternative
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Comparative Trade-off Badges */}
                        <div className="route-tradeoff-badges">
                          {isSafer && (
                            <span className="tradeoff-badge badge-safer">
                              🛡️ Recommended / Safer
                            </span>
                          )}
                          {isFastest && (
                            <span className="tradeoff-badge badge-fastest">
                              ⚡ Fastest Estimate
                            </span>
                          )}
                          {isShortest && (
                            <span className="tradeoff-badge badge-shortest">
                              📏 Shortest Distance
                            </span>
                          )}
                        </div>

                        <div className="route-card-metrics">
                          <div className="route-card-metric">
                            <span className="card-metric-label">Distance</span>
                            <span className="card-metric-val">{formatDistance(r.distanceMeters)}</span>
                          </div>
                          <div className="route-card-metric">
                            <span className="card-metric-label">Est. Duration</span>
                            <span className="card-metric-val">{formatDuration(r.durationSeconds)}</span>
                          </div>
                          <div className="route-card-metric">
                            <span className="card-metric-label">Points</span>
                            <span className="card-metric-val card-metric-pts">{r.coordinates.length} pts</span>
                          </div>
                        </div>

                        {/* Prototype Risk Assessment */}
                        <RouteRiskDisplay assessment={riskAssessments?.[r.id]} />

                        <button
                          type="button"
                          className={`btn-select-route-action ${isSelected ? 'btn-select-active' : ''}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            onSelectRoute(r.id)
                          }}
                          aria-label={`Select ${label} to display on map`}
                        >
                          {isSelected ? 'Highlighted on Map' : 'Select This Route'}
                        </button>
                      </div>
                    )
                  })
                })()}
              </div>
            </div>
          ) : (
            /* Single-route display with risk evaluation */
            <div className="single-route-container">
              <div className="route-metrics-grid">
                <div className="metric-box">
                  <span className="metric-label">Road Distance</span>
                  <span className="metric-value">{formatDistance(selectedRoute.distanceMeters)}</span>
                </div>
                <div className="metric-box">
                  <span className="metric-label">Est. Duration</span>
                  <span className="metric-value">{formatDuration(selectedRoute.durationSeconds)}</span>
                </div>
                <div className="metric-box">
                  <span className="metric-label">Waypoints</span>
                  <span className="metric-value metric-value-sm">{selectedRoute.coordinates.length} points</span>
                </div>
              </div>

              {/* Single Route Risk Assessment */}
              <RouteRiskDisplay assessment={riskAssessments?.[selectedRoute.id]} />

              <div className="single-route-fallback-notice" role="status">
                <span className="notice-icon" aria-hidden="true">
                  <IconInfo size={16} />
                </span>
                <span className="notice-text">
                  Single driving route returned by routing service. No distinct alternative corridor found for these endpoints.
                </span>
              </div>
            </div>
          )}

          <div className="route-disclaimer" role="note">
            <span className="disclaimer-icon" aria-hidden="true">
              <IconInfo size={16} />
            </span>
            <div className="disclaimer-text">
              <p className="disclaimer-primary">
                Prototype risk estimate based on simulated hazards. This is not a validated flood prediction or guarantee of route safety. Route duration does not include live traffic or monsoon-related delays.
              </p>
              <p className="disclaimer-engine">
                {selectedRoute.engineEstimateNotice}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Empty State before search */}
      {routes.length === 0 && routeStatus === 'idle' && (
        <div className="route-empty-well well">
          <div className="empty-route-icon-disc icon-disc" aria-hidden="true">
            <IconShield size={20} />
          </div>
          <p className="empty-route-text">Your route comparison will appear here.</p>

          <div className="quick-presets-wrapper">
            <span className="quick-presets-label">Popular routes:</span>
            <div className="quick-presets-chips">
              <button
                type="button"
                className="preset-chip-btn"
                onClick={() => {
                  onSelectOrigin({
                    label: 'Vashi Station',
                    coordinates: [19.0645, 72.9983],
                    source: 'curated',
                  })
                  onSelectDestination({
                    label: 'CBD Belapur Station',
                    coordinates: [19.0185, 73.0385],
                    source: 'curated',
                  })
                }}
              >
                Vashi → Belapur
              </button>
              <button
                type="button"
                className="preset-chip-btn"
                onClick={() => {
                  onSelectOrigin({
                    label: 'Airoli Station',
                    coordinates: [19.1553, 72.9986],
                    source: 'curated',
                  })
                  onSelectDestination({
                    label: 'Kharghar Station',
                    coordinates: [19.0435, 73.0683],
                    source: 'curated',
                  })
                }}
              >
                Airoli → Kharghar
              </button>
              <button
                type="button"
                className="preset-chip-btn"
                onClick={() => {
                  onSelectOrigin({
                    label: 'Nerul Station',
                    coordinates: [19.0330, 73.0185],
                    source: 'curated',
                  })
                  onSelectDestination({
                    label: 'Seawoods Grand Central',
                    coordinates: [19.0223, 73.0175],
                    source: 'curated',
                  })
                }}
              >
                Nerul → Seawoods
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Demo Scenario Accordion (Section 5.5) */}
      <details className="demo-mode-accordion">
        <summary className="demo-mode-summary">
          <span className="summary-title">▸ Demo mode</span>
          {selectedScenarioId !== 'baseline' && (
            <span className="badge badge-accent">Demo Active</span>
          )}
        </summary>
        <div className="demo-mode-body">
          <ScenarioSelector
            selectedScenarioId={selectedScenarioId}
            onSelectScenario={onSelectScenario}
          />
        </div>
      </details>

      {/* Route Planning Action Footer */}
      <div className="route-planning-footer">
        <button
          type="button"
          className="btn-plan-route btn-accent"
          onClick={onPlanRoute}
          disabled={!canPlanRoute || routeStatus === 'loading'}
          aria-busy={routeStatus === 'loading'}
          aria-disabled={!canPlanRoute || routeStatus === 'loading'}
          title={
            !canPlanRoute
              ? 'Choose both points to compare routes.'
              : routeStatus === 'loading'
              ? 'Requesting routes from OSRM...'
              : 'Calculate driving road routes via OSRM'
          }
        >
          {routeStatus === 'loading' ? (
            <>
              <span className="btn-spinner" aria-hidden="true"></span>
              <span>Fetching Routes...</span>
            </>
          ) : routeStatus === 'success' ? (
            <>
              <span>Recalculate Routes</span>
              <span className="btn-badge-ready">
                {routes.length > 1 ? `${routes.length} Options` : 'Active'}
              </span>
            </>
          ) : (
            <>
              <span>Plan Driving Routes</span>
              <span className="btn-badge-ready">OSRM</span>
            </>
          )}
        </button>

        <p className="route-future-notice">
          {routeStatus === 'loading' ? (
            <span className="text-waiting">Requesting road route alternatives from OSRM...</span>
          ) : routeStatus === 'success' ? (
            <span className="text-ready">
              {routes.length > 1
                ? `✓ ${routes.length} distinct road route candidates available for safety comparison. Click a card to highlight path.`
                : '✓ 1 road route retrieved. Routing engine found no distinct alternative corridor for these endpoints.'}
            </span>
          ) : canPlanRoute ? (
            <span className="text-ready">
              ✓ Endpoints ready. Click &quot;Plan Driving Routes&quot; to calculate path.
            </span>
          ) : (
            <span className="text-waiting">
              Select an origin and destination on the map to calculate a route.
            </span>
          )}
        </p>
      </div>
    </div>
  )
}

export default RouteSelector
