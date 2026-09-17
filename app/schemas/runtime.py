"""Schemas for deployment/runtime status endpoints."""

from pydantic import BaseModel


class RuntimeStatus(BaseModel):
    app: str
    mode: str
    data_source: str
    demo_mode: bool
    database_configured: bool
    gateway_ingest_expected: bool
    kiosk_refresh_seconds: int
