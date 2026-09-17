"""Runtime status endpoints shared by the frontend and deployment checks."""

from fastapi import APIRouter

from ..core.config import settings
from ..schemas import RuntimeStatus

router = APIRouter(prefix="/api/system", tags=["system"])


@router.get("/status", response_model=RuntimeStatus)
async def status():
    return RuntimeStatus(
        app="NanitesLab",
        mode=settings.runtime_mode,
        data_source=settings.data_source,
        demo_mode=settings.demo_mode,
        database_configured=bool(settings.database_url),
        gateway_ingest_expected=not settings.demo_mode,
        kiosk_refresh_seconds=settings.kiosk_refresh_seconds,
    )
