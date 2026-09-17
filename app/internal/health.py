"""Internal ops endpoints (health checks used by orchestration/monitoring)."""

from fastapi import APIRouter

from ..core.config import settings

router = APIRouter(tags=["internal"])


@router.get("/health")
async def health():
    return {
        "status": "ok",
        "mode": settings.runtime_mode,
        "data_source": settings.data_source,
        "database_configured": bool(settings.database_url),
    }
