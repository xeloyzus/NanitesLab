"""Deterministic analytics for summaries, insights, and recommendations."""

from __future__ import annotations

from datetime import datetime, timezone
from statistics import mean, median
from typing import Iterable

from psycopg import AsyncConnection

from ..schemas import Building
from ..schemas.analytics import (
    BuildingSummary,
    CampusSummary,
    DataQuality,
    EnergySummary,
    Freshness,
    Insight,
    Methodology,
    MetricStatistics,
    Recommendation,
)
from . import buildings_service, history_service

CURRENT_MINUTES = 20
DELAYED_MINUTES = 45
CO2_REFERENCE_PPM = 1000
CO2_RAPID_CHANGE_PPM = 150
SUSTAINED_MINUTES = 45
MINIMUM_SAMPLES = 4
EXPECTED_24H_SAMPLES_PER_SERIES = 96
METHODOLOGY_ID = "co2-v1"

METHODOLOGY = Methodology(
    id=METHODOLOGY_ID,
    title="Initial transparent CO2 recommendation rules",
    freshness_minutes={"current": CURRENT_MINUTES, "delayed": DELAYED_MINUTES},
    co2_reference_ppm=CO2_REFERENCE_PPM,
    co2_bands=[
        {"label": "typical", "from": 0, "to": 800, "color": "#2a9d8f"},
        {"label": "watch", "from": 800, "to": CO2_REFERENCE_PPM, "color": "#e9c46a"},
        {"label": "elevated", "from": CO2_REFERENCE_PPM, "to": None, "color": "#e76f51"},
    ],
    sustained_minutes=SUSTAINED_MINUTES,
    minimum_samples=MINIMUM_SAMPLES,
    notes=[
        "CO2 thresholds are configuration values for the first implementation slice.",
        "Recommendations are deterministic suggestions, not automated diagnoses.",
        "Correlation between metrics is not treated as evidence of causation.",
    ],
)


async def get_campus_summary(db: AsyncConnection) -> CampusSummary:
    buildings = await buildings_service.list_buildings(db)
    summaries = [
        summary
        for summary in [await get_building_summary(db, building.id) for building in buildings]
        if summary is not None
    ]

    generated_at = _now()
    co2 = _combine_metric("CO2", "ppm", [summary.co2 for summary in summaries])
    temperature = _combine_metric("Temperature", "°C", [summary.temperature for summary in summaries])
    energy = _combine_energy([summary.energy for summary in summaries])
    quality = _combine_quality([summary.data_quality for summary in summaries], generated_at)
    insights = _campus_insights(summaries)

    return CampusSummary(
        generated_at=generated_at,
        data_quality=quality,
        co2=co2,
        temperature=temperature,
        energy=energy,
        buildings=summaries,
        insights=insights,
    )


async def get_building_summary(
    db: AsyncConnection, building_id: int
) -> BuildingSummary | None:
    current = await buildings_service.get_current(db, building_id)
    if current is None:
        return None

    history = await history_service.get_history(db, building_id, "24h")
    if history is None:
        return None

    generated_at = _now()
    freshness = classify_freshness(current.updated, generated_at)
    active_sensors = len(current.sensors)
    stale_sensors = active_sensors if freshness.status == "stale" else 0

    co2 = _metric_stats(
        label="CO2",
        unit="ppm",
        metric="co2",
        current_values=[
            sensor.readings["co2"]
            for sensor in current.sensors
            if "co2" in sensor.readings
        ],
        history_series=history.series,
    )
    temperature = _metric_stats(
        label="Temperature",
        unit="°C",
        metric="temperature",
        current_values=[
            sensor.readings["temperature"]
            for sensor in current.sensors
            if "temperature" in sensor.readings
        ],
        history_series=history.series,
    )
    energy = _energy_summary(current.sensors)

    quality = DataQuality(
        active_sensors=active_sensors,
        stale_sensors=stale_sensors,
        coverage_24h=max(co2.coverage_24h, temperature.coverage_24h),
        freshness=freshness,
    )
    insights = _building_insights(current.building, quality, co2, temperature, energy)
    recommendations = _building_recommendations(current.building, quality, co2)

    return BuildingSummary(
        building=current.building,
        generated_at=generated_at,
        data_quality=quality,
        co2=co2,
        temperature=temperature,
        energy=energy,
        insights=insights,
        recommendations=recommendations,
    )


async def get_building_insights(db: AsyncConnection, building_id: int) -> list[Insight] | None:
    summary = await get_building_summary(db, building_id)
    return None if summary is None else summary.insights


async def get_building_recommendations(
    db: AsyncConnection, building_id: int
) -> list[Recommendation] | None:
    summary = await get_building_summary(db, building_id)
    return None if summary is None else summary.recommendations


def get_methodology() -> Methodology:
    return METHODOLOGY


def classify_freshness(latest: datetime | None, now: datetime | None = None) -> Freshness:
    if latest is None:
        return Freshness(
            status="unknown",
            latest_reading=None,
            age_minutes=None,
            description="No reading timestamp is available.",
        )

    now = now or _now()
    latest = _aware_utc(latest)
    age = max(0, round((now - latest).total_seconds() / 60))
    if age < CURRENT_MINUTES:
        status = "current"
        description = f"Latest reading is {age} min old."
    elif age <= DELAYED_MINUTES:
        status = "delayed"
        description = f"Latest reading is delayed at {age} min old."
    else:
        status = "stale"
        description = f"Latest reading is stale at {age} min old."

    return Freshness(
        status=status,
        latest_reading=latest,
        age_minutes=age,
        description=description,
    )


def _metric_stats(
    *,
    label: str,
    unit: str,
    metric: str,
    current_values: Iterable[float],
    history_series,
) -> MetricStatistics:
    matching_series = [series for series in history_series if series.metric == metric]
    points = [float(point.value) for series in matching_series for point in series.points]
    current = _rounded_mean(current_values)
    source_count = len(matching_series)
    expected = source_count * EXPECTED_24H_SAMPLES_PER_SERIES
    coverage = round(len(points) / expected, 2) if expected else 0.0

    if not points:
        return MetricStatistics(
            label=label,
            unit=unit,
            current=current,
            sample_count=0,
            source_count=source_count,
            coverage_24h=coverage,
        )

    change_1h = _change_over_last_hour(matching_series, current)
    precision = 1 if metric == "temperature" else 0

    return MetricStatistics(
        label=label,
        unit=unit,
        current=_round_optional(current, precision),
        mean_24h=round(mean(points), precision),
        median_24h=round(median(points), precision),
        min_24h=round(min(points), precision),
        max_24h=round(max(points), precision),
        p95_24h=round(_percentile(points, 95), precision),
        change_1h=_round_optional(change_1h, precision),
        sample_count=len(points),
        source_count=source_count,
        coverage_24h=coverage,
    )


def _energy_summary(sensors) -> EnergySummary:
    total_amps = 0.0
    for sensor in sensors:
        phase_values = [
            float(sensor.readings[metric])
            for metric in ("current_1", "current_2", "current_3")
            if metric in sensor.readings
        ]
        if phase_values:
            total_amps += sum(phase_values)

    current_kw = round(total_amps * 230 / 1000, 1) if total_amps else None
    return EnergySummary(
        current_kw=current_kw,
        method=(
            "Estimated from available CT305 phase-current readings at 230 V. "
            "Energy totals require calibrated kWh data."
        ),
    )


def _building_insights(
    building: Building,
    quality: DataQuality,
    co2: MetricStatistics,
    temperature: MetricStatistics,
    energy: EnergySummary,
) -> list[Insight]:
    insights: list[Insight] = []

    if quality.freshness.status in {"delayed", "stale"}:
        insights.append(
            Insight(
                id="sensor_stale",
                title=f"{building.name} data is {quality.freshness.status}",
                body=quality.freshness.description + " Current conditions may differ.",
                severity="warning",
                evidence={"age_minutes": quality.freshness.age_minutes},
            )
        )

    if co2.current is not None and co2.change_1h is not None:
        if co2.current >= CO2_REFERENCE_PPM and co2.change_1h >= CO2_RAPID_CHANGE_PPM:
            insights.append(
                Insight(
                    id="rapid_co2_rise",
                    title=f"CO2 is elevated and rising in {building.name}",
                    body=(
                        f"Average CO2 is {co2.current:.0f} ppm and has increased "
                        f"by about {co2.change_1h:.0f} ppm over the last hour."
                    ),
                    severity="attention",
                    metric="co2",
                    evidence={"current": co2.current, "change_1h": co2.change_1h},
                )
            )
        elif co2.max_24h is not None:
            insights.append(
                Insight(
                    id="daily_co2_peak",
                    title=f"{building.name} CO2 peaked at {co2.max_24h:.0f} ppm",
                    body="This is the highest measured CO2 value in the selected 24-hour window.",
                    severity="info",
                    metric="co2",
                    evidence={"max_24h": co2.max_24h, "samples": co2.sample_count},
                )
            )

    if energy.current_kw is not None:
        insights.append(
            Insight(
                id="estimated_energy_now",
                title=f"{building.name} electricity demand is about {energy.current_kw:.1f} kW",
                body="This is an estimate from available current readings and should be treated as directional.",
                severity="info",
                metric="energy",
                evidence={"current_kw": energy.current_kw},
            )
        )

    if not insights and temperature.current is not None:
        insights.append(
            Insight(
                id="temperature_context",
                title=f"{building.name} temperature is {temperature.current:.1f} °C",
                body="No notable CO2 or electricity pattern was detected from the current data slice.",
                severity="info",
                metric="temperature",
                evidence={"current": temperature.current},
            )
        )

    return insights[:3]


def _building_recommendations(
    building: Building, quality: DataQuality, co2: MetricStatistics
) -> list[Recommendation]:
    if (
        co2.current is None
        or co2.current < CO2_REFERENCE_PPM
        or co2.sample_count < MINIMUM_SAMPLES
        or quality.freshness.status == "stale"
    ):
        return []

    confidence = "medium"
    if co2.coverage_24h >= 0.8 and co2.change_1h is not None and co2.change_1h > 0:
        confidence = "high"
    elif co2.coverage_24h < 0.5 or quality.freshness.status == "delayed":
        confidence = "low"

    return [
        Recommendation(
            id="co2_sustained_elevation",
            title=f"CO2 may need attention in {building.name}",
            evidence={
                "current": co2.current,
                "reference": CO2_REFERENCE_PPM,
                "change_1h": co2.change_1h,
                "samples": co2.sample_count,
                "coverage_24h": co2.coverage_24h,
            },
            interpretation=(
                "The pattern is consistent with ventilation not keeping pace with "
                "room activity, but sensor data alone does not prove the cause."
            ),
            actions=[
                "Students can consider another study area if the room feels crowded or uncomfortable.",
                "Facilities can review ventilation operation or scheduling if the pattern recurs.",
            ],
            audience=["student", "facilities"],
            confidence=confidence,
            verification="Watch whether CO2 trends downward over the next 30-60 minutes.",
            methodology_id=METHODOLOGY_ID,
        )
    ]


def _campus_insights(summaries: list[BuildingSummary]) -> list[Insight]:
    insights: list[Insight] = []
    if not summaries:
        return insights

    with_co2 = [summary for summary in summaries if summary.co2.current is not None]
    if with_co2:
        highest = max(with_co2, key=lambda item: item.co2.current or 0)
        insights.append(
            Insight(
                id="campus_highest_co2",
                title=f"{highest.building.name} has the highest current CO2 average",
                body=(
                    f"Current average is {highest.co2.current:.0f} ppm across "
                    f"{highest.co2.source_count} reporting air sensors."
                ),
                severity="info",
                metric="co2",
                evidence={
                    "building_id": highest.building.id,
                    "current": highest.co2.current,
                    "source_count": highest.co2.source_count,
                },
            )
        )

    stale_count = sum(summary.data_quality.stale_sensors for summary in summaries)
    if stale_count:
        insights.append(
            Insight(
                id="campus_stale_sensors",
                title=f"{stale_count} sensors are represented by stale building data",
                body="Stale readings are excluded from claims about current conditions.",
                severity="warning",
                evidence={"stale_sensors": stale_count},
            )
        )

    return insights[:4]


def _combine_metric(
    label: str, unit: str, metrics: Iterable[MetricStatistics]
) -> MetricStatistics:
    metric_list = list(metrics)
    current_values = [metric.current for metric in metric_list if metric.current is not None]
    coverage_values = [metric.coverage_24h for metric in metric_list if metric.source_count]
    sample_count = sum(metric.sample_count for metric in metric_list)
    source_count = sum(metric.source_count for metric in metric_list)
    all_means = [metric.mean_24h for metric in metric_list if metric.mean_24h is not None]

    precision = 1 if unit == "°C" else 0
    return MetricStatistics(
        label=label,
        unit=unit,
        current=_round_optional(_rounded_mean(current_values), precision),
        mean_24h=_round_optional(_rounded_mean(all_means), precision),
        median_24h=None,
        min_24h=min(
            [metric.min_24h for metric in metric_list if metric.min_24h is not None],
            default=None,
        ),
        max_24h=max(
            [metric.max_24h for metric in metric_list if metric.max_24h is not None],
            default=None,
        ),
        p95_24h=None,
        change_1h=_round_optional(
            _rounded_mean(
                [metric.change_1h for metric in metric_list if metric.change_1h is not None]
            ),
            precision,
        ),
        sample_count=sample_count,
        source_count=source_count,
        coverage_24h=round(mean(coverage_values), 2) if coverage_values else 0.0,
    )


def _combine_energy(energies: Iterable[EnergySummary]) -> EnergySummary:
    values = [energy.current_kw for energy in energies if energy.current_kw is not None]
    return EnergySummary(
        current_kw=round(sum(values), 1) if values else None,
        method="Campus estimate sums building-level CT305 phase-current estimates.",
    )


def _combine_quality(qualities: list[DataQuality], generated_at: datetime) -> DataQuality:
    latest = max(
        [
            quality.freshness.latest_reading
            for quality in qualities
            if quality.freshness.latest_reading is not None
        ],
        default=None,
    )
    coverage_values = [quality.coverage_24h for quality in qualities]
    return DataQuality(
        active_sensors=sum(quality.active_sensors for quality in qualities),
        stale_sensors=sum(quality.stale_sensors for quality in qualities),
        coverage_24h=round(mean(coverage_values), 2) if coverage_values else 0.0,
        freshness=classify_freshness(latest, generated_at),
    )


def _change_over_last_hour(series_list, current: float | None) -> float | None:
    if current is None:
        return None

    changes = []
    for series in series_list:
        if len(series.points) < 5:
            continue
        recent = float(series.points[-1].value)
        previous = float(series.points[-5].value)
        changes.append(recent - previous)

    if not changes:
        return None
    return mean(changes)


def _percentile(values: list[float], percentile: int) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    index = round((percentile / 100) * (len(ordered) - 1))
    return ordered[index]


def _rounded_mean(values: Iterable[float | None]) -> float | None:
    clean = [float(value) for value in values if value is not None]
    if not clean:
        return None
    return mean(clean)


def _round_optional(value: float | None, precision: int = 1) -> float | None:
    return None if value is None else round(value, precision)


def _aware_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _now() -> datetime:
    return datetime.now(timezone.utc)
