import type { FC } from 'react'
import { Marker, Popup, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import type { SelectedLocation } from '../../types'

// ponytail: use custom SVG divIcons with A/B pins, distinct from hazard dots
const ORIGIN_ICON = L.divIcon({
  className: 'endpoint-marker-wrapper',
  html: `
    <div class="endpoint-pin endpoint-pin-origin" title="Origin (Start Location)">
      <svg width="28" height="38" viewBox="0 0 28 38" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M14 0C6.268 0 0 6.268 0 14c0 10.5 14 24 14 24s14-13.5 14-24c0-7.732-6.268-14-14-14z" fill="#10b981" stroke="#ffffff" stroke-width="2"/>
        <circle cx="14" cy="14" r="7.5" fill="#ffffff"/>
        <text x="14" y="17.5" font-size="11" font-weight="800" fill="#047857" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif">A</text>
      </svg>
    </div>
  `,
  iconSize: [28, 38],
  iconAnchor: [14, 38],
  popupAnchor: [0, -38],
})

const DESTINATION_ICON = L.divIcon({
  className: 'endpoint-marker-wrapper',
  html: `
    <div class="endpoint-pin endpoint-pin-destination" title="Destination (End Location)">
      <svg width="28" height="38" viewBox="0 0 28 38" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M14 0C6.268 0 0 6.268 0 14c0 10.5 14 24 14 24s14-13.5 14-24c0-7.732-6.268-14-14-14z" fill="#8b5cf6" stroke="#ffffff" stroke-width="2"/>
        <circle cx="14" cy="14" r="7.5" fill="#ffffff"/>
        <text x="14" y="17.5" font-size="11" font-weight="800" fill="#5b21b6" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif">B</text>
      </svg>
    </div>
  `,
  iconSize: [28, 38],
  iconAnchor: [14, 38],
  popupAnchor: [0, -38],
})

interface RouteEndpointMarkersProps {
  origin: SelectedLocation | null
  destination: SelectedLocation | null
  onMapClick: (coords: [number, number]) => void
}

export const RouteEndpointMarkers: FC<RouteEndpointMarkersProps> = ({
  origin,
  destination,
  onMapClick,
}) => {
  // Capture map clicks to assign coordinates to active target
  useMapEvents({
    click(e) {
      onMapClick([e.latlng.lat, e.latlng.lng])
    },
  })

  return (
    <>
      {origin && (
        <Marker
          position={origin.coordinates}
          icon={ORIGIN_ICON}
          eventHandlers={{
            click: (e) => {
              L.DomEvent.stopPropagation(e.originalEvent)
            },
          }}
        >
          <Popup className="varsha-endpoint-popup" maxWidth={260} minWidth={200}>
            <div className="endpoint-popup-card">
              <div className="endpoint-popup-badge endpoint-badge-origin">
                ORIGIN &bull; POINT A
              </div>
              <h4 className="endpoint-popup-title">{origin.label}</h4>
              <p className="endpoint-popup-coords">
                {origin.coordinates[0].toFixed(4)}° N, {origin.coordinates[1].toFixed(4)}° E
              </p>
              <p className="endpoint-popup-hint">Selected starting point for route planning</p>
            </div>
          </Popup>
        </Marker>
      )}

      {destination && (
        <Marker
          position={destination.coordinates}
          icon={DESTINATION_ICON}
          eventHandlers={{
            click: (e) => {
              L.DomEvent.stopPropagation(e.originalEvent)
            },
          }}
        >
          <Popup className="varsha-endpoint-popup" maxWidth={260} minWidth={200}>
            <div className="endpoint-popup-card">
              <div className="endpoint-popup-badge endpoint-badge-destination">
                DESTINATION &bull; POINT B
              </div>
              <h4 className="endpoint-popup-title">{destination.label}</h4>
              <p className="endpoint-popup-coords">
                {destination.coordinates[0].toFixed(4)}° N, {destination.coordinates[1].toFixed(4)}° E
              </p>
              <p className="endpoint-popup-hint">Selected destination point for route planning</p>
            </div>
          </Popup>
        </Marker>
      )}
    </>
  )
}

export default RouteEndpointMarkers
