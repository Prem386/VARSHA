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
- **Phase 5.4B (Complete)**: Open-Meteo rainfall forecast provider (`backend/app/services/weather/open_meteo.py`), normalized rainfall schemas (`backend/app/schemas/rainfall.py`), in-memory TTL caching with coordinate quantization, stale fallback, and `GET /api/v1/rainfall` endpoint (67 passing backend tests).
- **Phase 5.5+ (Upcoming)**: Hazard risk fusion, route-risk scoring integration, frontend live alert and weather integration.

## Repository Structure
- `frontend/` — React, Vite, TypeScript, React Leaflet, OpenStreetMap, OSRM routing interface.
- `backend/` — Python FastAPI backend with NDMA SACHET alert adapter, Open-Meteo rainfall adapter, in-memory TTL cache, geographic models, and test suite.

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

### Feed & Weather Configuration
Configure the alert feed and weather provider in `backend/.env` (or environment variables):
```env
# NDMA SACHET Disaster Alerts
SACHET_FEED_URL=https://sachet.ndma.gov.in/cap_public_website/rss/rss_india.xml
SACHET_REQUEST_TIMEOUT_SECONDS=10.0
SACHET_CACHE_TTL_SECONDS=300
SACHET_MAX_ALERTS_PER_FETCH=20

# Open-Meteo Rainfall Forecast
OPEN_METEO_BASE_URL=https://api.open-meteo.com/v1/forecast
OPEN_METEO_REQUEST_TIMEOUT_SECONDS=10.0
OPEN_METEO_CACHE_TTL_SECONDS=900
OPEN_METEO_MAX_FORECAST_HOURS=72
```

### Local API Endpoints
- **Health Check**: `GET http://localhost:8000/api/v1/health`
- **Disaster Alerts**: `GET http://localhost:8000/api/v1/alerts`
- **Filtered Alerts by BBox**: `GET http://localhost:8000/api/v1/alerts?bbox=72.8,18.9,73.1,19.2&active_only=true`
- **Rainfall Forecast**: `GET http://localhost:8000/api/v1/rainfall?latitude=19.076&longitude=72.8777&forecast_hours=24`
- **Interactive API Docs (Swagger UI)**: `http://localhost:8000/docs`
- **Alternative API Docs (ReDoc)**: `http://localhost:8000/redoc`
- **OpenAPI Schema**: `GET http://localhost:8000/api/v1/openapi.json`

### Endpoint Example (`GET /api/v1/rainfall`)
Request:
```http
GET /api/v1/rainfall?latitude=19.076&longitude=72.8777&forecast_hours=24 HTTP/1.1
Host: localhost:8000
```

Representative Response:
```json
{
  "provider": {
    "provider": "open_meteo",
    "status": "ok",
    "is_cached": false,
    "is_stale": false,
    "retrieved_at": "2026-10-23T17:45:00Z",
    "error_message": null,
    "endpoint_url": "https://api.open-meteo.com/v1/forecast?latitude=19.076&longitude=72.8777&hourly=precipitation,precipitation_probability&current=precipitation&forecast_hours=24&timezone=UTC"
  },
  "requested_coordinate": {
    "latitude": 19.076,
    "longitude": 72.8777
  },
  "data_type": "forecast_model",
  "is_model_derived": true,
  "is_physical_observation": false,
  "model_metadata": {
    "source": "Open-Meteo Weather Forecast API",
    "grid_latitude": 19.086115,
    "grid_longitude": 72.85291,
    "elevation_m": 6.0,
    "generationtime_ms": 0.055,
    "utc_offset_seconds": 0,
    "timezone": "UTC"
  },
  "current": {
    "timestamp": "2026-10-23T17:30:00Z",
    "interval_seconds": 900,
    "precipitation_mm": 0.0,
    "unit": "mm",
    "is_model_derived": true,
    "is_physical_observation": false,
    "interval_description": "Preceding 15-minute model accumulation estimate"
  },
  "hourly": [
    {
      "timestamp": "2026-10-23T17:00:00Z",
      "precipitation_mm": 0.0,
      "precipitation_probability_pct": 0.0,
      "interval_minutes": 60,
      "unit": "mm",
      "is_model_derived": true
    },
    {
      "timestamp": "2026-10-23T18:00:00Z",
      "precipitation_mm": 0.2,
      "precipitation_probability_pct": 25.0,
      "interval_minutes": 60,
      "unit": "mm",
      "is_model_derived": true
    }
  ],
  "summary": {
    "forecast_hours": 24,
    "total_precipitation_mm": 0.2,
    "max_hourly_precipitation_mm": 0.2,
    "max_probability_pct": 25.0
  },
  "caveats": [
    "Rainfall data is model-derived numerical weather prediction (NWP), not a direct physical rain-gauge observation.",
    "Precipitation (mm) represents model accumulation over the preceding interval (e.g. 15 min or 1 hour), not an instantaneous rate (mm/h).",
    "Precipitation probability (%) is the likelihood of precipitation occurring, not the rain amount.",
    "Rainfall does not confirm that a road or path is flooded.",
    "Forecast values have inherent uncertainty and spatial grid resolution limits (~1-10 km depending on NWP model)."
  ]
}
```

### Provider Failure & Staleness Semantics (`/api/v1/rainfall`)
Clients distinguish five explicit response states:
1. **Fresh Success with Rain**: `provider.status == "ok"`, `is_cached == false`, `is_stale == false`, positive `total_precipitation_mm`.
2. **Fresh Success with Zero Rain**: `provider.status == "ok"`, `is_cached == false`, `is_stale == false`, `total_precipitation_mm == 0.0`. Fully distinguished from missing/failed data.
3. **Cache Hit**: `provider.status == "ok"`, `is_cached == true`, `is_stale == false`.
4. **Stale Cache Fallback (degraded)**: `provider.status == "degraded"`, `is_cached == true`, `is_stale == true`. Served when upstream times out or errors, preserving prior forecast.
5. **Provider Unavailable (cold start)**: `provider.status == "unavailable"`, `is_cached == false`, `is_stale == false`, `hourly == []`, `current == null`, `summary == null`. **Never reported as zero rainfall.**

### Open-Meteo Attribution & Licensing Requirements
- **License**: Open-Meteo weather data is available under the **Creative Commons Attribution 4.0 International (CC BY 4.0)** license for non-commercial use.
- **Attribution Requirement**: Applications utilizing Open-Meteo data must provide clear attribution: **"Weather data by [Open-Meteo.com](https://open-meteo.com/)"**.
- **Commercial Use Note**: Commercial use beyond free non-commercial thresholds requires an official Open-Meteo commercial subscription/API key. VARSHA makes no unsupported claims regarding commercial rights without an appropriate license.

### Domain Caveats & Flood Disclaimers
1. **Rainfall Does Not Equal Road Flooding**: Atmospheric precipitation (mm) is only one factor in urban inundation. Terrain elevation, stormwater drain capacity, tidal levels, and local topography dictate road waterlogging. High rainfall does not guarantee flooding, and localized street flooding can occur even with modest rain if drains are choked.
2. **NWP Model-Derived vs Physical Observations**: Open-Meteo forecasts are generated from numerical weather prediction (NWP) models (e.g. ECMWF, GFS, ICON). They are statistical model approximations and not direct readings from physical rain-gauge or radar stations.
3. **Accumulation (mm) vs Instantaneous Rate (mm/h)**: The `precipitation_mm` figure is accumulated liquid over the duration of that interval (e.g. 1 hour or 15 minutes), not an instantaneous rainfall rate.
4. **Probability vs Amount**: `precipitation_probability_pct` indicates the chance that precipitation will occur in that hour; it must not be confused with the volume or intensity of rainfall.
5. **Cache Quantization**: In-memory caching quantizes coordinates to 2 decimal places (~1.1 km) to suppress redundant upstream requests in a single process. It resets on process restart and does not represent a physical weather station coordinate.

## Features Not Yet Implemented (Phase Scope Boundaries)
- Frontend connection to live rainfall endpoint
- Live hazard risk evaluation fusing official alerts and rainfall
- Persistent database storage layer
