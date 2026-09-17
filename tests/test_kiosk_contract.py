"""Static contract checks for the kiosk display system."""

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_kiosk_css_uses_bounded_display_frame():
    css = (ROOT / "app/static/css/kiosk-pulse.css").read_text()

    assert "grid-template-rows:" in css
    assert ".kiosk-scene" in css
    assert "overflow: hidden;" in css
    assert ".kiosk-quality-list" in css
    assert ".kiosk-action-audiences" in css
    assert ".kiosk-qr-panel" in css


def test_kiosk_js_has_installation_presets_and_location_focus():
    js = (ROOT / "app/static/js/kiosk-pulse.js").read_text()

    assert "KIOSK_PRESETS" in js
    assert "hallway" in js
    assert "small-screen" in js
    assert "pickLocalBuilding" in js
    assert "renderDataQuality" in js
    assert "renderCampusMap" in js
    assert "kiosk-action-audiences" in js
    assert "getSystemStatus" in js
    assert "renderKioskUnavailable" in js
