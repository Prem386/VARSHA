"""VARSHA FastAPI Backend Application Entrypoint."""
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api.routes import health, alerts, rainfall, places
from app.services.weather.redis_client import weather_redis_client
from app.services.weather.scheduler import weather_scheduler


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application startup and shutdown lifecycles."""
    # 1. Initialize Redis connection pool
    await weather_redis_client.init_pool(settings.REDIS_URL)

    # 2. Start scheduled weather ingestion background task
    if settings.WEATHER_SCHEDULER_ENABLED:
        await weather_scheduler.start()

    yield

    # 3. Gracefully stop background scheduler
    await weather_scheduler.stop()

    # 4. Disconnect Redis pool
    await weather_redis_client.close()


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.PROJECT_VERSION,
    description=settings.PROJECT_DESCRIPTION,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
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
