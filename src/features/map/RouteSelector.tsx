import type { FC } from 'react'
import type { RouteEndpointType, SelectedLocation } from '../../types'

interface RouteSelectorProps {
  origin: SelectedLocation | null
  destination: SelectedLocation | null
  activeTarget: RouteEndpointType
  onSelectTarget: (target: RouteEndpointType) => void
  onSwap: () => void
  onClear: (target: RouteEndpointType) => void
  isIdentical: boolean
}

export const RouteSelector: FC<RouteSelectorProps> = ({
  origin,
  destination,
  activeTarget,
  onSelectTarget,
  onSwap,
  onClear,
  isIdentical,
}) => {
  const formatCoords = (coords: [number, number]): string => {
    return `${coords[0].toFixed(4)}, ${coords[1].toFixed(4)}`
  }

  const bothSelected = origin !== null && destination !== null
  const canPlanRoute = bothSelected && !isIdentical

  return (
    <div className="route-selector-container" role="region" aria-label="Route Origin and Destination Controls">
      <div className="route-selector-header">
        <div className="selector-title-group">
          <span className="selector-badge">Phase 3 &bull; Route Endpoints</span>
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

      {/* Future Route Planning Action Area */}
      <div className="route-planning-footer">
        <button
          type="button"
          className="btn-plan-route"
          disabled={!canPlanRoute}
          aria-disabled={!canPlanRoute}
          title={
            !canPlanRoute
              ? 'Select both distinct origin and destination first'
              : 'Route calculation will be enabled in Phase 3 Feature 2'
          }
        >
          <span>Plan Safer Route</span>
          <span className="btn-badge-upcoming">Phase 3 Feature</span>
        </button>

        <p className="route-future-notice">
          {canPlanRoute ? (
            <span className="text-ready">
              ✓ Endpoints configured. Routing engine, flood-risk evaluation, and alternative routes will be calculated in the next feature.
            </span>
          ) : (
            <span className="text-waiting">
              Select an origin and destination on the map to prepare route planning.
            </span>
          )}
        </p>
      </div>
    </div>
  )
}

export default RouteSelector
