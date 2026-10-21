import type { FC } from 'react'
import { Marker, Popup } from 'react-leaflet'
import L from 'leaflet'
import type { HazardLocation, HazardSeverity } from '../../types'
import { SIMULATED_HAZARDS } from './hazardData'

// ponytail: use L.divIcon with CSS instead of external image assets to avoid bundling issues
const ICONS: Record<HazardSeverity, L.DivIcon> = {
  low: L.divIcon({
    className: 'hazard-marker-wrapper',
    html: '<span class="hazard-pin hazard-pin-low" title="Low Severity Simulated Hazard" aria-label="Low Severity Hazard"><span class="hazard-pin-pulse"></span><span class="hazard-pin-dot"></span></span>',
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    popupAnchor: [0, -12],
  }),
  medium: L.divIcon({
    className: 'hazard-marker-wrapper',
    html: '<span class="hazard-pin hazard-pin-medium" title="Medium Severity Simulated Hazard" aria-label="Medium Severity Hazard"><span class="hazard-pin-pulse"></span><span class="hazard-pin-dot"></span></span>',
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    popupAnchor: [0, -12],
  }),
  high: L.divIcon({
    className: 'hazard-marker-wrapper',
    html: '<span class="hazard-pin hazard-pin-high" title="High Severity Simulated Hazard" aria-label="High Severity Hazard"><span class="hazard-pin-pulse"></span><span class="hazard-pin-dot"></span></span>',
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -12],
  }),
}

const formatHazardType = (type: string): string => {
  switch (type) {
    case 'waterlogging':
      return 'Waterlogging'
    case 'flooded_underpass':
      return 'Flooded Underpass'
    case 'submerged_road':
      return 'Submerged Road'
    case 'traffic_obstruction':
      return 'Traffic Obstruction'
    default:
      return type.replace(/_/g, ' ')
  }
}

interface HazardMarkersProps {
  hazards?: HazardLocation[]
}

export const HazardMarkers: FC<HazardMarkersProps> = ({ hazards = SIMULATED_HAZARDS }) => {
  return (
    <>
      {hazards.map((hazard) => (
        <Marker
          key={hazard.id}
          position={hazard.coordinates}
          icon={ICONS[hazard.severity]}
          eventHandlers={{
            click: (e) => {
              // ponytail: stop propagation so hazard clicks do not trigger origin/destination map selection
              L.DomEvent.stopPropagation(e.originalEvent)
            },
          }}
        >
          <Popup className="varsha-hazard-popup" maxWidth={300} minWidth={240}>
            <div className="hazard-popup-card">
              <div className="hazard-popup-header">
                <span className={`hazard-severity-tag severity-${hazard.severity}`}>
                  {hazard.severity.toUpperCase()} SEVERITY
                </span>
                <span className="hazard-simulated-badge">SIMULATED DATA</span>
              </div>

              <h4 className="hazard-popup-title">{hazard.name}</h4>
              <p className="hazard-popup-area">{hazard.area}</p>

              <div className="hazard-popup-info-grid">
                <div className="hazard-info-item">
                  <span className="hazard-info-label">Hazard Type</span>
                  <span className="hazard-info-val">{formatHazardType(hazard.hazardType)}</span>
                </div>
                <div className="hazard-info-item">
                  <span className="hazard-info-label">Coordinates</span>
                  <span className="hazard-info-val">
                    {hazard.coordinates[0].toFixed(4)}° N, {hazard.coordinates[1].toFixed(4)}° E
                  </span>
                </div>
              </div>

              <p className="hazard-popup-description">{hazard.description}</p>

              <div className="hazard-popup-footer">
                <span className="hazard-footer-icon" aria-hidden="true">⚠️</span>
                <span>Illustrative scenario for testing &bull; Not a verified live incident</span>
              </div>
            </div>
          </Popup>
        </Marker>
      ))}
    </>
  )
}

export default HazardMarkers
