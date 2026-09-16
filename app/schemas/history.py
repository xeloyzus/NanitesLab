"""Schemas for the "history" endpoint."""

from datetime import datetime

from pydantic import BaseModel

from .building import Building


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
