"""History endpoint (thin HTTP layer; logic lives in services)."""

from fastapi import APIRouter, HTTPException, Query

from ..dependencies import DbConn
from ..schemas import HistoryResponse
from ..services import history_service

router = APIRouter(prefix="/api/buildings", tags=["history"])


@router.get("/{building_id}/history", response_model=HistoryResponse)
async def history(
    building_id: int,
    db: DbConn,
    range_: str = Query("24h", alias="range"),
):
    try:
        result = await history_service.get_history(db, building_id, range_)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    if result is None:
        raise HTTPException(status_code=404, detail="building not found")
    return result

