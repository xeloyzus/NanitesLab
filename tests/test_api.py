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


def test_frontend_wiring():
    from app.routers import pages

    # The two HTML pages are registered on the pages router.
    assert {r.path for r in pages.router.routes} == {"/", "/mobile"}

    # Static assets are mounted at /static.
    assert any(getattr(r, "path", None) == "/static" for r in app.routes)

    # HTML pages are excluded from the JSON API schema.
    api_paths = app.openapi()["paths"]
    assert "/" not in api_paths
    assert "/mobile" not in api_paths


