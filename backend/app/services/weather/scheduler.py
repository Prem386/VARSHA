"""Scheduled background weather ingestion service for Navi Mumbai pilot cells.

Periodically fetches Open-Meteo numerical weather prediction forecasts for all
supported geographic cells, normalizes the responses, and stores them in Redis.

ARCHITECTURE & CONCURRENCY:
- Runs as an in-process asyncio background task within the FastAPI lifespan.
- Uses a distributed Redis lease lock (SET NX PX) to ensure only ONE worker
  process executes ingestion across multiple Uvicorn workers or Render instances.
- Zero heavy dependencies (no Celery, no RabbitMQ, no APScheduler) — optimal
  for Render 512 MB RAM free tier.
- Preserves the previous valid snapshot if an ingestion run fails.
- Respects Open-Meteo rate limits and daily quota cooldowns (HTTP 429).
"""
import asyncio
import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

import httpx

from app.core.config import settings
from app.schemas.common import Coordinate
from app.schemas.rainfall import RainfallResponse
from app.services.weather.grid import PilotCell, get_all_cells
from app.services.weather.open_meteo import (
    calculate_daily_quota_cooldown_seconds,
    open_meteo_provider,
    parse_open_meteo_response,
)
from app.services.weather.redis_client import weather_redis_client

logger = logging.getLogger(__name__)

SCHEDULER_LOCK_KEY = "weather:lock:scheduler"
SCHEDULER_LOCK_TTL_MS = 120_000  # 2 minutes lock lease


class WeatherScheduler:
    """Manages scheduled periodic weather ingestion for Navi Mumbai pilot nodes."""

    def __init__(self) -> None:
        self._task: Optional[asyncio.Task] = None
        self._running: bool = False
        self._worker_id: str = str(uuid.uuid4())
        self._last_refresh_time: Optional[datetime] = None

    @property
    def is_running(self) -> bool:
        """Check if scheduler background loop is running."""
        return self._running and self._task is not None and not self._task.done()

    async def start(self) -> None:
        """Start the background ingestion scheduler task."""
        if self.is_running:
            logger.debug("WeatherScheduler is already running.")
            return

        if not settings.WEATHER_SCHEDULER_ENABLED:
            logger.info("WeatherScheduler is disabled via WEATHER_SCHEDULER_ENABLED.")
            return

        self._running = True
        self._task = asyncio.create_task(self._scheduler_loop(), name="varsha-weather-scheduler")
        logger.info("WeatherScheduler background task started [worker_id=%s].", self._worker_id)

    async def stop(self) -> None:
        """Gracefully stop the background ingestion scheduler."""
        self._running = False
        if self._task is not None and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            logger.info("WeatherScheduler background task terminated cleanly.")
        self._task = None

    async def refresh_cell(
        self,
        cell: PilotCell,
        client: Optional[httpx.AsyncClient] = None,
        forecast_hours: int = 24,
    ) -> Optional[RainfallResponse]:
        """Fetch upstream weather for a single pilot cell, normalize, and store in Redis."""
        if not weather_redis_client.is_available:
            logger.warning(
                "Refresh for cell '%s' skipped: Redis is unavailable and distributed coordination cannot be guaranteed.",
                cell.cell_id,
            )
            return None

        now_utc = datetime.now(timezone.utc)
        endpoint_url = open_meteo_provider.build_endpoint_url(
            cell.latitude, cell.longitude, forecast_hours
        )
        cache_key = open_meteo_provider.cache.make_key(
            cell.latitude, cell.longitude, forecast_hours
        )

        # Check existing failure cooldown (e.g. active daily quota 429)
        active_failure = open_meteo_provider.cache.get_failure(cache_key, now=now_utc)
        if active_failure is not None:
            logger.warning(
                "Skipping scheduled refresh for cell '%s' due to active failure cooldown: %s",
                cell.cell_id,
                active_failure[0],
            )
            return None

        # Check shared Redis daily quota cooldown across workers / restarts
        if weather_redis_client.is_available:
            shared_quota_err = await weather_redis_client.get_daily_quota_cooldown()
            if shared_quota_err is not None:
                logger.warning(
                    "Skipping scheduled refresh for cell '%s': shared daily quota cooldown active: %s",
                    cell.cell_id,
                    shared_quota_err,
                )
                return None

        should_close = False
        if client is None:
            client = httpx.AsyncClient(timeout=open_meteo_provider.timeout_seconds)
            should_close = True

        try:
            params = open_meteo_provider.build_query_params(
                cell.latitude, cell.longitude, forecast_hours
            )
            headers = {"User-Agent": "VARSHA-Scheduled-Ingestion/0.1"}
            logger.info("Scheduled refresh: Fetching Open-Meteo for cell '%s' (%s, %s)", cell.cell_id, cell.latitude, cell.longitude)
            resp = await client.get(open_meteo_provider.base_url, params=params, headers=headers)
            resp.raise_for_status()

            raw_json = resp.json()
            parsed = parse_open_meteo_response(
                raw_data=raw_json,
                requested_lat=cell.latitude,
                requested_lon=cell.longitude,
                forecast_hours=forecast_hours,
                endpoint_url=str(resp.url),
                retrieved_at=now_utc,
                is_cached=False,
                is_stale=False,
            )

            # Enrich model metadata with cell identifier
            if parsed.model_metadata is not None:
                parsed.model_metadata.cell_id = cell.cell_id

            # 1. Store in shared Redis layer
            if weather_redis_client.is_available:
                await weather_redis_client.set_snapshot(cell.cell_id, parsed)

            # 2. Update local in-memory fallback cache
            open_meteo_provider.cache.set(cache_key, parsed, str(resp.url), cached_at=now_utc)

            logger.info("Successfully refreshed and stored weather snapshot for cell '%s'.", cell.cell_id)
            return parsed

        except httpx.HTTPStatusError as exc:
            resp = exc.response
            status_code = resp.status_code if resp is not None else 0
            raw_text = resp.text[:200] if resp is not None else ""
            safe_err = f"Upstream forecast request failed: HTTP {status_code}"
            logger.warning(
                "Scheduled refresh HTTP error for cell '%s': status=%s body=%s",
                cell.cell_id,
                status_code,
                raw_text,
            )

            is_daily_limit = status_code == 429 and "daily api request limit exceeded" in raw_text.lower()
            cooldown = calculate_daily_quota_cooldown_seconds(now_utc) if is_daily_limit else None
            open_meteo_provider.cache.set_failure(
                cache_key, safe_err, failed_at=now_utc, cooldown_seconds=cooldown
            )
            if is_daily_limit and cooldown is not None and weather_redis_client.is_available:
                await weather_redis_client.set_daily_quota_cooldown(cooldown, safe_err)
            # CRITICAL: Preserve existing valid snapshot in Redis upon failure
            return None

        except Exception as exc:
            safe_err = f"Upstream forecast request failed: {type(exc).__name__}"
            logger.warning("Scheduled refresh error for cell '%s': %s", cell.cell_id, exc)
            open_meteo_provider.cache.set_failure(cache_key, safe_err, failed_at=now_utc)
            # CRITICAL: Preserve existing valid snapshot in Redis upon failure
            return None

        finally:
            if should_close:
                await client.aclose()

    async def refresh_all_cells(self, client: Optional[httpx.AsyncClient] = None) -> int:
        """Execute scheduled weather ingestion for all registered pilot cells.

        Returns count of successfully refreshed cells.
        """
        if not weather_redis_client.is_available:
            logger.warning(
                "Scheduled refresh skipped: Redis is unavailable and distributed coordination cannot be guaranteed."
            )
            return 0

        cells = get_all_cells()
        logger.info("Starting scheduled weather refresh for %d Navi Mumbai pilot cells.", len(cells))
        success_count = 0

        for cell in cells:
            # Renew distributed lock lease before processing each cell
            if weather_redis_client.is_available:
                await weather_redis_client.renew_lock(
                    SCHEDULER_LOCK_KEY, self._worker_id, timeout_ms=SCHEDULER_LOCK_TTL_MS
                )
            result = await self.refresh_cell(cell, client=client)
            if result is not None:
                success_count += 1
            # Micro-pause between cells to avoid burst requests to Open-Meteo
            await asyncio.sleep(0.5)

        self._last_refresh_time = datetime.now(timezone.utc)
        logger.info(
            "Scheduled weather refresh complete: %d/%d cells refreshed.",
            success_count,
            len(cells),
        )
        return success_count

    async def check_and_initialize_snapshots(self) -> None:
        """Check if any pilot cells are missing or outdated in Redis, and refresh them immediately."""
        if not weather_redis_client.is_available:
            logger.warning(
                "Startup snapshot recovery skipped: Redis is unavailable and distributed coordination cannot be guaranteed."
            )
            return

        cells = get_all_cells()
        cells_to_refresh: list[PilotCell] = []
        now_utc = datetime.now(timezone.utc)
        refresh_threshold = settings.WEATHER_REFRESH_INTERVAL_MINUTES * 60

        for cell in cells:
            snapshot = await weather_redis_client.get_snapshot(cell.cell_id)
            if snapshot is None:
                cells_to_refresh.append(cell)
            else:
                retrieved = snapshot.provider.retrieved_at
                if retrieved is not None:
                    retrieved_utc = (
                        retrieved.replace(tzinfo=timezone.utc)
                        if retrieved.tzinfo is None
                        else retrieved.astimezone(timezone.utc)
                    )
                    age = (now_utc - retrieved_utc).total_seconds()
                    if age > refresh_threshold:
                        cells_to_refresh.append(cell)
                else:
                    cells_to_refresh.append(cell)

        if cells_to_refresh:
            logger.info(
                "Startup recovery: %d pilot cells missing or outdated in Redis. Refreshing...",
                len(cells_to_refresh),
            )
            # Acquire lock before initializing/refreshing cells
            locked = await weather_redis_client.acquire_lock(
                SCHEDULER_LOCK_KEY, self._worker_id, timeout_ms=SCHEDULER_LOCK_TTL_MS
            )
            if locked:
                try:
                    for cell in cells_to_refresh:
                        await weather_redis_client.renew_lock(
                            SCHEDULER_LOCK_KEY, self._worker_id, timeout_ms=SCHEDULER_LOCK_TTL_MS
                        )
                        await self.refresh_cell(cell)
                        await asyncio.sleep(0.5)
                finally:
                    await weather_redis_client.release_lock(SCHEDULER_LOCK_KEY, self._worker_id)
            else:
                logger.debug("Scheduler lock held by another worker during startup recovery. Skipping.")
        else:
            logger.info("Startup check: all %d pilot cells are present and fresh in Redis.", len(cells))

    async def _scheduler_loop(self) -> None:
        """Main periodic loop. Checks interval, coordinates lock, and triggers ingestion."""
        # 1. Initial cold-start check on startup
        try:
            await self.check_and_initialize_snapshots()
        except Exception as exc:
            logger.warning("Error during initial weather snapshot check: %s", exc)

        # 2. Main periodic loop
        interval_seconds = max(60, settings.WEATHER_REFRESH_INTERVAL_MINUTES * 60)
        logger.info(
            "WeatherScheduler entering periodic loop (interval: %d minutes).",
            settings.WEATHER_REFRESH_INTERVAL_MINUTES,
        )

        while self._running:
            try:
                # Sleep in short increments to allow fast shutdown cancellation
                elapsed = 0
                check_interval = 10  # check every 10 seconds
                while elapsed < interval_seconds and self._running:
                    await asyncio.sleep(min(check_interval, interval_seconds - elapsed))
                    elapsed += check_interval

                if not self._running:
                    break

                # Attempt to acquire distributed lease lock
                locked = await weather_redis_client.acquire_lock(
                    SCHEDULER_LOCK_KEY, self._worker_id, timeout_ms=SCHEDULER_LOCK_TTL_MS
                )
                if locked:
                    try:
                        logger.info("Acquired scheduler lock. Executing periodic ingestion.")
                        await asyncio.wait_for(self.refresh_all_cells(), timeout=75.0)
                    except asyncio.TimeoutError:
                        logger.warning("Scheduled refresh cycle exceeded 75.0s bounded execution deadline.")
                    finally:
                        await weather_redis_client.release_lock(SCHEDULER_LOCK_KEY, self._worker_id)
                else:
                    logger.debug("Scheduler lock held by another worker. Skipping this cycle.")

            except asyncio.CancelledError:
                break
            except Exception as exc:
                logger.error("Unexpected error in WeatherScheduler loop: %s", exc, exc_info=True)
                await asyncio.sleep(10)


# Global singleton scheduler
weather_scheduler = WeatherScheduler()
