"""Schemas for analytics, insight, and recommendation endpoints."""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from .building import Building


class Freshness(BaseModel):
    status: str
    latest_reading: datetime | None = None
    age_minutes: int | None = None
    description: str


class DataQuality(BaseModel):
    active_sensors: int
    stale_sensors: int
    coverage_24h: float
    freshness: Freshness


class MetricStatistics(BaseModel):
    label: str
    unit: str
    current: float | None = None
    mean_24h: float | None = None
    median_24h: float | None = None
    min_24h: float | None = None
    max_24h: float | None = None
    p95_24h: float | None = None
    change_1h: float | None = None
    sample_count: int
    source_count: int
    coverage_24h: float


class EnergySummary(BaseModel):
    label: str = "Estimated electricity demand"
    unit: str = "kW"
    current_kw: float | None = None
    today_kwh: float | None = None
    peak_kw: float | None = None
    peak_time: datetime | None = None
    method: str


class Insight(BaseModel):
    id: str
    title: str
    body: str
    severity: str
    metric: str | None = None
    evidence: dict[str, Any] = Field(default_factory=dict)


class Recommendation(BaseModel):
    id: str
    title: str
    evidence: dict[str, Any]
    interpretation: str
    actions: list[str]
    audience: list[str]
    confidence: str
    verification: str
    methodology_id: str


class BuildingSummary(BaseModel):
    building: Building
    generated_at: datetime
    data_quality: DataQuality
    co2: MetricStatistics
    temperature: MetricStatistics
    energy: EnergySummary
    insights: list[Insight]
    recommendations: list[Recommendation]


class CampusSummary(BaseModel):
    generated_at: datetime
    data_quality: DataQuality
    co2: MetricStatistics
    temperature: MetricStatistics
    energy: EnergySummary
    buildings: list[BuildingSummary]
    insights: list[Insight]


class Methodology(BaseModel):
    id: str
    title: str
    freshness_minutes: dict[str, int]
    co2_reference_ppm: int
    co2_bands: list[dict[str, Any]]
    sustained_minutes: int
    minimum_samples: int
    notes: list[str]
