"""Pydantic response models.

These define the JSON shapes served to the frontend and drive the automatic
OpenAPI documentation (``/docs``).
"""

from datetime import datetime

from pydantic import BaseModel


class Building(BaseModel):
    id: int
    name: str
    slug: str


class Sensor(BaseModel):
    device_id: int
    label: str
    type: str
    readings: dict[str, float]


class CurrentResponse(BaseModel):
    building: Building
    updated: datetime | None = None
    sensors: list[Sensor]


class HistoryPoint(BaseModel):
    time: datetime
    value: float


class Series(BaseModel):
    device_id: int
    label: str
    type: str
    metric: str
    points: list[HistoryPoint]


class HistoryResponse(BaseModel):
    building: Building
    range: str
    series: list[Series]
