"""Tests for the first deterministic analytics slice."""

import asyncio

from app.core.config import settings
from app.services import analytics_service


def test_demo_building_summary_has_evidence(monkeypatch):
    monkeypatch.setattr(settings, "demo_mode", True)

    summary = asyncio.run(analytics_service.get_building_summary(None, 2))

    assert summary is not None
    assert summary.building.name == "Library"
    assert summary.co2.current is not None
    assert summary.co2.sample_count > 0
    assert summary.data_quality.freshness.status == "current"
    assert summary.insights


def test_campus_summary_and_methodology_demo_mode(monkeypatch):
    monkeypatch.setattr(settings, "demo_mode", True)

    campus = asyncio.run(analytics_service.get_campus_summary(None))
    methodology = analytics_service.get_methodology()

    assert campus.buildings
    assert methodology.id == "co2-v1"
