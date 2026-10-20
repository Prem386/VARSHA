import './App.css'

function App() {
  return (
    <div className="varsha-app">
      <header className="varsha-header">
        <div className="header-badge">Hackathon Prototype &bull; Phase 1</div>
        <div className="logo-container">
          <div className="logo-icon">🌧️</div>
          <h1 className="project-title">VARSHA</h1>
        </div>
        <p className="project-subtitle">
          Predictive Monsoon Mobility &amp; Route Safety System
        </p>
      </header>

      <main className="varsha-main">
        <section className="hero-card">
          <h2 className="hero-heading">Don&apos;t just find the fastest route. Find the safer one.</h2>
          <p className="hero-description">
            VARSHA is designed to assist commuters in navigating road travel during heavy rainfall,
            waterlogging, and urban flooding scenarios in the Mumbai and Navi Mumbai region.
            The platform will allow travelers to evaluate routes based on travel time alongside
            monsoon-specific hazards such as flooded underpasses, submerged low-lying roads, and
            bottlenecks.
          </p>

          <div className="status-notice">
            <span className="status-indicator"></span>
            <div>
              <strong>Development Notice:</strong> Initial prototype setup is currently underway.
              Interactive mapping, road routing, and hazard scoring will be introduced in upcoming phases.
              <em> No live hazard or real-time weather information is active in this phase.</em>
            </div>
          </div>
        </section>

        <section className="info-grid">
          <div className="info-card">
            <div className="card-icon">🗺️</div>
            <h3>Regional Focus</h3>
            <p>
              Targeting major arterial corridors, flood-prone underpasses, and coastal routes
              across Mumbai and Navi Mumbai.
            </p>
          </div>

          <div className="info-card">
            <div className="card-icon">⚠️</div>
            <h3>Hazard Awareness</h3>
            <p>
              Future phases will simulate and integrate road hazard markers including waterlogging,
              pothole zones, and flooded junctions.
            </p>
          </div>

          <div className="info-card">
            <div className="card-icon">⚖️</div>
            <h3>Safety-Aware Comparison</h3>
            <p>
              Compare standard navigation times with an explainable route safety score to make informed,
              resilient travel choices.
            </p>
          </div>
        </section>
      </main>

      <footer className="varsha-footer">
        <p>&copy; {new Date().getFullYear()} VARSHA &bull; Built with React + Vite</p>
      </footer>
    </div>
  )
}

export default App
