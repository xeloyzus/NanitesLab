"""Tests for the Jinja2 templates (no server/database needed)."""

from app.routers.pages import templates


def test_index_template_renders():
    html = templates.get_template("index.html").render()
    assert "NanitesLab" in html
    assert "Campus Kiosk" in html
    assert "initKioskPulse" in html
    assert "kiosk-pulse.js" in html
    assert "timeSeries.js" in html
    assert "chart.js" not in html


def test_overview_template_renders():
    html = templates.get_template("overview.html").render()
    assert "NanitesLab" in html
    assert "UiS Campus Pulse" in html
    assert "initCampusPulse" in html
    assert "timeSeries.js" in html
    assert "data-source-badge" in html
    assert "d3@7" in html
    assert "chart.js" not in html


def test_kiosk_template_renders():
    html = templates.get_template("kiosk.html").render()
    assert "NanitesLab" in html
    assert "Campus Kiosk" in html
    assert "initKioskPulse" in html
    assert "kiosk-pulse.css" in html
    assert "kiosk-source" in html
    assert 'data-scene="local-focus"' in html
    assert 'data-scene="campus-map"' in html
    assert 'data-scene="data-quality"' in html
    assert 'data-scene="qr"' in html
    assert "chart.js" not in html


def test_mobile_template_renders():
    html = templates.get_template("mobile.html").render()
    assert "NanitesLab" in html
    assert "loadDashboard" in html
    assert "chart.js" not in html  # mobile page skips the chart library
