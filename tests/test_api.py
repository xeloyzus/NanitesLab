"""Smoke tests for the API wiring (no database connection required)."""

from app.main import app


def test_openapi_paths():
    paths = sorted(app.openapi()["paths"])
    assert paths == [
        "/api/buildings",
        "/api/buildings/{building_id}/current",
        "/api/buildings/{building_id}/history",
        "/health",
    ]


def test_app_title():
    assert app.title == "NanitesLab API"
