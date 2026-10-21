import type { FC } from 'react'
import MapView from './features/map/MapView'
import './App.css'

const App: FC = () => {
  return (
    <div className="varsha-app">
      <header className="varsha-header">
        <div className="header-meta">
          <span className="badge badge-accent">MY Bharat Hackathon</span>
          <span className="badge badge-subtle">Phase 3 &bull; Route Comparison (OSRM)</span>
          <span className="badge badge-pilot">Pilot: Navi Mumbai</span>
        </div>

        <div className="logo-container">
          <div className="logo-icon" aria-hidden="true">🌧️</div>
          <h1 className="project-title">VARSHA</h1>
        </div>

        <p className="project-subtitle">
          Predictive Monsoon Mobility &amp; Route Safety System
        </p>
      </header>

      <main className="varsha-main">
        {/* Hero Banner */}
        <section className="hero-card" aria-labelledby="tagline-heading">
          <h2 id="tagline-heading" className="hero-heading">
            Don&apos;t just find the fastest route. Find the safer one.
          </h2>
          <p className="hero-description">
            During heavy monsoon rainfall in Navi Mumbai, commuters routinely face waterlogged
            arterials, submerged underpasses, and severe transit delays. VARSHA empowers road
            travelers to compare alternative routes based on travel duration alongside transparent,
            monsoon-related hazard reporting.
          </p>

          <div className="status-notice" role="status">
            <span className="status-dot" aria-hidden="true"></span>
            <div>
              <strong>Simulated Data Notice:</strong> All hazard locations and route risk assessments
              in this prototype are simulated for technical testing and civic validation.
              VARSHA does not claim real-time flood accuracy or guarantee road safety.
            </div>
          </div>
        </section>

        {/* Map Section */}
        <section className="map-placeholder-section" aria-labelledby="map-section-heading">
          <div className="section-header-row">
            <div>
              <h3 id="map-section-heading" className="section-title">
                Interactive Route &amp; Hazard Map
              </h3>
              <p className="section-subtitle">
                Pilot Area: Navi Mumbai (19.0330&deg; N, 73.0297&deg; E) &bull; Select origin &amp; destination on map
              </p>
            </div>
            <span className="phase-indicator">OSRM Routing &amp; Hazards Active</span>
          </div>

          <MapView />

          <p className="map-status-note">
            Simulated hazard markers active. All marker coordinates, hazard types, and severity ratings are illustrative scenarios for technical prototype evaluation and do not represent verified live incidents, official government warnings, or road safety guarantees.
          </p>
        </section>

        {/* Features / Information Grid */}
        <section className="info-grid" aria-label="Core Capabilities">
          <article className="info-card">
            <div className="card-icon" aria-hidden="true">📍</div>
            <h4 className="card-title">Navi Mumbai Pilot Focus</h4>
            <p className="card-text">
              Targeted monitoring for critical transit nodes across Vashi, Airoli, Belapur,
              and Kharghar, focusing on flood-prone underpasses and low-lying coastal links.
            </p>
          </article>

          <article className="info-card">
            <div className="card-icon" aria-hidden="true">⚠️</div>
            <h4 className="card-title">Simulated Monsoon Hazards</h4>
            <p className="card-text">
              Clearly marked synthetic flood reports, waterlogging severity indicators,
              and obstruction tags designed to test community safety workflows responsibly.
            </p>
          </article>

          <article className="info-card">
            <div className="card-icon" aria-hidden="true">🛡️</div>
            <h4 className="card-title">Explainable Safety Scoring</h4>
            <p className="card-text">
              Transparent, rule-based risk evaluation that details why an alternative route
              is considered safer, prioritizing commuter resilience over pure speed.
            </p>
          </article>
        </section>
      </main>

      <footer className="varsha-footer">
        <p>
          VARSHA &bull; Predictive Monsoon Mobility &amp; Route Safety System &bull; React + Vite + TypeScript Foundation
        </p>
        <p className="footer-hackathon">
          Developed for MY Bharat — Hack for Social Cause Hackathon
        </p>
      </footer>
    </div>
  )
}

export default App
