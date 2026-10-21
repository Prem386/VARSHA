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
- **Phase 1 (Complete)**: React + Vite + TypeScript foundation established with landing view, civic theme, and map placeholder.
- **Phase 2 (Upcoming)**: React Leaflet map integration, Navi Mumbai viewport, and simulated hazard overlays.
- **Phase 3 (Future)**: Python FastAPI backend, OSRM routing candidate, and explainable safety scoring.

## Local Setup & Development

### Prerequisites
- Node.js (v18+ recommended)
- npm (v9+)

### Installation & Run Commands
```bash
# Install dependencies
npm install

# Start local development server
npm run dev

# Compile TypeScript and build for production
npm run build

# Preview production build locally
npm run preview
```

### Architecture Note
Per Case C repository setup, the React application is maintained at the repository root to preserve the existing commit history and setup. The future Python FastAPI backend will reside under `backend/`.

## Features Not Yet Implemented (Phase 1 Scope Boundaries)
- Interactive map pan/zoom and Leaflet layer rendering (Phase 2)
- Start/destination point geocoding and route path calculation (Phase 2/3)
- Real-time weather API or live municipal flood telemetry (Simulated data in Phase 2)
- Rule-based risk assessment backend scoring engine (Phase 3)
