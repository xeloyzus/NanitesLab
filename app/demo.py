"""Deterministic demo data for previewing the frontend without a database.

Enable with ``DEMO_MODE=1`` (and a dummy ``DATABASE_URL``). Generates three
buildings with a few air-quality sensors and one power clamp each, plus 24h
of plausible history so the gauges and charts render.
"""

import math
import random
from datetime import datetime, timedelta, timezone

from .schemas import (
    Building,
    CurrentResponse,
    HistoryPoint,
    HistoryResponse,
    Sensor,
    Series,
)

_BUILDINGS = [
    {"id": 1, "name": "Kjølv Egelands hus", "slug": "kjolv-egelands-hus", "co2": 650, "temp": 21.5},
    {"id": 2, "name": "Library", "slug": "library", "co2": 900, "temp": 22.0},
    {"id": 3, "name": "Arne Rettedals hus", "slug": "arne-rettedals-hus", "co2": 1150, "temp": 22.8},
]

_rng = random.Random(42)


def list_buildings() -> list[Building]:
    return [Building(id=b["id"], name=b["name"], slug=b["slug"]) for b in _BUILDINGS]


def get_current(building_id: int) -> CurrentResponse | None:
    b = _find(building_id)
    if b is None:
        return None

    sensors = []
    for i in range(1, 4):
        sensors.append(Sensor(
            device_id=building_id * 10 + i,
            label=f"{b['name']} — Room {i}",
            type="am103",
            readings={
                "co2": round(b["co2"] + _rng.uniform(-80, 80)),
                "temperature": round(b["temp"] + _rng.uniform(-1, 1), 1),
                "humidity": round(38 + _rng.uniform(-8, 8), 1),
            },
        ))
    sensors.append(Sensor(
        device_id=building_id * 10 + 9,
        label=f"{b['name']} — Main panel",
        type="ct305",
        readings={
            "current_1": round(_rng.uniform(4, 16), 1),
            "current_2": round(_rng.uniform(3, 13), 1),
            "current_3": round(_rng.uniform(4, 15), 1),
            "total_1": round(_rng.uniform(50, 300)),
            "total_2": round(_rng.uniform(40, 260)),
            "total_3": round(_rng.uniform(50, 290)),
        },
    ))

    # Demo the "stale" UI on the third building (45 min since its last report).
    updated = datetime.now(timezone.utc)
    if building_id == 3:
        updated -= timedelta(minutes=45)

    return CurrentResponse(
        building=Building(id=b["id"], name=b["name"], slug=b["slug"]),
        updated=updated,
        sensors=sensors,
    )


def get_history(building_id: int, range_: str) -> HistoryResponse | None:
    b = _find(building_id)
    if b is None:
        return None

    series = []
    for i in range(1, 4):
        label = f"{b['name']} — Room {i}"
        device_id = building_id * 10 + i
        series.append(Series(
            device_id=device_id, label=label, type="am103", metric="co2",
            points=_series(b["co2"], 90),
        ))
        series.append(Series(
            device_id=device_id, label=label, type="am103", metric="temperature",
            points=_series(b["temp"], 1.2, 1),
        ))

    return HistoryResponse(
        building=Building(id=b["id"], name=b["name"], slug=b["slug"]),
        range=range_,
        series=series,
    )


def _find(building_id: int):
    return next((x for x in _BUILDINGS if x["id"] == building_id), None)


def _series(base: float, amplitude: float, decimals: int = 0) -> list[HistoryPoint]:
    """96 points (24h at 15-min steps) with a daily cycle + noise."""
    now = datetime.now(timezone.utc)
    points = []
    for i in range(96):
        t = now - timedelta(minutes=(95 - i) * 15)
        hour = t.hour + t.minute / 60
        value = base + amplitude * math.sin((hour - 9) * math.pi / 12) + _rng.uniform(-amplitude * 0.3, amplitude * 0.3)
        points.append(HistoryPoint(time=t, value=round(value, decimals)))
    return points
