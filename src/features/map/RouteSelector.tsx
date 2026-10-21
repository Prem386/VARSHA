import type { FC } from 'react'
import type { RoadRoute, RouteEndpointType, RouteStatus, SelectedLocation } from '../../types'
import { formatDistance, formatDuration } from '../routing/osrmService'

interface RouteSelectorProps {
  origin: SelectedLocation | null
  destination: SelectedLocation | null
  activeTarget: RouteEndpointType
  onSelectTarget: (target: RouteEndpointType) => void
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
}

export const RouteSelector: FC<RouteSelectorProps> = ({
  origin,
  destination,
  activeTarget,
  onSelectTarget,
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
}) => {
  const selectedRoute =
    routes.find((r) => r.id === selectedRouteId) ?? routes[0] ?? null

  const formatCoords = (coords: [number, number]): string => {
    return `${coords[0].toFixed(4)}, ${coords[1].toFixed(4)}`
  }

  const bothSelected = origin !== null && destination !== null
  const canPlanRoute = bothSelected && !isIdentical

  return (
    <div className="route-selector-container" role="region" aria-label="Route Origin and Destination Controls">
      <div className="route-selector-header">
        <div className="selector-title-group">
          <span className="selector-badge">Phase 3 &bull; OSRM Road Routing</span>
          <h4 className="selector-heading">Select Origin &amp; Destination</h4>
        </div>
        <p className="selector-instruction">
          {activeTarget === 'origin'
            ? '🎯 Active: Click anywhere on the map to place Origin (Point A)'
            : '🎯 Active: Click anywhere on the map to place Destination (Point B)'}
        </p>
      </div>

      <div className="route-endpoints-grid">
        {/* Origin Selection Box */}
        <div
          className={`endpoint-card ${activeTarget === 'origin' ? 'endpoint-card-active' : ''}`}
          onClick={() => onSelectTarget('origin')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              onSelectTarget('origin')
            }
          }}
          aria-pressed={activeTarget === 'origin'}
          aria-label={`Origin location: ${origin ? formatCoords(origin.coordinates) : 'Not set. Click to activate map selection'}`}
        >
          <div className="endpoint-card-header">
            <div className="endpoint-type-tag tag-origin">
              <span className="endpoint-letter">A</span>
              <span className="endpoint-name">Origin</span>
            </div>
            {origin && (
              <button
                type="button"
                className="btn-clear-endpoint"
                onClick={(e) => {
                  e.stopPropagation()
                  onClear('origin')
                }}
                title="Clear origin location"
                aria-label="Clear origin selection"
              >
                ✕
              </button>
            )}
          </div>

          <div className="endpoint-content">
            {origin ? (
              <div className="endpoint-coords-display">
                <span className="coord-value">{formatCoords(origin.coordinates)}</span>
                <span className="coord-label">(Lat, Lng)</span>
              </div>
            ) : (
              <div className="endpoint-empty-prompt">
                <span className="prompt-text">
                  {activeTarget === 'origin' ? 'Click map to place pin' : 'Click to select origin'}
                </span>
              </div>
            )}
          </div>

          {activeTarget === 'origin' && (
            <div className="active-pill" aria-hidden="true">
              Map Click Target
            </div>
          )}
        </div>

        {/* Swap Button */}
        <div className="swap-button-wrapper">
          <button
            type="button"
            className="btn-swap-endpoints"
            onClick={onSwap}
            disabled={!origin && !destination}
            title="Swap Origin and Destination"
            aria-label="Swap origin and destination locations"
          >
            <span className="swap-icon" aria-hidden="true">⇅</span>
            <span className="swap-sr-text">Swap</span>
          </button>
        </div>

        {/* Destination Selection Box */}
        <div
          className={`endpoint-card ${activeTarget === 'destination' ? 'endpoint-card-active' : ''}`}
          onClick={() => onSelectTarget('destination')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              onSelectTarget('destination')
            }
          }}
          aria-pressed={activeTarget === 'destination'}
          aria-label={`Destination location: ${destination ? formatCoords(destination.coordinates) : 'Not set. Click to activate map selection'}`}
        >
          <div className="endpoint-card-header">
            <div className="endpoint-type-tag tag-destination">
              <span className="endpoint-letter">B</span>
              <span className="endpoint-name">Destination</span>
            </div>
            {destination && (
              <button
                type="button"
                className="btn-clear-endpoint"
                onClick={(e) => {
                  e.stopPropagation()
                  onClear('destination')
                }}
                title="Clear destination location"
                aria-label="Clear destination selection"
              >
                ✕
              </button>
            )}
          </div>

          <div className="endpoint-content">
            {destination ? (
              <div className="endpoint-coords-display">
                <span className="coord-value">{formatCoords(destination.coordinates)}</span>
                <span className="coord-label">(Lat, Lng)</span>
              </div>
            ) : (
              <div className="endpoint-empty-prompt">
                <span className="prompt-text">
                  {activeTarget === 'destination' ? 'Click map to place pin' : 'Click to select destination'}
                </span>
              </div>
            )}
          </div>

          {activeTarget === 'destination' && (
            <div className="active-pill active-pill-dest" aria-hidden="true">
              Map Click Target
            </div>
          )}
        </div>
      </div>

      {/* Validation and Status Feedback */}
      {isIdentical && (
        <div className="validation-alert alert-error" role="alert">
          <span className="alert-icon" aria-hidden="true">⚠️</span>
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
            <span className="status-error-icon" aria-hidden="true">⚠️</span>
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
                {routes.map((r, index) => {
                  const isSelected = r.id === selectedRoute.id
                  const label = r.label || `Route ${index + 1}`
                  return (
                    <div
                      key={r.id}
                      className={`route-option-card ${isSelected ? 'route-option-card-selected' : ''}`}
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
                })}
              </div>
            </div>
          ) : (
            /* Single-route fallback display */
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
          )}

          <p className="route-disclaimer">
            <span className="disclaimer-icon" aria-hidden="true">ℹ️</span>
            <span>{selectedRoute.engineEstimateNotice}</span>
          </p>
        </div>
      )}

      {/* Route Planning Action Footer */}
      <div className="route-planning-footer">
        <button
          type="button"
          className="btn-plan-route"
          onClick={onPlanRoute}
          disabled={!canPlanRoute || routeStatus === 'loading'}
          aria-busy={routeStatus === 'loading'}
          aria-disabled={!canPlanRoute || routeStatus === 'loading'}
          title={
            !canPlanRoute
              ? 'Select both distinct origin and destination first'
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
                ? `✓ ${routes.length} alternative road routes retrieved. Click a card to change highlighted path.`
                : '✓ Real road route displayed. Flood-risk evaluation and alternative routes follow in subsequent features.'}
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
