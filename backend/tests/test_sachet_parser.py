"""Tests for NDMA SACHET RSS and CAP 1.2 XML parsers."""
from datetime import datetime, timezone
from pathlib import Path
import pytest
from app.services.alerts.sachet import parse_cap_xml, parse_sachet_rss

FIXTURES_DIR = Path(__file__).parent / "fixtures" / "sachet"


def _read_fixture(filename: str) -> str:
    path = FIXTURES_DIR / filename
    return path.read_text(encoding="utf-8")


def test_parse_sachet_rss_valid() -> None:
    """Test parsing of valid RSS feed with 2 alert items."""
    xml_content = _read_fixture("rss_sample.xml")
    items = parse_sachet_rss(xml_content)

    assert len(items) == 2
    first = items[0]
    assert first["title"] == "Flash Flood Warning for Thane"
    assert "FetchXMLFile?identifier=TEST-ALERT-001" in first["link"]
    assert first["guid"] == "TEST-ALERT-001"
    assert first["pub_date"] is not None
    assert first["pub_date"].tzinfo is not None


def test_parse_sachet_rss_empty() -> None:
    """Test empty RSS feed returns empty list safely."""
    xml_content = _read_fixture("rss_empty.xml")
    items = parse_sachet_rss(xml_content)
    assert items == []


def test_parse_sachet_rss_malformed() -> None:
    """Test malformed RSS XML raises ValueError."""
    xml_content = _read_fixture("rss_malformed.xml")
    with pytest.raises(ValueError, match="Malformed RSS XML"):
        parse_sachet_rss(xml_content)


def test_parse_sachet_rss_empty_string() -> None:
    """Test empty string returns empty list."""
    assert parse_sachet_rss("") == []
    assert parse_sachet_rss("   ") == []


def test_parse_cap_xml_standard() -> None:
    """Test standard CAP 1.2 XML parsing with namespace and LGD geocode."""
    xml_content = _read_fixture("cap_alert_sample.xml")
    alert = parse_cap_xml(xml_content)

    assert alert.identifier == "TEST-ALERT-001"
    assert alert.sender == "in-imd-rsmc-newdelhi"
    assert alert.status == "Actual"
    assert alert.msg_type == "Alert"
    assert alert.category == "Met"
    assert alert.event == "Flash Flood"
    assert alert.severity == "Severe"
    assert alert.urgency == "Expected"
    assert alert.certainty == "Likely"
    assert alert.is_active is True
    assert alert.language == "en-IN"
    assert alert.area_description == "Thane District, Maharashtra"
    assert alert.geometry_type == "unresolved"
    assert alert.has_spatial_geometry is False
    assert len(alert.geocodes) == 1
    assert alert.geocodes[0].value_name == "LGD"
    assert alert.geocodes[0].value == "496"
    assert alert.sent is not None
    assert alert.expires is not None


def test_parse_cap_xml_multilingual() -> None:
    """Test English info block is preferred while retaining Hindi in alternate_languages."""
    xml_content = _read_fixture("cap_multilingual.xml")
    alert = parse_cap_xml(xml_content)

    assert alert.language == "en-IN"
    assert alert.headline == "Heavy Rainfall Warning for Thane"
    assert "hi-IN" in alert.alternate_languages


def test_parse_cap_xml_cancellation() -> None:
    """Test CAP Cancel message is explicitly marked is_active=False."""
    xml_content = _read_fixture("cap_cancelled.xml")
    alert = parse_cap_xml(xml_content)

    assert alert.msg_type == "Cancel"
    assert alert.is_active is False
    assert "TEST-ALERT-001" in (alert.references or "")


def test_parse_cap_xml_update() -> None:
    """Test CAP Update message updates severity and preserves references."""
    xml_content = _read_fixture("cap_update.xml")
    alert = parse_cap_xml(xml_content)

    assert alert.msg_type == "Update"
    assert alert.severity == "Extreme"
    assert alert.urgency == "Immediate"
    assert alert.is_active is True
    assert "TEST-ALERT-001" in (alert.references or "")


def test_parse_cap_xml_expired() -> None:
    """Test alert past expiration date is marked is_active=False."""
    xml_content = _read_fixture("cap_expired.xml")
    alert = parse_cap_xml(xml_content)

    assert alert.is_active is False
    assert alert.expires is not None
    assert alert.expires < datetime.now(timezone.utc)


def test_parse_cap_xml_polygon() -> None:
    """Test polygon geometry is parsed into validated Coordinates with has_spatial_geometry=True."""
    xml_content = _read_fixture("cap_with_polygon.xml")
    alert = parse_cap_xml(xml_content)

    assert alert.geometry_type == "polygon"
    assert alert.has_spatial_geometry is True
    assert alert.coordinates is not None
    assert len(alert.coordinates) == 5
    assert alert.coordinates[0].latitude == 19.03
    assert alert.coordinates[0].longitude == 73.02


def test_parse_cap_xml_minimal() -> None:
    """Test minimal CAP alert with missing optional fields."""
    xml_content = _read_fixture("cap_minimal.xml")
    alert = parse_cap_xml(xml_content)

    assert alert.identifier == "TEST-ALERT-MIN-007"
    assert alert.severity == "Unknown"
    assert alert.urgency == "Unknown"
    assert alert.certainty == "Unknown"
    assert alert.description is None
    assert alert.geometry_type == "unresolved"
    assert alert.has_spatial_geometry is False


def test_parse_cap_xml_unknown_enum() -> None:
    """Test non-standard enum strings are preserved as raw text without inflating severity."""
    xml_content = _read_fixture("cap_unknown_enum.xml")
    alert = parse_cap_xml(xml_content)

    assert alert.severity == "Catastrophic"
    assert alert.raw_severity == "Catastrophic"
    assert alert.urgency == "RealTime"
    assert alert.raw_urgency == "RealTime"
    assert alert.certainty == "HighProbability"


def test_parse_cap_xml_malformed() -> None:
    """Test malformed CAP XML raises ValueError."""
    with pytest.raises(ValueError, match="Malformed CAP XML"):
        parse_cap_xml("<alert><identifier>broken")


def test_parse_cap_xml_not_alert_root() -> None:
    """Test non-<alert> root raises ValueError."""
    with pytest.raises(ValueError, match="Root element is not <alert>"):
        parse_cap_xml("<notalert><identifier>1</identifier></notalert>")
