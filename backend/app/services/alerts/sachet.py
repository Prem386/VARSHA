"""NDMA SACHET alert feed parser, provider, and in-memory cache.

Retrieves official NDMA Common Alerting Protocol (CAP 1.2) alerts from RSS feeds,
normalizes them into provider-independent models, and maintains a bounded single-process
in-memory TTL cache with stale-data fallback.
"""
import asyncio
import email.utils
import logging
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

import httpx

from app.core.config import settings
from app.schemas.alerts import AlertGeocode, NormalizedAlert, ProviderStatus
from app.schemas.common import BoundingBox, Coordinate

logger = logging.getLogger(__name__)


def _strip_tag(tag: str) -> str:
    """Strip XML namespace prefix if present."""
    return tag.split("}")[-1] if "}" in tag else tag


def _find_child_text(element: ET.Element, target_tag: str) -> Optional[str]:
    """Find immediate or descendant child text by local tag name."""
    for child in element:
        if _strip_tag(child.tag) == target_tag:
            return child.text.strip() if child.text else None
    return None


def _find_all_children(element: ET.Element, target_tag: str) -> List[ET.Element]:
    """Find all children matching local tag name."""
    return [child for child in element if _strip_tag(child.tag) == target_tag]


def _parse_iso_datetime(val: Optional[str]) -> Optional[datetime]:
    """Parse ISO 8601 datetime into timezone-aware UTC datetime."""
    if not val or not val.strip():
        return None
    try:
        dt = datetime.fromisoformat(val.strip())
        if dt.tzinfo is None:
            return dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except Exception:
        return None


def _parse_rfc2822_datetime(val: Optional[str]) -> Optional[datetime]:
    """Parse RFC 2822 datetime (e.g. RSS pubDate) into timezone-aware UTC datetime."""
    if not val or not val.strip():
        return None
    try:
        dt = email.utils.parsedate_to_datetime(val.strip())
        if dt.tzinfo is None:
            return dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except Exception:
        return None


def parse_sachet_rss(xml_content: str) -> List[Dict[str, Any]]:
    """Parse SACHET RSS 2.0 XML into a list of alert feed item descriptors.

    Safe XML parsing using stdlib ElementTree (no entity expansion).
    """
    if not xml_content or not xml_content.strip():
        return []

    try:
        root = ET.fromstring(xml_content.strip())
    except ET.ParseError as exc:
        raise ValueError(f"Malformed RSS XML: {exc}") from exc

    # Locate <channel>
    channel = None
    if _strip_tag(root.tag) == "channel":
        channel = root
    else:
        for child in root:
            if _strip_tag(child.tag) == "channel":
                channel = child
                break

    if channel is None:
        return []

    items: List[Dict[str, Any]] = []
    for item_elem in _find_all_children(channel, "item"):
        title = _find_child_text(item_elem, "title") or ""
        link = _find_child_text(item_elem, "link") or ""
        desc = _find_child_text(item_elem, "description")
        pub_date_str = _find_child_text(item_elem, "pubDate")
        guid = _find_child_text(item_elem, "guid") or link

        pub_date = _parse_rfc2822_datetime(pub_date_str)

        if link:
            items.append(
                {
                    "title": title,
                    "link": link,
                    "description": desc,
                    "pub_date": pub_date,
                    "guid": guid,
                }
            )

    return items


def parse_cap_xml(xml_content: str, retrieval_time: Optional[datetime] = None) -> NormalizedAlert:
    """Parse OASIS CAP 1.2 XML into a NormalizedAlert model.

    Safe XML parsing using stdlib ElementTree.
    Handles namespace prefixes, multilingual <info> blocks, and geometry uncertainty.
    """
    if not xml_content or not xml_content.strip():
        raise ValueError("Empty CAP XML content")

    try:
        root = ET.fromstring(xml_content.strip())
    except ET.ParseError as exc:
        raise ValueError(f"Malformed CAP XML: {exc}") from exc

    if _strip_tag(root.tag) != "alert":
        raise ValueError(f"Root element is not <alert>, got <{root.tag}>")

    now_utc = retrieval_time or datetime.now(timezone.utc)
    warnings: List[str] = []

    identifier = _find_child_text(root, "identifier")
    if not identifier:
        warnings.append("Missing identifier element in alert; using fallback")
        identifier = f"unknown_{int(now_utc.timestamp())}"

    sender = _find_child_text(root, "sender") or "unknown"
    sent_dt = _parse_iso_datetime(_find_child_text(root, "sent"))
    status = _find_child_text(root, "status") or "Actual"
    msg_type = _find_child_text(root, "msgType") or "Alert"
    references = _find_child_text(root, "references")

    # Multilingual <info> blocks: prefer English, record alternates
    info_elements = _find_all_children(root, "info")
    selected_info: Optional[ET.Element] = None
    all_languages: List[str] = []

    for info in info_elements:
        lang = (_find_child_text(info, "language") or "").strip()
        if lang:
            all_languages.append(lang)
        if selected_info is None:
            selected_info = info
        elif lang.lower().startswith("en"):
            selected_info = info

    # Fallback to root if no <info> present
    category: Optional[str] = None
    event: Optional[str] = None
    urgency = "Unknown"
    severity = "Unknown"
    certainty = "Unknown"
    effective_dt: Optional[datetime] = None
    onset_dt: Optional[datetime] = None
    expires_dt: Optional[datetime] = None
    headline: Optional[str] = None
    description: Optional[str] = None
    instruction: Optional[str] = None
    primary_language = "en-IN"

    area_description: Optional[str] = None
    geocodes: List[AlertGeocode] = []
    geometry_type = "unresolved"
    coordinates: Optional[List[Coordinate]] = None
    has_spatial_geometry = False

    raw_severity = None
    raw_urgency = None
    raw_certainty = None

    if selected_info is not None:
        lang_val = _find_child_text(selected_info, "language")
        if lang_val:
            primary_language = lang_val

        category = _find_child_text(selected_info, "category")
        event = _find_child_text(selected_info, "event")

        raw_urgency = _find_child_text(selected_info, "urgency")
        raw_severity = _find_child_text(selected_info, "severity")
        raw_certainty = _find_child_text(selected_info, "certainty")

        urgency = raw_urgency or "Unknown"
        severity = raw_severity or "Unknown"
        certainty = raw_certainty or "Unknown"

        effective_dt = _parse_iso_datetime(_find_child_text(selected_info, "effective"))
        onset_dt = _parse_iso_datetime(_find_child_text(selected_info, "onset"))
        expires_dt = _parse_iso_datetime(_find_child_text(selected_info, "expires"))

        headline = _find_child_text(selected_info, "headline")
        description = _find_child_text(selected_info, "description")
        instruction = _find_child_text(selected_info, "instruction")

        # Parse <area>
        area_elements = _find_all_children(selected_info, "area")
        area_descs: List[str] = []
        for area in area_elements:
            adesc = _find_child_text(area, "areaDesc")
            if adesc:
                area_descs.append(adesc)

            # Geocodes: <geocode><valueName>LGD</valueName><value>496</value></geocode>
            for gc in _find_all_children(area, "geocode"):
                v_name = _find_child_text(gc, "valueName")
                v_val = _find_child_text(gc, "value")
                if v_name and v_val:
                    geocodes.append(AlertGeocode(value_name=v_name, value=v_val))

            # Polygon parsing: e.g. "19.0,72.8 19.1,72.9 ..."
            poly_str = _find_child_text(area, "polygon")
            if poly_str and not coordinates:
                parsed_coords = _parse_polygon_string(poly_str)
                if parsed_coords:
                    coordinates = parsed_coords
                    geometry_type = "polygon"
                    has_spatial_geometry = True

            # Circle parsing: "lat,lon,radius"
            circle_str = _find_child_text(area, "circle")
            if circle_str and not coordinates:
                parsed_circle = _parse_circle_string(circle_str)
                if parsed_circle:
                    coordinates = [parsed_circle]
                    geometry_type = "circle"
                    has_spatial_geometry = True

        if area_descs:
            area_description = "; ".join(area_descs)
    else:
        warnings.append("Alert contains no <info> elements")

    # Determine is_active status based on CAP lifecycle rules
    # 1. Cancellation messages are never active hazards
    # 2. Non-actual statuses (Test, Draft, Exercise) are not active live hazards
    # 3. Alerts past their expiration timestamp are inactive
    is_active = True
    if msg_type.lower() == "cancel":
        is_active = False
    elif status.lower() != "actual":
        is_active = False
    elif expires_dt is not None and expires_dt < now_utc:
        is_active = False

    alternate_languages = [
        l for l in all_languages if l.lower() != primary_language.lower()
    ]

    return NormalizedAlert(
        provider="ndma_sachet",
        identifier=identifier,
        sender=sender,
        sent=sent_dt,
        status=status,
        msg_type=msg_type,
        references=references,
        category=category,
        event=event,
        headline=headline,
        description=description,
        instruction=instruction,
        severity=severity,
        urgency=urgency,
        certainty=certainty,
        is_active=is_active,
        effective=effective_dt,
        onset=onset_dt,
        expires=expires_dt,
        retrieved_at=now_utc,
        language=primary_language,
        alternate_languages=alternate_languages,
        area_description=area_description,
        geocodes=geocodes,
        geometry_type=geometry_type,
        coordinates=coordinates,
        has_spatial_geometry=has_spatial_geometry,
        raw_severity=raw_severity,
        raw_urgency=raw_urgency,
        raw_certainty=raw_certainty,
        warnings=warnings,
    )


def _parse_polygon_string(poly_str: str) -> Optional[List[Coordinate]]:
    """Parse CAP polygon coordinate string 'lat,lon lat,lon ...' into Coordinates."""
    pairs = poly_str.replace("\n", " ").split()
    coords: List[Coordinate] = []
    for pair in pairs:
        parts = pair.split(",")
        if len(parts) == 2:
            try:
                lat = float(parts[0].strip())
                lon = float(parts[1].strip())
                if -90.0 <= lat <= 90.0 and -180.0 <= lon <= 180.0:
                    coords.append(Coordinate(latitude=lat, longitude=lon))
            except ValueError:
                continue
    return coords if coords else None


def _parse_circle_string(circle_str: str) -> Optional[Coordinate]:
    """Parse CAP circle string 'lat,lon,radius' into center Coordinate."""
    parts = circle_str.replace("\n", " ").split(",")
    if len(parts) >= 2:
        try:
            lat = float(parts[0].strip())
            lon = float(parts[1].strip())
            if -90.0 <= lat <= 90.0 and -180.0 <= lon <= 180.0:
                return Coordinate(latitude=lat, longitude=lon)
        except ValueError:
            return None
    return None


class SachetCache:
    """In-memory TTL cache for alerts.

    Single-process implementation suitable for development and single-worker execution.
    Note: Cache state does not persist across process restarts or multi-worker processes.
    """

    def __init__(self, ttl_seconds: int = 300) -> None:
        self.ttl_seconds = ttl_seconds
        self._alerts: List[NormalizedAlert] = []
        self._cached_at: Optional[datetime] = None
        self._feed_url: Optional[str] = None

    def get(self) -> Optional[Tuple[List[NormalizedAlert], bool, datetime]]:
        """Retrieve cached alerts if any exist.

        Returns tuple of (alerts, is_stale, cached_at), or None if cache is empty.
        """
        if self._cached_at is None:
            return None
        now = datetime.now(timezone.utc)
        age_seconds = (now - self._cached_at).total_seconds()
        is_stale = age_seconds > self.ttl_seconds
        return self._alerts, is_stale, self._cached_at

    def set(self, alerts: List[NormalizedAlert], feed_url: str) -> None:
        """Store fresh alerts in cache."""
        self._alerts = list(alerts)
        self._cached_at = datetime.now(timezone.utc)
        self._feed_url = feed_url

    def clear(self) -> None:
        """Clear cached data."""
        self._alerts = []
        self._cached_at = None
        self._feed_url = None

    @property
    def has_data(self) -> bool:
        """Return True if cache holds data (fresh or stale)."""
        return self._cached_at is not None


class SachetAlertProvider:
    """Provider adapter for NDMA SACHET alert feed.

    Encapsulates RSS fetching, bounded CAP XML downloads, parsing, and caching.
    """

    def __init__(
        self,
        feed_url: Optional[str] = None,
        timeout_seconds: Optional[float] = None,
        cache_ttl_seconds: Optional[int] = None,
        max_alerts_per_fetch: Optional[int] = None,
    ) -> None:
        self.feed_url = feed_url or settings.SACHET_FEED_URL
        self.timeout_seconds = (
            timeout_seconds
            if timeout_seconds is not None
            else settings.SACHET_REQUEST_TIMEOUT_SECONDS
        )
        self.max_alerts = (
            max_alerts_per_fetch
            if max_alerts_per_fetch is not None
            else settings.SACHET_MAX_ALERTS_PER_FETCH
        )
        ttl = (
            cache_ttl_seconds
            if cache_ttl_seconds is not None
            else settings.SACHET_CACHE_TTL_SECONDS
        )
        self.cache = SachetCache(ttl_seconds=ttl)

    async def fetch_alerts(
        self, client: Optional[httpx.AsyncClient] = None
    ) -> Tuple[List[NormalizedAlert], ProviderStatus]:
        """Retrieve normalized alerts.

        Uses in-memory cache if fresh. On upstream failure, returns stale cache
        if available, or unavailable status if cold-start.
        """
        cached = self.cache.get()
        if cached is not None:
            cached_alerts, is_stale, cached_at = cached
            if not is_stale:
                return cached_alerts, ProviderStatus(
                    provider="ndma_sachet",
                    status="ok",
                    is_cached=True,
                    is_stale=False,
                    retrieved_at=cached_at,
                    error_message=None,
                    feed_url=self.feed_url,
                )

        # Fresh fetch required
        now_utc = datetime.now(timezone.utc)
        should_close_client = False
        if client is None:
            client = httpx.AsyncClient(timeout=self.timeout_seconds)
            should_close_client = True

        try:
            alerts = await self._fetch_from_upstream(client)
            self.cache.set(alerts, self.feed_url)
            return alerts, ProviderStatus(
                provider="ndma_sachet",
                status="ok",
                is_cached=False,
                is_stale=False,
                retrieved_at=now_utc,
                error_message=None,
                feed_url=self.feed_url,
            )
        except Exception as exc:
            safe_err = f"Upstream feed request failed: {type(exc).__name__}"
            logger.warning("SACHET fetch failure: %s", exc)

            # Check if stale cached data is available to serve degraded
            if cached is not None:
                cached_alerts, _, cached_at = cached
                return cached_alerts, ProviderStatus(
                    provider="ndma_sachet",
                    status="degraded",
                    is_cached=True,
                    is_stale=True,
                    retrieved_at=cached_at,
                    error_message=safe_err,
                    feed_url=self.feed_url,
                )

            # Cold start: no cache available
            return [], ProviderStatus(
                provider="ndma_sachet",
                status="unavailable",
                is_cached=False,
                is_stale=False,
                retrieved_at=None,
                error_message=safe_err,
                feed_url=self.feed_url,
            )
        finally:
            if should_close_client:
                await client.aclose()

    async def _fetch_from_upstream(self, client: httpx.AsyncClient) -> List[NormalizedAlert]:
        """Fetch RSS feed and bounded CAP XML alerts from upstream."""
        headers = {"User-Agent": "VARSHA-Mobility-Safety/0.1"}
        resp = await client.get(self.feed_url, headers=headers)
        resp.raise_for_status()

        items = parse_sachet_rss(resp.text)
        if not items:
            return []

        # Enforce bounded request budget: take at most self.max_alerts
        bounded_items = items[: self.max_alerts]
        semaphore = asyncio.Semaphore(5)

        async def _fetch_single_cap(item: Dict[str, Any]) -> Optional[NormalizedAlert]:
            async with semaphore:
                try:
                    cap_resp = await client.get(item["link"], headers=headers)
                    if cap_resp.status_code == 200:
                        return parse_cap_xml(cap_resp.text)
                    return None
                except Exception as ex:
                    logger.debug("Failed to fetch alert %s: %s", item.get("guid"), ex)
                    return None

        tasks = [_fetch_single_cap(it) for it in bounded_items]
        results = await asyncio.gather(*tasks, return_exceptions=False)
        return [alert for alert in results if alert is not None]


def filter_alerts_by_bbox(
    alerts: List[NormalizedAlert], bbox: BoundingBox
) -> List[NormalizedAlert]:
    """Filter alerts by bounding box coordinates.

    CRITICAL GEOGRAPHIC POLICY:
    Spatial filtering ONLY matches alerts that have verified coordinates (polygon or circle).
    Alerts with unresolved district-level geometry (no validated coordinate pairs)
    CANNOT be geometrically proven to fall inside or outside a bounding box, and are
    therefore excluded from coordinate-level bbox matches to prevent false positives.
    """
    matched: List[NormalizedAlert] = []
    for alert in alerts:
        if not alert.has_spatial_geometry or not alert.coordinates:
            continue

        # Check if any coordinate falls within bbox bounds
        if any(bbox.contains_coordinate(coord) for coord in alert.coordinates):
            matched.append(alert)

    return matched


# Global provider singleton
sachet_provider = SachetAlertProvider()
