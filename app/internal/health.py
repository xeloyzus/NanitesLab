"""Internal ops endpoints (health checks used by orchestration/monitoring)."""

from fastapi import APIRouter

router = APIRouter(tags=["internal"])


@router.get("/health")
async def health():
    return {"status": "ok"}
