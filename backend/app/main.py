"""VARSHA FastAPI Backend Application Entrypoint."""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api.routes import health, alerts, rainfall, places

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.PROJECT_VERSION,
    description=settings.PROJECT_DESCRIPTION,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS Middleware
# Local development defaults to http://localhost:5173 and http://127.0.0.1:5173.
# For staging/production, configure CORS_ORIGINS in .env or deployment environment.
if settings.CORS_ORIGINS:
    origins = list(settings.CORS_ORIGINS)
    for dev_origin in ("http://localhost:5173", "http://127.0.0.1:5173"):
        if dev_origin not in origins:
            origins.append(dev_origin)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=False,  # ponytail: no session cookies or auth credentials in Phase 5.2
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["*"],
    )

# Include versioned routers
app.include_router(health.router, prefix=settings.API_V1_STR)
app.include_router(alerts.router, prefix=settings.API_V1_STR)
app.include_router(rainfall.router, prefix=settings.API_V1_STR)
app.include_router(places.router, prefix=settings.API_V1_STR)
