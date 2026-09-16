"""Schemas for the "current readings" endpoint."""

from datetime import datetime

from pydantic import BaseModel

from .building import Building


class Sensor(BaseModel):
    device_id: int
    label: str
    type: str
    readings: dict[str, float]


class CurrentResponse(BaseModel):
    building: Building
    updated: datetime | None = None
    sensors: list[Sensor]
