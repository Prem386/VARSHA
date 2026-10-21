import type { FC } from 'react'
import { MapContainer, TileLayer } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import './MapView.css'

// ponytail: default to central Navi Mumbai coordinates; props deferred until multiple pilot areas exist
const NAVI_MUMBAI_CENTER: [number, number] = [19.0330, 73.0297]
const DEFAULT_ZOOM = 12

export const MapView: FC = () => {
  return (
    <div className="map-view-wrapper" role="region" aria-label="Interactive map of Navi Mumbai">
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
      </MapContainer>
    </div>
  )
}

export default MapView
