"""Tests for the Jinja2 templates (no server/database needed)."""

from app.routers.pages import templates


def test_index_template_renders():
    html = templates.get_template("index.html").render()
    assert "NanitesLab" in html
    assert "initKiosk" in html
    assert "kiosk.js" in html
    assert "kiosk-core.js" in html
    assert "chart.js" in html  # Chart.js is loaded only on the kiosk page


def test_mobile_template_renders():
    html = templates.get_template("mobile.html").render()
    assert "NanitesLab" in html
    assert "initMobile" in html
    assert "chart.js" not in html  # mobile page skips the chart library
