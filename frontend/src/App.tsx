import { useCallback, useEffect, useState } from 'react'
import type { FC } from 'react'
import MapView from './features/map/MapView'
import WeatherAlertsCard from './features/weather/WeatherAlertsCard'
import type { AlertListResponse, RainfallResponse } from './types'
import {
  IconRain,
  IconAlert,
  IconRefresh,
  IconInfo,
  IconClose,
  IconChevron,
} from './components/Icons'
import {
  fetchRainfallForecast,
  fetchOfficialAlerts,
} from './features/weather/weatherService'
import './App.css'

export const App: FC = () => {
  const [rainSummary, setRainSummary] = useState<string>('0 mm/hr · Clear')
  const [alertCount, setAlertCount] = useState<number>(0)
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false)
  const [weatherOpen, setWeatherOpen] = useState<boolean>(false)
  const [aboutOpen, setAboutOpen] = useState<boolean>(false)
  const [rainfallData, setRainfallData] = useState<RainfallResponse | null>(null)
  const [alertsData, setAlertsData] = useState<AlertListResponse | null>(null)

  const updateSummaryMetrics = useCallback(
    (rain: RainfallResponse | null, alerts: AlertListResponse | null) => {
      if (rain?.current) {
        const mm = rain.current.precipitation_mm ?? 0
        const desc =
          mm > 15
            ? 'Heavy rain'
            : mm > 5
            ? 'Moderate rain'
            : mm > 0.5
            ? 'Light rain'
            : 'Clear'
        // ponytail: current.precipitation_mm = 15-min model accumulation, NOT a rate — label accordingly
        setRainSummary(`${mm.toFixed(1)} mm (15m) · ${desc}`)
      }
      if (alerts) {
        setAlertCount(alerts.total ?? 0)
      }
    },
    []
  )

  const loadStatusData = useCallback(async () => {
    setIsRefreshing(true)
    try {
      const [rainResult, alertsResult] = await Promise.allSettled([
        fetchRainfallForecast(),
        fetchOfficialAlerts(true),
      ])

      const freshRain = rainResult.status === 'fulfilled' ? rainResult.value : null
      const freshAlerts = alertsResult.status === 'fulfilled' ? alertsResult.value : null

      if (freshRain) setRainfallData(freshRain)
      if (freshAlerts) setAlertsData(freshAlerts)

      updateSummaryMetrics(freshRain, freshAlerts)
    } catch {
      // Keep sensible fallbacks
    } finally {
      setIsRefreshing(false)
    }
  }, [updateSummaryMetrics])

  const handleCardDataRefreshed = useCallback(
    (freshRain: RainfallResponse, freshAlerts: AlertListResponse) => {
      setRainfallData(freshRain)
      setAlertsData(freshAlerts)
      updateSummaryMetrics(freshRain, freshAlerts)
    },
    [updateSummaryMetrics]
  )

  useEffect(() => {
    loadStatusData()
  }, [loadStatusData])

  // Handle escape key to dismiss open modals/drawers
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setWeatherOpen(false)
        setAboutOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <div className="varsha-app-container">
      {/* 56px Top Status Strip */}
      <header className="status-strip" role="banner">
        <div className="status-strip-left">
          <div className="varsha-brand">
            <span className="brand-wordmark">VARSHA</span>
          </div>
          <span className="pilot-chip" aria-label="Pilot Area">
            Pilot: Navi Mumbai
          </span>
        </div>

        <div className="status-strip-right">
          <button
            type="button"
            className="strip-chip-btn rain-chip"
            onClick={() => setWeatherOpen(true)}
            title="View precipitation forecast"
            aria-label={`Rain forecast: ${rainSummary}. Click to open weather forecast`}
          >
            <IconRain size={16} />
            <span className="chip-label">{rainSummary}</span>
            <span className="mobile-status-dot rain-dot" aria-hidden="true" />
          </button>

          <button
            type="button"
            className="strip-chip-btn alerts-chip"
            onClick={() => setWeatherOpen(true)}
            title="View official disaster alerts"
            aria-label={`Official alerts: ${alertCount} active. Click to view alerts`}
          >
            <IconAlert size={16} />
            <span className="chip-label">
              {alertCount > 0 ? `${alertCount} alert${alertCount > 1 ? 's' : ''}` : '0 active'}
            </span>
            {alertCount > 0 && (
              <span className="alerts-badge-count" aria-hidden="true">{alertCount}</span>
            )}
          </button>

          <button
            type="button"
            className={`strip-icon-btn ${isRefreshing ? 'is-spinning' : ''}`}
            onClick={loadStatusData}
            title="Refresh weather and alerts data"
            aria-label="Refresh live data"
            disabled={isRefreshing}
          >
            <IconRefresh size={16} />
          </button>

          <button
            type="button"
            className="strip-icon-btn strip-about-btn"
            onClick={() => setAboutOpen(true)}
            title="About VARSHA & prototype disclaimer"
            aria-label="Open About drawer"
          >
            <IconInfo size={16} />
            <span className="about-text-label">About</span>
          </button>
        </div>
      </header>

      {/* Main 2-Panel View (Desktop 380px panel + 1fr Map) */}
      <main className="varsha-main-content">
        <MapView />
      </main>

      {/* 40px Persistent Disclaimer Strip */}
      <footer
        className="persistent-disclaimer-strip"
        role="contentinfo"
        onClick={() => setAboutOpen(true)}
      >
        <span className="disclaimer-strip-text">
          Simulated data prototype &bull; Navi Mumbai pilot &bull; Not for emergency navigation &bull;{' '}
          <button
            type="button"
            className="disclaimer-learn-more"
            onClick={(e) => {
              e.stopPropagation()
              setAboutOpen(true)
            }}
          >
            Learn more
          </button>
        </span>
      </footer>

      {/* Weather & Alerts Popover / Sheet */}
      {weatherOpen && (
        <div
          className="popover-backdrop"
          onClick={() => setWeatherOpen(false)}
          role="presentation"
        >
          <div
            className="weather-popover-card panel"
            role="dialog"
            aria-modal="true"
            aria-label="Monsoon Forecast & Alerts"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="popover-header">
              <div className="popover-title-group">
                <span className="icon-disc" aria-hidden="true">
                  <IconRain size={18} />
                </span>
                <div>
                  <h3 className="popover-title">Monsoon Forecast &amp; Alerts</h3>
                  <p className="popover-subtitle">Numerical weather prediction &amp; NDMA SACHET alerts</p>
                </div>
              </div>
              <button
                type="button"
                className="btn-close-modal"
                onClick={() => setWeatherOpen(false)}
                aria-label="Close weather popover"
              >
                <IconClose size={16} />
              </button>
            </div>

            <div className="popover-body">
              <WeatherAlertsCard
                initialRainfall={rainfallData}
                initialAlerts={alertsData}
                onDataRefreshed={handleCardDataRefreshed}
              />
            </div>
          </div>
        </div>
      )}

      {/* About Drawer */}
      {aboutOpen && (
        <div
          className="drawer-backdrop"
          onClick={() => setAboutOpen(false)}
          role="presentation"
        >
          <div
            className="about-drawer-panel panel"
            role="dialog"
            aria-modal="true"
            aria-label="About VARSHA"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="drawer-header">
              <div>
                <h2 className="drawer-title">About VARSHA</h2>
                <p className="drawer-subtitle">
                  Predictive Monsoon Mobility &amp; Route Safety System
                </p>
              </div>
              <button
                type="button"
                className="btn-close-modal"
                onClick={() => setAboutOpen(false)}
                aria-label="Close about drawer"
              >
                <IconClose size={18} />
              </button>
            </div>

            <div className="drawer-body">
              {/* Simulated Data Disclaimer Notice */}
              <div className="drawer-disclaimer-card well" role="status">
                <div className="disclaimer-card-header">
                  <span className="status-dot" aria-hidden="true">
                    <IconAlert size={14} />
                  </span>
                  <strong>Simulated Data Notice</strong>
                </div>
                <p className="disclaimer-card-text">
                  All hazard locations, risk scores, and route assessments in this prototype are
                  simulated for technical testing and civic validation. VARSHA does not claim
                  real-time flood accuracy or guarantee road safety.
                </p>
              </div>

              {/* 3 Interactive Accordions */}
              <div className="drawer-accordions-group">
                <details className="drawer-accordion" open>
                  <summary className="drawer-accordion-summary">
                    <span className="summary-title">Navi Mumbai Pilot Focus</span>
                    <span className="summary-chevron" aria-hidden="true">
                      <IconChevron direction="down" size={14} />
                    </span>
                  </summary>
                  <div className="drawer-accordion-content">
                    <p>
                      Targeted monitoring for critical transit nodes across Vashi, Airoli, Belapur,
                      and Kharghar, focusing on flood-prone underpasses and low-lying coastal links.
                    </p>
                    <p className="drawer-subtext">
                      Navi Mumbai was chosen for its high commuter density, vulnerable monsoon
                      chokepoints (such as the Turbhe Underpass and Kopar Khairane creek channels),
                      and distinct alternative corridors (Palm Beach Road vs. Thane-Belapur Highway).
                    </p>
                  </div>
                </details>

                <details className="drawer-accordion">
                  <summary className="drawer-accordion-summary">
                    <span className="summary-title">Simulated Monsoon Hazards</span>
                    <span className="summary-chevron" aria-hidden="true">
                      <IconChevron direction="down" size={14} />
                    </span>
                  </summary>
                  <div className="drawer-accordion-content">
                    <p>
                      Clearly marked synthetic flood reports, waterlogging severity indicators,
                      and obstruction tags designed to test community safety workflows responsibly.
                    </p>
                    <p className="drawer-subtext">
                      Hazard pins carry High, Medium, or Low severity ratings with proximity decay
                      models. They test how commuter interfaces can prioritize safer detour choices
                      without inducing panic.
                    </p>
                  </div>
                </details>

                <details className="drawer-accordion">
                  <summary className="drawer-accordion-summary">
                    <span className="summary-title">Explainable Safety Scoring</span>
                    <span className="summary-chevron" aria-hidden="true">
                      <IconChevron direction="down" size={14} />
                    </span>
                  </summary>
                  <div className="drawer-accordion-content">
                    <p>
                      Transparent, rule-based risk evaluation that details why an alternative route
                      is considered safer, prioritizing commuter resilience over pure speed.
                    </p>
                    <p className="drawer-subtext">
                      Every route receives a 0–100 risk score based on hazard severity and distance
                      within a 100m proximity threshold. Users can expand the breakdown on any route
                      to see the exact hazards and points calculated.
                    </p>
                  </div>
                </details>
              </div>

              {/* Data Sources & Attribution */}
              <div className="drawer-sources-section">
                <h4 className="sources-title">Data Sources &amp; Attribution</h4>
                <div className="sources-grid">
                  <div className="source-item well">
                    <span className="source-label">Base Map &amp; Roads</span>
                    <span className="source-value">OpenStreetMap contributors</span>
                  </div>
                  <div className="source-item well">
                    <span className="source-label">Weather Prediction</span>
                    <span className="source-value">Open-Meteo NWP API</span>
                  </div>
                  <div className="source-item well">
                    <span className="source-label">Disaster Warnings</span>
                    <span className="source-value">NDMA SACHET (CAP 1.2)</span>
                  </div>
                  <div className="source-item well">
                    <span className="source-label">Routing Engine</span>
                    <span className="source-value">OSRM Road Router</span>
                  </div>
                  <div className="source-item well">
                    <span className="source-label">Forward Geocoding</span>
                    <span className="source-value">Geoapify Places API</span>
                  </div>
                </div>
              </div>

              {/* Hackathon Credits */}
              <div className="drawer-footer-credits">
                <span className="badge badge-accent">MY Bharat Hackathon</span>
                <p className="credit-text">
                  Built for the <em>MY Bharat &mdash; Hack for Social Cause Hackathon</em>.
                  Phase 4: Route Risk Comparison &amp; Monsoon Mobility Resilience.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
