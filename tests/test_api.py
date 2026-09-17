"""Smoke tests for the API wiring (no database connection required)."""

from app.main import app


def test_openapi_paths():
    paths = sorted(app.openapi()["paths"])
    assert paths == sorted(
        [
            "/api/buildings",
            "/api/buildings/{building_id}/current",
            "/api/buildings/{building_id}/history",
            "/api/buildings/{building_id}/insights",
            "/api/buildings/{building_id}/recommendations",
            "/api/buildings/{building_id}/summary",
            "/api/campus/summary",
            "/api/methodology",
            "/api/system/status",
            "/health",
        ]
    )


def test_app_title():
    assert app.title == "NanitesLab API"


def test_frontend_wiring():
    from app.routers import pages

    # Kiosk, web overview, and mobile HTML pages are registered on the pages router.
    assert {r.path for r in pages.router.routes} == {"/", "/kiosk", "/mobile", "/overview"}

    # Static assets are mounted at /static.
    assert any(getattr(r, "path", None) == "/static" for r in app.routes)

    # HTML pages are excluded from the JSON API schema.
    api_paths = app.openapi()["paths"]
    assert "/" not in api_paths
    assert "/kiosk" not in api_paths
    assert "/mobile" not in api_paths
    assert "/overview" not in api_paths


def test_runtime_status_contract(monkeypatch):
    import asyncio

    from app.core.config import settings
    from app.routers import system

    monkeypatch.setattr(settings, "demo_mode", False)
    monkeypatch.setattr(settings, "database_url", "postgresql://user:pass@db:5432/naniteslab")
    monkeypatch.setattr(settings, "kiosk_refresh_seconds", 45)

    status = asyncio.run(system.status())

    assert status.mode == "live"
    assert status.data_source == "timescaledb"
    assert status.database_configured is True
    assert status.gateway_ingest_expected is True
    assert status.kiosk_refresh_seconds == 45
