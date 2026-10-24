# VARSHA

**Predictive Monsoon Mobility & Route Safety System**

> *Don't just find the fastest route. Find the safer one.*

VARSHA is a monsoon mobility assistant initially focused on Navi Mumbai (19.0330° N, 73.0297° E). During heavy monsoon rainfall, commuters encounter waterlogged arterials, flooded underpasses, and severe transit delays. VARSHA enables road travelers to compare alternative routes based on travel duration alongside transparent, explainable hazard proximity assessments.

---

## Prototype Scope & Data Distinctions

To ensure responsible civic use, the VARSHA prototype strictly separates real, model-derived, official, and simulated data:

- **Real Route Geometry & Estimates**: Alternative driving routes, distances, and duration estimates are fetched in real time from public Open Source Routing Machine (OSRM) services built on OpenStreetMap road networks.
- **Model-Derived Rainfall Forecasts**: Precipitation figures are numerical weather prediction (NWP) forecasts retrieved from the Open-Meteo API. They are statistical model accumulation estimates, **not** physical rain-gauge observations or confirmed road flood measurements.
- **Official Disaster Warnings**: Emergency disaster alerts are ingested from the National Disaster Management Authority (NDMA) SACHET Common Alerting Protocol (CAP 1.2) RSS/XML feed.
- **Simulated Route Hazards & Risk Scores**: Hazard locations (submerged roads, flooded underpasses, severe waterlogging) and route-risk scores are **synthetic demo scenarios** designed for civic evaluation.

> [!IMPORTANT]
> **Safety Disclaimer**: VARSHA is an experimental prototype. It **does not** detect physical street-level flooding in real time and **cannot guarantee** route safety. Always heed local municipal directives, emergency services, and on-ground traffic authorities during extreme weather.

---

## Technology Stack

### Frontend
- **Framework & Tooling**: React 19, TypeScript, Vite 8
- **Styling**: Vanilla CSS (custom design system, responsive touch targets, dark/light contrast)
- **Mapping & Visualization**: Leaflet 1.9, React-Leaflet 5, OpenStreetMap cartography
- **Testing**: Node.js native test runner (`node --test`), Vitest, Happy-DOM, Testing Library

### Backend
- **Framework & Server**: Python 3.10+ (tested on Python 3.13), FastAPI, Uvicorn
- **Configuration & Validation**: Pydantic v2, Pydantic-Settings
- **HTTP Client**: HTTPX (async client with timeout policies)
- **Testing**: PyTest, PyTest-Asyncio

### External Providers & Data Sources
- **Routing**: OSRM (Open Source Routing Machine) public driving API
- **Geocoding & Place Search**: Geoapify Places Autocomplete API (proxied via backend) with curated local Navi Mumbai landmark fallback
- **Rainfall & Weather**: Open-Meteo Forecast API (CC BY 4.0 license)
- **Disaster Alerts**: NDMA SACHET Disaster Alert Feed (CAP 1.2 / RSS 2.0)

---

## Repository Structure

```text
VARSHA/
├── backend/                  # FastAPI backend application
│   ├── app/
│   │   ├── api/routes/       # API route controllers (health, alerts, rainfall, places)
│   │   ├── core/             # App configuration, settings, environment loading
│   │   ├── schemas/          # Pydantic request/response data contracts
│   │   ├── services/         # Upstream provider integrations and in-memory caches
│   │   │   ├── alerts/       # NDMA SACHET XML parser & TTL cache
│   │   │   ├── places/       # Geoapify proxy, coordinate validation & cache
│   │   │   └── weather/      # Open-Meteo client, grid quantization & cache
│   │   └── main.py           # FastAPI application entrypoint & middleware
│   ├── tests/                # Pytest automated test suite
│   ├── .env.example          # Template environment variable definitions
│   └── requirements.txt      # Python dependencies
├── frontend/                 # React + TypeScript single-page application
│   ├── src/
│   │   ├── features/
│   │   │   ├── map/          # MapView, Leaflet markers, polyline rendering, hazard data
│   │   │   ├── routing/      # OSRM service adapter, proximity engine, risk scoring
│   │   │   ├── scenarios/    # Deterministic demo scenario definitions
│   │   │   ├── search/       # PlaceSearchInput, Geoapify client, curated landmarks
│   │   │   └── weather/      # WeatherAlertsCard, weather/alert API client
│   │   ├── types/            # TypeScript domain interfaces and API contracts
│   │   ├── App.tsx           # Application layout and core state wiring
│   │   └── main.tsx          # React application root
│   ├── tests/                # Frontend unit tests and component UI tests
│   ├── package.json          # Frontend dependencies and npm test/build scripts
│   └── vite.config.ts        # Vite configuration and `/api` backend reverse proxy
└── readme.md                 # Project overview and developer setup guide
```

---

## Prerequisites

Before setting up VARSHA locally, ensure the following runtimes are installed:

- **Node.js**: v18.0.0 or later (v20+ recommended)
- **npm**: v9.0.0 or later
- **Python**: 3.10 or later (verified on Python 3.13)
- **Git**

---

## Installation & Environment Configuration

### 1. Clone Repository

```bash
git clone https://github.com/your-username/VARSHA.git
cd VARSHA
```

### 2. Backend Setup

Open a terminal dedicated to the backend:

```powershell
# Navigate to backend directory
cd backend

# Create Python virtual environment
python -m venv .venv

# Activate virtual environment
# On Windows PowerShell:
.\.venv\Scripts\Activate.ps1
# On Windows CMD:
# .\.venv\Scripts\activate.bat
# On Linux / macOS:
# source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

#### Configure Environment Variables

Create your local `.env` configuration from the example file:

```powershell
# Copy example configuration
cp .env.example .env
```

Review and adjust settings in `backend/.env`:

| Variable | Default Value | Description |
| :--- | :--- | :--- |
| `ENVIRONMENT` | `development` | Runtime environment name (`development`, `production`). |
| `API_V1_STR` | `/api/v1` | Base path prefix for all API version 1 endpoints. |
| `CORS_ORIGINS` | `["http://localhost:5173"]` | Allowed frontend origins for CORS headers. |
| `GEOAPIFY_API_KEY` | *(empty)* | Optional Geoapify API key for place search. If left empty, search automatically falls back to curated landmarks. |
| `GEOAPIFY_BASE_URL` | `https://api.geoapify.com/v1/geocode/autocomplete` | Geoapify autocomplete endpoint URL. |
| `GEOAPIFY_CACHE_TTL_SECONDS` | `300` | In-memory cache TTL for geocoding queries (seconds). |
| `GEOAPIFY_BIAS_PROXIMITY` | `73.0297,19.0330` | Default geographic search bias coordinate (`lon,lat` for Navi Mumbai). |
| `GEOAPIFY_COUNTRY_FILTER` | `in` | Country code filter (`in` for India). |
| `OPEN_METEO_BASE_URL` | `https://api.open-meteo.com/v1/forecast` | Open-Meteo weather forecast endpoint. |
| `OPEN_METEO_CACHE_TTL_SECONDS` | `900` | In-memory cache TTL for rainfall forecasts (15 minutes). |
| `OPEN_METEO_MAX_FORECAST_HOURS`| `72` | Maximum forecast horizon allowed by API. |
| `SACHET_FEED_URL` | `https://sachet.ndma.gov.in/cap_public_website/rss/rss_india.xml` | NDMA SACHET nationwide CAP RSS feed URL. |
| `SACHET_CACHE_TTL_SECONDS` | `300` | In-memory cache TTL for disaster alert feed (5 minutes). |

### 3. Frontend Setup

Open a second terminal dedicated to the frontend:

```bash
# Navigate to frontend directory
cd frontend

# Install dependencies
npm install
```

The frontend uses Vite's development proxy configured in `frontend/vite.config.ts`. All client requests to `/api/*` automatically forward to `http://localhost:8000/api/*`, eliminating browser CORS issues during local development.

---

## Running the Application Locally

Start both servers in separate terminal sessions:

### Terminal 1 — Backend API
```powershell
cd backend
.\.venv\Scripts\Activate.ps1
uvicorn app.main:app --reload --port 8000
```
- API root: `http://localhost:8000`
- Swagger UI interactive documentation: `http://localhost:8000/docs`
- ReDoc documentation: `http://localhost:8000/redoc`

### Terminal 2 — Frontend Development Server
```bash
cd frontend
npm run dev
```
- Web Application: `http://localhost:5173`

Open `http://localhost:5173` in your browser to interact with the map, search places, compare routes, select risk scenarios, and inspect weather alerts.

---

## API Overview

The backend exposes RESTful endpoints under the `/api/v1` prefix.

### Endpoints Consumed by Frontend

#### 1. Geocoding & Place Search
- **Endpoint**: `GET /api/v1/places/search`
- **Purpose**: Proxies autocomplete geocoding requests to Geoapify while keeping API keys confidential on the backend.
- **Parameters**:
  - `q` (string, required): Query string (2 to 200 characters, e.g., `Inorbit Mall, Vashi`).
  - `limit` (integer, optional, default: 5): Maximum results to return (range 1–20).
- **Graceful Degradation**:
  - If `GEOAPIFY_API_KEY` is not configured, the endpoint returns HTTP 503 with a clear diagnostic message. The frontend catches this and seamlessly switches to local curated landmarks.
  - Rate limits (HTTP 429) and upstream timeouts (HTTP 504) are normalized and handled safely without crashing client UI.

#### 2. Rainfall Forecast
- **Endpoint**: `GET /api/v1/rainfall`
- **Purpose**: Retrieves numerical weather prediction precipitation forecasts from Open-Meteo, normalized into provider-independent models with temporal semantics.
- **Parameters**:
  - `latitude` (float, required): Target latitude in decimal degrees ([-90.0, 90.0]).
  - `longitude` (float, required): Target longitude in decimal degrees ([-180.0, 180.0]).
  - `forecast_hours` (integer, optional, default: 24): Forecast horizon in hours (1–72).
- **Semantics**:
  - `current.precipitation_mm`: Model accumulation estimate over preceding 15-minute window.
  - `hourly`: Array of hourly forecast intervals with precipitation accumulation (`mm`) and rain probability (`0–100%`).
  - Missing data is represented as `null`, never as `0.0 mm`.

#### 3. Official Disaster Warnings
- **Endpoint**: `GET /api/v1/alerts`
- **Purpose**: Retrieves normalized government disaster advisories from the NDMA SACHET CAP 1.2 feed.
- **Parameters**:
  - `bbox` (string, optional): Bounding box coordinates `min_lon,min_lat,max_lon,max_lat` (e.g., `72.8,18.9,73.1,19.2`).
  - `active_only` (boolean, optional, default: `true`): Filters out expired or cancelled alerts.
- **Semantics**:
  - Alerts are categorized with standardized urgency, severity, certainty, and headline.
  - If spatial coordinates are absent from an alert entry, the entry indicates district-level geometry uncertainty so developers avoid false map placements.

### Direct & Diagnostic Endpoints

- **Health Check**: `GET /api/v1/health`
  Returns local backend operational status, service identifier, version, environment, and server timestamp.
- **OpenAPI JSON Schema**: `GET /api/v1/openapi.json`
  Provides the complete OpenAPI 3.1 specification for code generation and automated contract verification.

### Cache & Staleness States

The backend services implement an in-memory TTL cache with graceful fallback:
1. **Fresh Success**: `provider.status == "ok"`, `is_cached == false`, `is_stale == false`.
2. **Cache Hit**: `provider.status == "ok"`, `is_cached == true`, `is_stale == false`.
3. **Stale Fallback (Degraded)**: `provider.status == "degraded"`, `is_stale == true`. Upstream network failure serves cached data to keep the commuter interface operational.
4. **Cold-Start Unavailable**: `provider.status == "unavailable"`. Returned if upstream fails before any cache entry exists.

---

## Testing & Build

All test suites and build scripts are fully verified against the codebase.

### Frontend Test Suites

Run from the `frontend/` directory:

```bash
# 1. Run unit tests (Node.js native test runner)
npm run test:unit

# 2. Run React UI component tests (Vitest + happy-dom + Testing Library)
npm run test:ui

# 3. Run all frontend tests sequentially
npm test
```

- **Unit Tests (`npm run test:unit`)**: Tests pure TypeScript domain logic, including the distance-to-segment proximity engine, rule-based risk scoring algorithms, coordinate normalization, landmark search, and weather/alerts client wrappers.
- **UI Tests (`npm run test:ui`)**: Tests React component interactions, accessibility labels, user input flows, dropdown keyboard navigation, scenario switching, error handling states, and map state recovery.

### Frontend Production Build

```bash
# Typecheck with tsc and compile production bundle with Vite
npm run build

# Preview production build locally
npm run preview
```

### Backend Test Suite

Run from the `backend/` directory with the virtual environment activated:

```powershell
pytest tests -v
```

- **Backend Tests**: Tests configuration parsing, Pydantic data schemas, CAP 1.2 XML parsing, Open-Meteo JSON parsing, Geoapify place normalization, coordinate validation, in-memory TTL caching, bounded FIFO eviction, stale cache fallback behavior, and FastAPI endpoint routes.

---

## Prototype Scenarios & Risk Scoring

VARSHA includes four deterministic demo scenarios to demonstrate differential risk scoring across alternative routes:

1. **Baseline (Standard Pilot)**: Illustrates typical monsoon conditions across Navi Mumbai with 6 representative simulated hazards.
2. **Flood on Sion-Panvel Highway**: Places a synthetic high-severity submergence on the Sion-Panvel corridor near Sanpada/Turbhe, demonstrating Palm Beach Road as a safer alternative.
3. **Flood on West Bypass Corridor**: Simulates an underpass inundation along Thane-Belapur Road near Mahape, highlighting the West Bypass as a lower-risk choice for Airoli–Vashi journeys.
4. **All Clear (Zero Hazards)**: Empty demo hazard collection verifying safe fallback behavior (score 0, green category) when no hazards are reported.

---

## Limitations & Domain Disclaimers

1. **Rainfall vs. Road Inundation**: Atmospheric precipitation (mm) does not directly equate to street flooding. Urban drainage capacity, local tidal cycles, topography, and catchment geography determine actual road conditions.
2. **Numerical Weather Predictions**: Open-Meteo forecasts are generated by mathematical simulation models (e.g., ECMWF, GFS, ICON). They are statistical estimates subject to spatial grid resolution limits (~1–10 km).
3. **Alert Geometry Resolution**: Many official SACHET alerts provide text descriptions and administrative district names without precise polygon coordinate boundaries. Bounding-box filtering matches coordinate-verified alerts while preserving district-level advisories for human review.
4. **Simulated Route Hazards**: All hazard markers, waterlogging levels, and safety scores in this prototype are simulated. They must not be relied upon for critical evacuation or navigation.
5. **Third-Party Service Availability**: Routing and geocoding rely on external APIs (OSRM public demo server, Geoapify). Network latency, outages, or upstream rate limits may affect response times.

---

## Attribution & Licenses

- **Open-Meteo**: Weather forecast data provided by [Open-Meteo.com](https://open-meteo.com/) under the [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) license.
- **OpenStreetMap**: Map data and cartography © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), available under the Open Database License (ODbL).
- **OSRM**: Routing engine powered by the [Open Source Routing Machine](https://project-osrm.org/).
- **Geoapify**: Geocoding and autocomplete search powered by [Geoapify](https://www.geoapify.com/).
- **NDMA SACHET**: Official disaster alerts sourced from the [National Disaster Management Authority](https://sachet.ndma.gov.in/).
