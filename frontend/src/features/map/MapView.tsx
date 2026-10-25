import { useMemo, useRef, useState } from 'react'
import type { FC } from 'react'
import { MapContainer, Polyline, TileLayer } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import HazardMarkers from './HazardMarkers'
import RouteEndpointMarkers from './RouteEndpointMarkers'
import RouteSelector from './RouteSelector'
import { DEFAULT_SCENARIO_ID, getDemoScenario } from '../scenarios/scenarios.ts'
import type { DemoScenarioId } from '../scenarios/scenarios.ts'
import { fetchRoadRoutes } from '../routing/osrmService'
import { assessRoutesRisk } from '../routing/routeRiskAssessment.ts'
import type { RoadRoute, RouteEndpointType, RouteStatus, SelectedLocation } from '../../types'
import { IconChevron } from '../../components/Icons'
import './MapView.css'

// ponytail: default to central Navi Mumbai coordinates; props deferred until multiple pilot areas exist
const NAVI_MUMBAI_CENTER: [number, number] = [19.0330, 73.0297]
const DEFAULT_ZOOM = 12

export const MapView: FC = () => {
  const [origin, setOrigin] = useState<SelectedLocation | null>(null)
  const [destination, setDestination] = useState<SelectedLocation | null>(null)
  const [activeTarget, setActiveTarget] = useState<RouteEndpointType>('origin')
  const [isLegendOpen, setIsLegendOpen] = useState<boolean>(true)

  // Demo scenario state for differential risk comparison
  const [selectedScenarioId, setSelectedScenarioId] = useState<DemoScenarioId>(DEFAULT_SCENARIO_ID)

  // Routing state
  const [routes, setRoutes] = useState<RoadRoute[]>([])
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null)
  const [routeStatus, setRouteStatus] = useState<RouteStatus>('idle')
  const [routeError, setRouteError] = useState<string | null>(null)

  // In-flight request controller to prevent stale overwrites
  const activeRequestRef = useRef<AbortController | null>(null)

  const selectedRoute =
    routes.find((r) => r.id === selectedRouteId) ?? routes[0] ?? null

  const activeScenario = getDemoScenario(selectedScenarioId)
  const currentHazards = activeScenario.hazards

  // Memoized prototype risk assessment for each route; re-evaluates when routes or scenario hazards change
  const riskAssessments = useMemo(() => {
    return assessRoutesRisk(routes, currentHazards)
  }, [routes, currentHazards])

  // Check if both points exist and have identical coordinates
  const isIdentical = Boolean(
    origin &&
    destination &&
    Math.abs(origin.coordinates[0] - destination.coordinates[0]) < 0.0001 &&
    Math.abs(origin.coordinates[1] - destination.coordinates[1]) < 0.0001
  )

  const clearExistingRoute = () => {
    if (activeRequestRef.current) {
      activeRequestRef.current.abort()
      activeRequestRef.current = null
    }
    setRoutes([])
    setSelectedRouteId(null)
    setRouteStatus('idle')
    setRouteError(null)
  }

  const handleMapClick = (coords: [number, number]) => {
    // Invalidate stale route when endpoints change
    clearExistingRoute()

    const formattedLat = Number(coords[0].toFixed(6))
    const formattedLng = Number(coords[1].toFixed(6))

    if (activeTarget === 'origin') {
      setOrigin({
        label: `Pinned location (${formattedLat.toFixed(4)}, ${formattedLng.toFixed(4)})`,
        coordinates: [formattedLat, formattedLng],
      })
      // ponytail: fluid UX advances target to destination when destination unset
      if (!destination) {
        setActiveTarget('destination')
      }
    } else {
      setDestination({
        label: `Pinned location (${formattedLat.toFixed(4)}, ${formattedLng.toFixed(4)})`,
        coordinates: [formattedLat, formattedLng],
      })
      if (!origin) {
        setActiveTarget('origin')
      }
    }
  }

  const handleSelectOrigin = (location: SelectedLocation) => {
    clearExistingRoute()
    setOrigin(location)
    if (!destination) {
      setActiveTarget('destination')
    }
  }

  const handleSelectDestination = (location: SelectedLocation) => {
    clearExistingRoute()
    setDestination(location)
    if (!origin) {
      setActiveTarget('origin')
    }
  }

  const handleSwap = () => {
    clearExistingRoute()
    const prevOrigin = origin
    const prevDest = destination
    setOrigin(prevDest)
    setDestination(prevOrigin)
  }

  const handleClear = (target: RouteEndpointType) => {
    clearExistingRoute()
    if (target === 'origin') {
      setOrigin(null)
      setActiveTarget('origin')
    } else {
      setDestination(null)
      setActiveTarget('destination')
    }
  }

  const handlePlanRoute = async () => {
    if (!origin || !destination || isIdentical) {
      return
    }

    // Cancel in-flight request if user triggered again
    if (activeRequestRef.current) {
      activeRequestRef.current.abort()
    }

    const controller = new AbortController()
    activeRequestRef.current = controller

    setRouteStatus('loading')
    setRouteError(null)

    try {
      const results = await fetchRoadRoutes(origin.coordinates, destination.coordinates, controller.signal)
      if (controller.signal.aborted || activeRequestRef.current !== controller) {
        return
      }
      setRoutes(results)
      setSelectedRouteId(results[0]?.id ?? null)
      setRouteStatus('success')
    } catch (err: unknown) {
      if (controller.signal.aborted || activeRequestRef.current !== controller) {
        return
      }
      if (err instanceof DOMException && err.name === 'AbortError') {
        // Request cancelled by user action, ignore
        return
      }
      const message = err instanceof Error ? err.message : 'An unexpected error occurred while calculating route.'
      setRoutes([])
      setSelectedRouteId(null)
      setRouteStatus('error')
      setRouteError(message)
    } finally {
      if (activeRequestRef.current === controller) {
        activeRequestRef.current = null
      }
    }
  }

  return (
    <div className="map-view-wrapper" role="region" aria-label="Interactive map of Navi Mumbai with road route and simulated hazard markers">
      {/* Route Endpoint & OSRM Routing Controls */}
      <RouteSelector
        origin={origin}
        destination={destination}
        activeTarget={activeTarget}
        onSelectTarget={setActiveTarget}
        onSelectOrigin={handleSelectOrigin}
        onSelectDestination={handleSelectDestination}
        onSwap={handleSwap}
        onClear={handleClear}
        isIdentical={isIdentical}
        routes={routes}
        selectedRouteId={selectedRoute?.id ?? null}
        onSelectRoute={setSelectedRouteId}
        routeStatus={routeStatus}
        routeError={routeError}
        onPlanRoute={handlePlanRoute}
        onClearRoute={clearExistingRoute}
        riskAssessments={riskAssessments}
        selectedScenarioId={selectedScenarioId}
        onSelectScenario={setSelectedScenarioId}
      />

      {/* Interactive Map with Route Polylines, Hazards and Endpoints */}
      <div className="map-frame card-inset">
        <MapContainer
          center={NAVI_MUMBAI_CENTER}
          zoom={DEFAULT_ZOOM}
          scrollWheelZoom={false}
          className="varsha-leaflet-container"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors'
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {/* Unselected Alternative Routes (rendered first, below active route) */}
          {routes
            .filter((r) => r.id !== selectedRoute?.id)
            .map((altRoute) => (
              <Polyline
                key={altRoute.id}
                positions={altRoute.coordinates}
                pathOptions={{
                  color: '#64748b',
                  weight: 4,
                  opacity: 0.6,
                  lineCap: 'round',
                  lineJoin: 'round',
                  dashArray: '8, 8',
                }}
                eventHandlers={{
                  click: () => {
                    setSelectedRouteId(altRoute.id)
                  },
                }}
              />
            ))}

          {/* Selected / Active Road Route Polyline */}
          {selectedRoute && (
            <Polyline
              key={selectedRoute.id}
              positions={selectedRoute.coordinates}
              pathOptions={{
                color: '#2563eb',
                weight: 6,
                opacity: 0.95,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
          )}

          <HazardMarkers hazards={currentHazards} />
          <RouteEndpointMarkers
            origin={origin}
            destination={destination}
            onMapClick={handleMapClick}
          />
        </MapContainer>

        {/* Collapsible Floating Legend Pill Overlay */}
        <div
          className={`map-legend-overlay ${isLegendOpen ? 'legend-open' : 'legend-collapsed'}`}
          aria-label="Map symbols legend"
        >
          <button
            type="button"
            className="btn-legend-toggle"
            onClick={() => setIsLegendOpen((prev) => !prev)}
            aria-expanded={isLegendOpen}
            aria-label="Toggle map symbols legend"
          >
            <span className="legend-toggle-indicator" aria-hidden="true" />
            <span className="legend-toggle-text">Legend</span>
            <IconChevron direction={isLegendOpen ? 'down' : 'up'} size={12} />
          </button>

          {isLegendOpen && (
            <div className="legend-popover-content">
              <div className="legend-group">
                <span className="legend-title">Route Elements:</span>
                <div className="legend-items">
                  <span className="legend-item">
                    <span className="legend-pin-badge legend-pin-origin" aria-hidden="true">A</span>
                    <span>Origin (Start)</span>
                  </span>
                  <span className="legend-item">
                    <span className="legend-pin-badge legend-pin-dest" aria-hidden="true">B</span>
                    <span>Destination (End)</span>
                  </span>
                  <span className="legend-item">
                    <span className="legend-route-line" aria-hidden="true" />
                    <span>Selected Route</span>
                  </span>
                  {routes.length > 1 && (
                    <span className="legend-item">
                      <span className="legend-route-line legend-route-alt" aria-hidden="true" />
                      <span>Alternative Route</span>
                    </span>
                  )}
                </div>
              </div>

              <div className="legend-group">
                <span className="legend-title">Simulated Hazards:</span>
                <div className="legend-items">
                  <span className="legend-item">
                    <span className="legend-dot legend-dot-high" aria-hidden="true" />
                    <span>High</span>
                  </span>
                  <span className="legend-item">
                    <span className="legend-dot legend-dot-medium" aria-hidden="true" />
                    <span>Medium</span>
                  </span>
                  <span className="legend-item">
                    <span className="legend-dot legend-dot-low" aria-hidden="true" />
                    <span>Low</span>
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
export default MapView
