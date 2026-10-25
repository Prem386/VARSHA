import React, { useEffect, useState, useCallback } from 'react'
import type { AlertListResponse, NormalizedAlert, RainfallResponse } from '../../types'
import {
  DEFAULT_PILOT_COORDINATES,
  fetchOfficialAlerts,
  fetchRainfallForecast,
} from './weatherService'
import './WeatherAlertsCard.css'

export interface WeatherAlertsCardProps {
  autoFetch?: boolean
  initialRainfall?: RainfallResponse | null
  initialAlerts?: AlertListResponse | null
  fetchRainfallFn?: (lat: number, lon: number, hours: number) => Promise<RainfallResponse>
  fetchAlertsFn?: (activeOnly: boolean) => Promise<AlertListResponse>
}

// ponytail: helper to format ISO strings cleanly without date-fns/moment
function formatTimestamp(isoStr: string | null | undefined): string {
  if (!isoStr) return 'Not specified'
  try {
    const d = new Date(isoStr)
    if (isNaN(d.getTime())) return isoStr
    return d.toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }) + ' IST'
  } catch {
    return isoStr
  }
}

function getSeverityBadgeClass(severity: string): string {
  switch (severity?.toLowerCase()) {
    case 'extreme':
      return 'alert-badge-extreme'
    case 'severe':
      return 'alert-badge-severe'
    case 'moderate':
      return 'alert-badge-moderate'
    case 'minor':
      return 'alert-badge-minor'
    default:
      return 'alert-badge-unknown'
  }
}

export const WeatherAlertsCard: React.FC<WeatherAlertsCardProps> = ({
  autoFetch = true,
  initialRainfall = null,
  initialAlerts = null,
  fetchRainfallFn = (lat, lon, hours) => fetchRainfallForecast(lat, lon, hours),
  fetchAlertsFn = (activeOnly) => fetchOfficialAlerts(activeOnly),
}) => {
  const [rainfall, setRainfall] = useState<RainfallResponse | null>(initialRainfall)
  const [alerts, setAlerts] = useState<AlertListResponse | null>(initialAlerts)
  const [isLoading, setIsLoading] = useState<boolean>(autoFetch && (!initialRainfall || !initialAlerts))
  const [rainfallError, setRainfallError] = useState<string | null>(null)
  const [alertsError, setAlertsError] = useState<string | null>(null)
  const [expandedAlertId, setExpandedAlertId] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    setIsLoading(true)
    setRainfallError(null)
    setAlertsError(null)

    // Execute concurrently, isolated error states
    const rainfallPromise = fetchRainfallFn(
      DEFAULT_PILOT_COORDINATES.latitude,
      DEFAULT_PILOT_COORDINATES.longitude,
      24
    )
      .then((res) => {
        setRainfall(res)
        if (res.provider.status === 'unavailable') {
          setRainfallError(res.provider.error_message || 'Rainfall forecast provider unavailable')
        }
      })
      .catch((err: Error) => {
        setRainfall(null)
        setRainfallError(err.message || 'Failed to retrieve rainfall forecast')
      })

    const alertsPromise = fetchAlertsFn(true)
      .then((res) => {
        setAlerts(res)
        if (res.provider.status === 'unavailable') {
          setAlertsError(res.provider.error_message || 'Official alerts provider unavailable')
        }
      })
      .catch((err: Error) => {
        setAlerts(null)
        setAlertsError(err.message || 'Failed to retrieve official alerts')
      })

    await Promise.allSettled([rainfallPromise, alertsPromise])
    setIsLoading(false)
  }, [fetchRainfallFn, fetchAlertsFn])

  useEffect(() => {
    if (autoFetch) {
      loadData()
    }
  }, [autoFetch, loadData])

  const isRainfallStale = rainfall?.provider.is_stale || rainfall?.provider.status === 'degraded'
  const isAlertsStale = alerts?.provider.is_stale || alerts?.provider.status === 'degraded'

  return (
    <section className="weather-alerts-card" aria-label="Official Weather & Disaster Alerts">
      {/* Header */}
      <div className="weather-card-header">
        <div className="weather-card-title-group">
          <div className="weather-card-icon" aria-hidden="true">📡</div>
          <div>
            <h3 className="weather-card-title">Live Weather &amp; Official Alerts</h3>
            <p className="weather-card-subtitle">
              Navi Mumbai NWP Forecast (19.033&deg; N, 73.0297&deg; E) &bull; NDMA SACHET Feed Warnings
            </p>
          </div>
        </div>

        <button
          type="button"
          className="weather-refresh-button"
          onClick={loadData}
          disabled={isLoading}
          aria-label="Refresh weather and alerts data"
        >
          {isLoading ? 'Updating…' : '↻ Refresh Data'}
        </button>
      </div>

      {/* Distinction notice between official live data and simulated scenarios */}
      <div className="official-data-notice" role="note">
        <span className="notice-icon" aria-hidden="true">ℹ️</span>
        <div>
          <strong>Official Data &amp; Geographic Scope Notice:</strong> Rainfall is a model-derived forecast for Navi Mumbai. Official alerts reflect active broadcasts from the NDMA SACHET feed (check the affected districts on each warning card for local relevance). Neither confirms road waterlogging nor guarantees route safety.
        </div>
      </div>

      {/* Main Grid: Weather on Left, Alerts on Right */}
      <div className="weather-card-grid">
        {/* --- WEATHER COLUMN --- */}
        <div className="weather-section card" data-testid="weather-section">
          <div className="section-subheading-row">
            <h4 className="section-subheading">Precipitation Forecast</h4>
            {rainfall?.provider.retrieved_at && (
              <span className="data-badge data-badge-freshness">
                {isRainfallStale ? '⚠ Stale Fallback' : 'Fetched'}:{' '}
                {formatTimestamp(rainfall.provider.retrieved_at)}
              </span>
            )}
          </div>

          {rainfallError ? (
            <div className="service-error-state" role="alert">
              <span className="error-icon" aria-hidden="true">⚠️</span>
              <div>
                <strong>Rainfall forecast unavailable</strong>
                <p className="error-detail">{rainfallError}</p>
              </div>
            </div>
          ) : isLoading && !rainfall ? (
            <div className="service-loading-state" aria-busy="true">
              <div className="loading-spinner" aria-hidden="true"></div>
              <span>Retrieving model precipitation forecast…</span>
            </div>
          ) : rainfall ? (
            <div className="rainfall-content">
              {/* Stale Warning Banner if degraded */}
              {isRainfallStale && (
                <div className="stale-warning-banner" role="status">
                  <strong>Notice:</strong> Open-Meteo upstream is currently unreachable. Displaying cached forecast from {formatTimestamp(rainfall.provider.retrieved_at)}.
                </div>
              )}

              {/* Current Model Window */}
              <div className="current-rainfall-box">
                <span className="rainfall-box-label">
                  Current Model Estimate ({rainfall.current?.interval_seconds ? `${rainfall.current.interval_seconds / 60}m window` : 'Window'})
                </span>
                <div className="rainfall-metric-row">
                  <span className="rainfall-value">
                    {rainfall.current?.precipitation_mm !== null && rainfall.current?.precipitation_mm !== undefined
                      ? `${rainfall.current.precipitation_mm} ${rainfall.current.unit || 'mm'}`
                      : 'Unavailable'}
                  </span>
                  <span className="model-derived-badge">NWP Model-derived</span>
                </div>
                <p className="rainfall-footnote">
                  Accumulation over preceding 15 min evaluation interval. Not a physical rain-gauge observation or instantaneous rate.
                </p>
              </div>

              {/* 24-Hour Horizon Summary */}
              {rainfall.summary ? (
                <div className="forecast-summary-box">
                  <span className="rainfall-box-label">24-Hour Model Summary Horizon</span>
                  <div className="summary-metrics-grid">
                    <div className="summary-metric">
                      <span className="metric-label">Total Expected Accumulation</span>
                      <span className="metric-value">
                        {rainfall.summary.total_precipitation_mm !== null
                          ? `${rainfall.summary.total_precipitation_mm} mm`
                          : 'N/A'}
                      </span>
                    </div>

                    <div className="summary-metric">
                      <span className="metric-label">Peak 1-Hour Accumulation</span>
                      <span className="metric-value">
                        {rainfall.summary.max_hourly_precipitation_mm !== null
                          ? `${rainfall.summary.max_hourly_precipitation_mm} mm`
                          : 'N/A'}
                      </span>
                    </div>

                    <div className="summary-metric summary-metric-gauge">
                      <span className="metric-label">Max Rain Probability</span>
                      {(() => {
                        const probValue = rainfall.summary.max_probability_pct
                        const hasProb = probValue !== null && probValue !== undefined
                        const probPct = hasProb ? Math.max(0, Math.min(100, Math.round(probValue))) : null
                        const strokeDash = 213.63
                        const strokeOffset = probPct !== null ? strokeDash - (strokeDash * probPct) / 100 : strokeDash

                        return (
                          <div className="ring-gauge-container">
                            <svg className="ring-gauge-svg" width="84" height="84" viewBox="0 0 84 84" aria-hidden="true">
                              <defs>
                                <linearGradient id="rainGaugeGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                  <stop offset="0%" stopColor="#FFD25A" />
                                  <stop offset="100%" stopColor="#F5A623" />
                                </linearGradient>
                              </defs>
                              <circle
                                className="ring-gauge-bg"
                                cx="42"
                                cy="42"
                                r="34"
                                fill="none"
                                stroke="rgba(163, 165, 180, 0.2)"
                                strokeWidth="6.5"
                              />
                              {probPct !== null && probPct > 0 && (
                                <circle
                                  className="ring-gauge-progress"
                                  cx="42"
                                  cy="42"
                                  r="34"
                                  fill="none"
                                  stroke="url(#rainGaugeGradient)"
                                  strokeWidth="6.5"
                                  strokeLinecap="round"
                                  strokeDasharray={strokeDash}
                                  strokeDashoffset={strokeOffset}
                                  transform="rotate(-90 42 42)"
                                />
                              )}
                            </svg>
                            <div className="ring-gauge-center">
                              <span className="metric-value">
                                {hasProb ? `${probValue}%` : '—'}
                              </span>
                            </div>
                          </div>
                        )
                      })()}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="summary-unavailable-note">
                  24-hour summary unavailable for this forecast coordinate.
                </div>
              )}

              {/* Attribution */}
              <div className="provider-attribution">
                Weather forecast data from{' '}
                <a
                  href="https://open-meteo.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="attribution-link"
                >
                  Open-Meteo.com
                </a>{' '}
                (Licensed under CC BY 4.0).
              </div>
            </div>
          ) : null}
        </div>

        {/* --- OFFICIAL ALERTS COLUMN --- */}
        <div className="alerts-section card" data-testid="alerts-section">
          <div className="section-subheading-row">
            <h4 className="section-subheading">Official Disaster Warnings</h4>
            {alerts && (
              <span className="data-badge data-badge-alerts">
                {alerts.total} Active Warning{alerts.total === 1 ? '' : 's'}
              </span>
            )}
          </div>

          {alertsError ? (
            <div className="service-error-state" role="alert">
              <span className="error-icon" aria-hidden="true">⚠️</span>
              <div>
                <strong>Official alert feed unavailable</strong>
                <p className="error-detail">{alertsError}</p>
              </div>
            </div>
          ) : isLoading && !alerts ? (
            <div className="service-loading-state" aria-busy="true">
              <div className="loading-spinner" aria-hidden="true"></div>
              <span>Connecting to NDMA SACHET warning feed…</span>
            </div>
          ) : alerts ? (
            <div className="alerts-content">
              {/* Stale Warning Banner if degraded */}
              {isAlertsStale && (
                <div className="stale-warning-banner" role="status">
                  <strong>Notice:</strong> NDMA SACHET feed is unreachable. Displaying cached alerts from {formatTimestamp(alerts.provider.retrieved_at)}.
                </div>
              )}

              {alerts.total === 0 ? (
                <div className="empty-alerts-box" data-testid="no-alerts-state">
                  <div className="empty-check-icon" aria-hidden="true">✓</div>
                  <div>
                    <h5 className="empty-alerts-title">No Active Official Disaster Alerts</h5>
                    <p className="empty-alerts-desc">
                      There are no active government warnings currently broadcast in the NDMA SACHET feed. Local monsoon waterlogging may still occur independently.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="alerts-list" role="list">
                  {alerts.alerts.map((alert: NormalizedAlert) => {
                    const isExpanded = expandedAlertId === alert.identifier
                    return (
                      <article
                        key={alert.identifier}
                        className="alert-item"
                        role="listitem"
                      >
                        <div className="alert-item-header">
                          <div className="alert-badges-row">
                            <span className={`alert-severity-badge ${getSeverityBadgeClass(alert.severity)}`}>
                              {alert.severity} Severity
                            </span>
                            {alert.event && (
                              <span className="alert-event-badge">{alert.event}</span>
                            )}
                            {alert.urgency && alert.urgency !== 'Unknown' && (
                              <span className="alert-urgency-badge">{alert.urgency} Urgency</span>
                            )}
                          </div>
                          <span className="alert-sender-label">{alert.sender}</span>
                        </div>

                        <h5 className="alert-headline">
                          {alert.headline || `${alert.event || 'Emergency'} Advisory`}
                        </h5>

                        {alert.area_description && (
                          <div className="alert-area-info">
                            <strong>Affected Districts / Areas:</strong> {alert.area_description}
                          </div>
                        )}

                        <div className="alert-timeline">
                          {alert.effective && (
                            <span>
                              <strong>Effective:</strong> {formatTimestamp(alert.effective)}
                            </span>
                          )}
                          {alert.expires && (
                            <span>
                              &bull; <strong>Expires:</strong> {formatTimestamp(alert.expires)}
                            </span>
                          )}
                        </div>

                        {/* Collapsible Details (description, instruction) */}
                        {(alert.description || alert.instruction) && (
                          <div className="alert-expandable-section">
                            <button
                              type="button"
                              className="alert-details-toggle"
                              onClick={() => setExpandedAlertId(isExpanded ? null : alert.identifier)}
                              aria-expanded={isExpanded}
                            >
                              {isExpanded ? 'Hide Advisory Details ▲' : 'Show Instructions & Details ▼'}
                            </button>

                            {isExpanded && (
                              <div className="alert-details-body">
                                {alert.description && (
                                  <p className="alert-desc-text">
                                    <strong>Details:</strong> {alert.description}
                                  </p>
                                )}
                                {alert.instruction && (
                                  <p className="alert-instruction-text">
                                    <strong>Instruction:</strong> {alert.instruction}
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </article>
                    )
                  })}
                </div>
              )}

              {/* Attribution */}
              <div className="provider-attribution">
                Official disaster warnings from NDMA SACHET (Common Alerting Protocol 1.2).
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  )
}

export default WeatherAlertsCard
