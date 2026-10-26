import React, { useEffect, useState, useCallback } from 'react'
import type { AlertListResponse, NormalizedAlert, PrecipitationStep, RainfallResponse } from '../../types'
import {
  DEFAULT_PILOT_COORDINATES,
  fetchOfficialAlerts,
  fetchRainfallForecast,
} from './weatherService'
import {
  IconRain,
  IconAlert,
  IconRefresh,
  IconInfo,
  IconCheck,
  IconChevron,
} from '../../components/Icons'
import './WeatherAlertsCard.css'

export interface WeatherAlertsCardProps {
  autoFetch?: boolean
  initialRainfall?: RainfallResponse | null
  initialAlerts?: AlertListResponse | null
  fetchRainfallFn?: (lat: number, lon: number, hours: number) => Promise<RainfallResponse>
  fetchAlertsFn?: (activeOnly: boolean) => Promise<AlertListResponse>
  referenceTime?: Date | string | null
  onDataRefreshed?: (rainfall: RainfallResponse, alerts: AlertListResponse) => void
}

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

export function formatHourSlot(isoStr: string | null | undefined): string {
  if (!isoStr) return '—'
  try {
    const normalized = isoStr.endsWith('Z') || /[+-]\d{2}(:\d{2})?$/.test(isoStr) ? isoStr : `${isoStr}Z`
    const d = new Date(normalized)
    if (isNaN(d.getTime())) return isoStr
    return d.toLocaleTimeString('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
  } catch {
    return isoStr
  }
}

/**
 * Selects the next six forecast hours chronologically from Open-Meteo hourly steps.
 *
 * Current-hour boundary rule:
 * Hourly steps whose interval started before or during the current hour
 * (step.timestamp <= currentHourStart) are excluded so that only upcoming
 * future forecast hours are displayed.
 *
 * Handles missing, malformed, or out-of-order timestamps safely without fabricating data.
 */
export function selectNextSixForecastHours(
  hourly: PrecipitationStep[] | null | undefined,
  referenceTime?: Date | string | null
): PrecipitationStep[] {
  if (!hourly || !Array.isArray(hourly) || hourly.length === 0) {
    return []
  }

  // 1. Filter out null/malformed timestamps and parse to UTC milliseconds
  const validStepsWithDates: { step: PrecipitationStep; timeMs: number }[] = []
  for (const step of hourly) {
    if (!step || !step.timestamp || typeof step.timestamp !== 'string') continue
    const normalized = step.timestamp.endsWith('Z') || /[+-]\d{2}(:\d{2})?$/.test(step.timestamp)
      ? step.timestamp
      : `${step.timestamp}Z`
    const d = new Date(normalized)
    const timeMs = d.getTime()
    if (!isNaN(timeMs)) {
      validStepsWithDates.push({ step, timeMs })
    }
  }

  if (validStepsWithDates.length === 0) {
    return []
  }

  // 2. Sort chronologically to safely handle out-of-order series from upstream
  validStepsWithDates.sort((a, b) => a.timeMs - b.timeMs)

  // 3. Determine current hour boundary cutoff
  // Any step whose interval has already started (i.e. <= currentHourStart) is excluded
  let cutoffMs: number | null = null
  if (referenceTime) {
    const rawRef = typeof referenceTime === 'string'
      ? (referenceTime.endsWith('Z') || /[+-]\d{2}(:\d{2})?$/.test(referenceTime) ? referenceTime : `${referenceTime}Z`)
      : referenceTime
    const refDate = new Date(rawRef)
    if (!isNaN(refDate.getTime())) {
      const currentHourStart = new Date(refDate.getTime())
      currentHourStart.setUTCMinutes(0, 0, 0)
      cutoffMs = currentHourStart.getTime()
    }
  }

  // 4. Select strictly future hours (step timestamp > currentHourStart)
  const futureSteps = cutoffMs !== null
    ? validStepsWithDates.filter((item) => item.timeMs > cutoffMs!)
    : validStepsWithDates

  return futureSteps.slice(0, 6).map((item) => item.step)
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
  referenceTime = null,
  onDataRefreshed,
}) => {
  const [rainfall, setRainfall] = useState<RainfallResponse | null>(initialRainfall)
  const [alerts, setAlerts] = useState<AlertListResponse | null>(initialAlerts)
  const [isLoading, setIsLoading] = useState<boolean>(
    autoFetch && (!initialRainfall || !initialAlerts)
  )
  const [rainfallError, setRainfallError] = useState<string | null>(
    initialRainfall?.provider.status === 'unavailable'
      ? initialRainfall.provider.error_message || 'Rainfall forecast provider unavailable'
      : null
  )
  const [alertsError, setAlertsError] = useState<string | null>(
    initialAlerts?.provider.status === 'unavailable'
      ? initialAlerts.provider.error_message || 'Official alerts provider unavailable'
      : null
  )
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
        return res
      })
      .catch((err: Error) => {
        setRainfall(null)
        setRainfallError(err.message || 'Failed to retrieve rainfall forecast')
        return null
      })

    const alertsPromise = fetchAlertsFn(true)
      .then((res) => {
        setAlerts(res)
        if (res.provider.status === 'unavailable') {
          setAlertsError(res.provider.error_message || 'Official alerts provider unavailable')
        }
        return res
      })
      .catch((err: Error) => {
        setAlerts(null)
        setAlertsError(err.message || 'Failed to retrieve official alerts')
        return null
      })

    const [rainSettled, alertsSettled] = await Promise.allSettled([rainfallPromise, alertsPromise])
    setIsLoading(false)

    if (
      rainSettled.status === 'fulfilled' &&
      rainSettled.value &&
      alertsSettled.status === 'fulfilled' &&
      alertsSettled.value
    ) {
      onDataRefreshed?.(rainSettled.value, alertsSettled.value)
    }
  }, [fetchRainfallFn, fetchAlertsFn, onDataRefreshed])

  // Only auto-fetch on mount if initial data has not already been supplied
  useEffect(() => {
    if (autoFetch && (!initialRainfall || !initialAlerts)) {
      loadData()
    }
  }, [autoFetch, loadData, initialRainfall, initialAlerts])

  // Keep state synchronized if initial props change
  useEffect(() => {
    if (initialRainfall) {
      setRainfall(initialRainfall)
      setRainfallError(
        initialRainfall.provider.status === 'unavailable'
          ? initialRainfall.provider.error_message || 'Rainfall forecast provider unavailable'
          : null
      )
    }
  }, [initialRainfall])

  useEffect(() => {
    if (initialAlerts) {
      setAlerts(initialAlerts)
      setAlertsError(
        initialAlerts.provider.status === 'unavailable'
          ? initialAlerts.provider.error_message || 'Official alerts provider unavailable'
          : null
      )
    }
  }, [initialAlerts])

  const isRainfallStale = rainfall?.provider.is_stale || rainfall?.provider.status === 'degraded'
  const isAlertsStale = alerts?.provider.is_stale || alerts?.provider.status === 'degraded'

  const effectiveRefTime =
    referenceTime ||
    rainfall?.current?.timestamp ||
    rainfall?.provider.retrieved_at ||
    null

  const nextSixHours = selectNextSixForecastHours(rainfall?.hourly, effectiveRefTime)

  return (
    <section className="weather-alerts-card" aria-label="Official Weather & Disaster Alerts">
      {/* Header */}
      <div className="weather-card-header">
        <div className="weather-card-title-group">
          <div className="weather-card-icon icon-disc" aria-hidden="true">
            <IconRain size={20} />
          </div>
          <div>
            <h3 className="weather-card-title">NWP Forecast &amp; Official Alerts</h3>
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
          {isLoading ? (
            'Updating…'
          ) : (
            <>
              <IconRefresh size={15} />
              <span>Refresh Data</span>
            </>
          )}
        </button>
      </div>

      {/* Distinction notice between official live data and simulated scenarios */}
      <div className="official-data-notice" role="note">
        <span className="notice-icon" aria-hidden="true">
          <IconInfo size={18} />
        </span>
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
              <span className="error-icon" aria-hidden="true">
                <IconAlert size={18} />
              </span>
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

              {/* Next 6 Hours Hourly Forecast */}
              {nextSixHours.length > 0 && (
                <div className="hourly-forecast-box" data-testid="hourly-forecast-box">
                  <div className="hourly-forecast-header">
                    <span className="rainfall-box-label">
                      Next {nextSixHours.length} Hours Forecast (IST)
                    </span>
                    <span className="hourly-model-badge">Hourly Horizon</span>
                  </div>
                  <div className="hourly-forecast-grid" role="list" aria-label={`Next ${nextSixHours.length} hours hourly rainfall forecast`}>
                    {nextSixHours.map((step, idx) => {
                      const hasPrecip = step.precipitation_mm !== null && step.precipitation_mm !== undefined
                      const hasProb = step.precipitation_probability_pct !== null && step.precipitation_probability_pct !== undefined
                      return (
                        <div key={step.timestamp || idx} className="hourly-slot-card" role="listitem">
                          <span className="hourly-slot-time">{formatHourSlot(step.timestamp)}</span>
                          <span className="hourly-slot-value">
                            {hasPrecip ? `${step.precipitation_mm} mm` : '—'}
                          </span>
                          <span className="hourly-slot-prob">
                            {hasProb ? `${Math.round(step.precipitation_probability_pct!)}% prob` : '—'}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                  <p className="hourly-footnote">
                    Hourly numerical weather prediction (NWP) model accumulation and precipitation likelihood for Navi Mumbai.
                  </p>
                </div>
              )}

              {/* 24-Hour Horizon Summary */}
              {rainfall.summary ? (
                <div className="forecast-summary-box">
                  <span className="rainfall-box-label">Rolling 24-Hour Forecast Summary</span>
                  {(() => {
                    const forecastHours = rainfall.summary.forecast_hours || 24
                    const validHours = rainfall.summary.valid_hours ?? (
                      rainfall.hourly?.length
                        ? rainfall.hourly.filter((s) => s.precipitation_mm !== null && s.precipitation_mm !== undefined).length
                        : null
                    )
                    const isComplete = rainfall.summary.is_complete ?? (
                      validHours !== null ? validHours === forecastHours : true
                    )
                    const isTotalNull = rainfall.summary.total_precipitation_mm === null

                    return (
                      <>
                        <div className="summary-metrics-grid">
                          <div className="summary-metric">
                            <span className="metric-label">
                              {!isComplete && validHours !== null
                                ? `Total Accumulation (Partial: ${validHours}/${forecastHours}h)`
                                : 'Total Expected Accumulation'}
                            </span>
                            <span className="metric-value">
                              {!isTotalNull
                                ? `${rainfall.summary.total_precipitation_mm} mm`
                                : 'Unavailable'}
                            </span>
                          </div>

                          <div className="summary-metric">
                            <span className="metric-label">Peak 1-Hour Accumulation</span>
                            <span className="metric-value">
                              {rainfall.summary.max_hourly_precipitation_mm !== null
                                ? `${rainfall.summary.max_hourly_precipitation_mm} mm`
                                : 'Unavailable'}
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

                        {!isComplete && validHours !== null && (
                          <p className="summary-partial-note">
                            * Incomplete forecast: {forecastHours - validHours} of {forecastHours} hourly intervals were missing from upstream model output.
                          </p>
                        )}
                      </>
                    )
                  })()}
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
              <span className="error-icon" aria-hidden="true">
                <IconAlert size={18} />
              </span>
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
                  <div className="empty-check-icon icon-disc" aria-hidden="true">
                    <IconCheck size={20} />
                  </div>
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
                              <span>{isExpanded ? 'Hide Advisory Details' : 'Show Instructions & Details'}</span>
                              <IconChevron direction={isExpanded ? 'up' : 'down'} size={15} />
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
