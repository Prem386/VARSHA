# VARSHA

**Predictive Monsoon Mobility & Route Safety System**

Don't just find the fastest route. Find the safer one.

## Overview
VARSHA is a web application designed to help commuters make better-informed travel decisions during heavy rainfall, waterlogging, and urban flooding, initially focusing on Mumbai and Navi Mumbai.

## Planned Technology Stack
- React + Vite
- TypeScript
- Tailwind CSS
- React Leaflet + OpenStreetMap
- Python + FastAPI
- Firebase
- Weather data from suitable verified APIs
- Progressive Web App (PWA) capabilities

## Initial Prototype
- Interactive map
- Starting point and destination selection
- Alternative route display
- Simulated hazard locations, clearly labelled
- Explainable route-risk comparison

## Development Status
- **Phase 1-4 (Complete)**: React + Vite + TypeScript frontend with interactive map, alternative routing, simulated hazard markers, hazard proximity analysis, and explainable risk scoring (46 passing tests).
- **Phase 5.2 (Complete)**: FastAPI backend foundation (`backend/`) establishing project structure, configuration, CORS, geographic schemas, health checking, and test suite.
- **Phase 5.3B (Complete)**: NDMA SACHET disaster alert provider (`backend/app/services/alerts/sachet.py`), normalized CAP 1.2 models (`backend/app/schemas/alerts.py`), in-memory TTL caching with stale-fallback, and `GET /api/v1/alerts` endpoint (44 passing tests).
- **Phase 5.4+ (Upcoming)**: Open-Meteo rainfall forecast provider, live hazard evaluation, frontend integration.

## Repository Structure
- `frontend/` — React, Vite, TypeScript, React Leaflet, OpenStreetMap, OSRM routing interface.
- `backend/` — Python FastAPI backend with NDMA SACHET alert adapter, in-memory TTL cache, geographic models, and test suite.

## Local Setup & Development

### Prerequisites
- Node.js (v18+ recommended) and npm (v9+)
- Python (3.10+ recommended, tested on Python 3.13)

### Frontend Setup & Commands
```bash
# Navigate to frontend
cd frontend

# Install dependencies
npm install

# Run frontend tests
npm test

# Start local development server
npm run dev

# Compile TypeScript and build for production
npm run build

# Preview production build locally
npm run preview
```

### Backend Setup & Commands
```powershell
# Navigate to backend
cd backend

# Create virtual environment
python -m venv .venv

# Activate virtual environment (Windows PowerShell)
.\.venv\Scripts\Activate.ps1

# Install dependencies
pip install -r requirements.txt

# Run backend automated tests
pytest tests -v

# Start local FastAPI development server
uvicorn app.main:app --reload --port 8000
```

### Feed Configuration
Configure the alert feed in `backend/.env` (or environment variables):
```env
# Official nationwide RSS feed (default)
SACHET_FEED_URL=https://sachet.ndma.gov.in/cap_public_website/rss/rss_india.xml

# Or state-specific feed (e.g. Maharashtra):
# SACHET_FEED_URL=https://sachet.ndma.gov.in/cap_public_website/rss/rss_maharashtra.xml

SACHET_REQUEST_TIMEOUT_SECONDS=10.0
SACHET_CACHE_TTL_SECONDS=300
SACHET_MAX_ALERTS_PER_FETCH=20
```

### Local API Endpoints
- **Health Check**: `GET http://localhost:8000/api/v1/health`
- **Disaster Alerts**: `GET http://localhost:8000/api/v1/alerts`
- **Filtered Alerts by BBox**: `GET http://localhost:8000/api/v1/alerts?bbox=72.8,18.9,73.1,19.2&active_only=true`
- **Interactive API Docs (Swagger UI)**: `http://localhost:8000/docs`
- **Alternative API Docs (ReDoc)**: `http://localhost:8000/redoc`
- **OpenAPI Schema**: `GET http://localhost:8000/api/v1/openapi.json`

### Endpoint Example (`GET /api/v1/alerts`)
```json
{
  "provider": {
    "provider": "ndma_sachet",
    "status": "ok",
    "is_cached": false,
    "is_stale": false,
    "retrieved_at": "2026-10-23T15:15:00Z",
    "error_message": null,
    "feed_url": "https://sachet.ndma.gov.in/cap_public_website/rss/rss_india.xml"
  },
  "total": 1,
  "alerts": [
    {
      "provider": "ndma_sachet",
      "identifier": "IN-MH-2026-001",
      "sender": "in-imd-mumbai",
      "status": "Actual",
      "msg_type": "Alert",
      "category": "Met",
      "event": "Flash Flood",
      "headline": "Flash Flood Warning for Thane",
      "severity": "Severe",
      "urgency": "Expected",
      "certainty": "Likely",
      "is_active": true,
      "language": "en-IN",
      "area_description": "Thane District, Maharashtra",
      "geocodes": [{"value_name": "LGD", "value": "496"}],
      "geometry_type": "unresolved",
      "has_spatial_geometry": false
    }
  ],
  "spatial_filter_applied": false,
  "spatial_filter_note": null
}
```

### Provider Failure & Staleness Semantics
Clients distinguish four distinct states via `provider` metadata:
1. **Successful retrieval with alerts**: `provider.status == "ok"`, `total > 0`, `is_stale == false`.
2. **Successful retrieval with zero alerts**: `provider.status == "ok"`, `total == 0`, `is_stale == false` (indicates upstream feed has 0 active alerts).
3. **Stale cache fallback (degraded)**: `provider.status == "degraded"`, `is_stale == true` (upstream unreachable/timed out, but prior cache is served with non-sensitive error description).
4. **Provider unavailable (cold start)**: `provider.status == "unavailable"`, `total == 0`, `is_stale == false` (upstream unreachable and no cache exists). **Never interpreted as zero hazards.**

### Limitations of SACHET Alerts & Geographic Precision
1. **District-Level Resolution**: Most SACHET CAP alerts contain textual district descriptions and LGD codes rather than inline polygons.
2. **No Point Hazard Fabrications**: The system explicitly does **not** invent approximate centroids, bounding boxes, or street-level coordinates for district-only alerts.
3. **Spatial Bounding-Box Filtering**: Spatial `bbox` filtering matches alerts that possess verified geometry (`has_spatial_geometry: true`). Unresolved district-level alerts cannot be geometrically placed and are excluded from coordinate-level bbox matches to prevent false positives.
4. **Single-Process Cache**: In-memory cache is single-process and in-memory. Cache resets on server restarts and is not shared across multi-process workers.

## Features Not Yet Implemented (Phase Scope Boundaries)
- Live weather/precipitation provider feeds (Open-Meteo)
- Persistent database storage layer
- Backend route risk scoring integration with live alerts
