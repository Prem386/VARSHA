import { useState } from 'react'
import type { FC } from 'react'
import { MapContainer, TileLayer } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import HazardMarkers from './HazardMarkers'
import RouteEndpointMarkers from './RouteEndpointMarkers'
import RouteSelector from './RouteSelector'
import type { RouteEndpointType, SelectedLocation } from '../../types'
import './MapView.css'

// ponytail: default to central Navi Mumbai coordinates; props deferred until multiple pilot areas exist
const NAVI_MUMBAI_CENTER: [number, number] = [19.0330, 73.0297]
const DEFAULT_ZOOM = 12

export const MapView: FC = () => {
  const [origin, setOrigin] = useState<SelectedLocation | null>(null)
  const [destination, setDestination] = useState<SelectedLocation | null>(null)
  const [activeTarget, setActiveTarget] = useState<RouteEndpointType>('origin')

  // Check if both points exist and have identical coordinates
  const isIdentical = Boolean(
    origin &&
    destination &&
    Math.abs(origin.coordinates[0] - destination.coordinates[0]) < 0.0001 &&
    Math.abs(origin.coordinates[1] - destination.coordinates[1]) < 0.0001
  )

  const handleMapClick = (coords: [number, number]) => {
    const formattedLat = Number(coords[0].toFixed(6))
    const formattedLng = Number(coords[1].toFixed(6))

    if (activeTarget === 'origin') {
      setOrigin({
        label: 'Origin (Point A)',
        coordinates: [formattedLat, formattedLng],
      })
      // ponytail: fluid UX advances target to destination when destination unset
      if (!destination) {
        setActiveTarget('destination')
      }
    } else {
      setDestination({
        label: 'Destination (Point B)',
        coordinates: [formattedLat, formattedLng],
      })
      if (!origin) {
        setActiveTarget('origin')
      }
    }
  }

  const handleSwap = () => {
    const prevOrigin = origin
    const prevDest = destination
    setOrigin(prevDest ? { ...prevDest, label: 'Origin (Point A)' } : null)
    setDestination(prevOrigin ? { ...prevOrigin, label: 'Destination (Point B)' } : null)
  }

  const handleClear = (target: RouteEndpointType) => {
    if (target === 'origin') {
      setOrigin(null)
      setActiveTarget('origin')
    } else {
      setDestination(null)
      setActiveTarget('destination')
    }
  }

  return (
    <div className="map-view-wrapper" role="region" aria-label="Interactive map of Navi Mumbai with route endpoints and simulated hazard markers">
      {/* Route Endpoint Selector Controls */}
      <RouteSelector
        origin={origin}
        destination={destination}
        activeTarget={activeTarget}
        onSelectTarget={setActiveTarget}
        onSwap={handleSwap}
        onClear={handleClear}
        isIdentical={isIdentical}
      />

      {/* Interactive Map with Hazards and Endpoints */}
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
        <HazardMarkers />
        <RouteEndpointMarkers
          origin={origin}
          destination={destination}
          onMapClick={handleMapClick}
        />
      </MapContainer>

      {/* Comprehensive Legend */}
      <div className="map-legend-bar" aria-label="Map symbols legend">
        <div className="legend-group">
          <span className="legend-title">Route Endpoints:</span>
          <div className="legend-items">
            <span className="legend-item">
              <span className="legend-pin-badge legend-pin-origin" aria-hidden="true">A</span>
              <span>Origin (Start)</span>
            </span>
            <span className="legend-item">
              <span className="legend-pin-badge legend-pin-dest" aria-hidden="true">B</span>
              <span>Destination (End)</span>
            </span>
          </div>
        </div>

        <div className="legend-group">
          <span className="legend-title">Simulated Hazards:</span>
          <div className="legend-items">
            <span className="legend-item">
              <span className="legend-dot legend-dot-high" aria-hidden="true"></span>
              <span>High</span>
            </span>
            <span className="legend-item">
              <span className="legend-dot legend-dot-medium" aria-hidden="true"></span>
              <span>Medium</span>
            </span>
            <span className="legend-item">
              <span className="legend-dot legend-dot-low" aria-hidden="true"></span>
              <span>Low</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default MapView
