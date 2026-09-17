"""Analytics endpoints for the student-facing dashboard."""

from fastapi import APIRouter, HTTPException

from ..dependencies import DbConn
from ..schemas.analytics import (
    BuildingSummary,
    CampusSummary,
    Insight,
    Methodology,
    Recommendation,
)
from ..services import analytics_service

router = APIRouter(prefix="/api", tags=["analytics"])


@router.get("/campus/summary", response_model=CampusSummary)
async def campus_summary(db: DbConn):
    return await analytics_service.get_campus_summary(db)


@router.get("/buildings/{building_id}/summary", response_model=BuildingSummary)
async def building_summary(building_id: int, db: DbConn):
    result = await analytics_service.get_building_summary(db, building_id)
    if result is None:
        raise HTTPException(status_code=404, detail="building not found")
    return result


@router.get("/buildings/{building_id}/insights", response_model=list[Insight])
async def building_insights(building_id: int, db: DbConn):
    result = await analytics_service.get_building_insights(db, building_id)
    if result is None:
        raise HTTPException(status_code=404, detail="building not found")
    return result


@router.get("/buildings/{building_id}/recommendations", response_model=list[Recommendation])
async def building_recommendations(building_id: int, db: DbConn):
    result = await analytics_service.get_building_recommendations(db, building_id)
    if result is None:
        raise HTTPException(status_code=404, detail="building not found")
    return result


@router.get("/methodology", response_model=Methodology)
async def methodology():
    return analytics_service.get_methodology()
