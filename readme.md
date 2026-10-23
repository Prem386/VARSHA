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
- **Phase 5.2 (Complete)**: FastAPI backend foundation (`backend/`) establishing project structure, configuration, CORS, geographic schemas, health checking, and test suite. External hazard/weather data providers are not yet integrated.
- **Phase 5.3+ (Upcoming)**: External provider integrations (NDMA SACHET, Open-Meteo), backend hazard normalization, and live risk evaluation.

## Repository Structure
- `frontend/` — React, Vite, TypeScript, React Leaflet, OpenStreetMap, OSRM routing interface.
- `backend/` — Python FastAPI foundation, configuration, geographic schemas, and health endpoints.

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

### Local API Endpoints
- **Health Check**: `GET http://localhost:8000/api/v1/health`
- **Interactive API Docs (Swagger UI)**: `http://localhost:8000/docs`
- **Alternative API Docs (ReDoc)**: `http://localhost:8000/redoc`
- **OpenAPI Schema**: `GET http://localhost:8000/api/v1/openapi.json`

> **Note on Upstream Data Providers**: External environmental, flood, and weather data feeds (such as NDMA SACHET or Open-Meteo) are not yet integrated in Phase 5.2. The backend health check indicates local service process availability only.

## Features Not Yet Implemented (Phase Scope Boundaries)
- Live NDMA SACHET CAP alert ingestion (Phase 5.3)
- Live weather/precipitation provider feeds (Open-Meteo)
- Persistent database storage or caching layer
- Rule-based backend route risk scoring engine
