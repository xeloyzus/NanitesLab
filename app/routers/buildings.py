"""Building endpoints (thin HTTP layer; logic lives in services)."""

from fastapi import APIRouter, HTTPException

from ..dependencies import DbConn
from ..schemas import Building, CurrentResponse
from ..services import buildings_service

router = APIRouter(prefix="/api/buildings", tags=["buildings"])


@router.get("", response_model=list[Building])
async def list_buildings(db: DbConn):
    return await buildings_service.list_buildings(db)


@router.get("/{building_id}/current", response_model=CurrentResponse)
async def current(building_id: int, db: DbConn):
    result = await buildings_service.get_current(db, building_id)
    if result is None:
        raise HTTPException(status_code=404, detail="building not found")
    return result

