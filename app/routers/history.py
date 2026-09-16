"""History endpoint: time-series of sensor metrics for a building."""

from fastapi import APIRouter, HTTPException, Query

from ..dependencies import DbConn
from ..schemas import HistoryResponse

router = APIRouter(prefix="/api/buildings", tags=["history"])

# Supported range presets -> the ``time_bucket`` used to downsample the series.
RANGES = {
    "1h": "5 minutes",
    "24h": "15 minutes",
    "7d": "1 hour",
    "30d": "6 hours",
}


@router.get("/{building_id}/history", response_model=HistoryResponse)
async def history(
    building_id: int,
    db: DbConn,
    range_: str = Query("24h", alias="range"),
):
    """Return downsampled history for a building over ``range``."""
    bucket = RANGES.get(range_)
    if bucket is None:
        raise HTTPException(
            status_code=400,
            detail=f"unsupported range {range_!r}; choose one of {sorted(RANGES)}",
        )

    async with db.cursor() as cur:
        await cur.execute(
            "SELECT id, name, slug FROM buildings WHERE id = %s", (building_id,)
        )
        building = await cur.fetchone()
        if building is None:
            raise HTTPException(status_code=404, detail="building not found")

        await cur.execute(
            """
            SELECT d.id, d.label, d.type, r.metric,
                   time_bucket(%s::interval, r.time) AS t,
                   avg(r.value) AS value
            FROM readings r
            JOIN devices d ON d.id = r.device_id
            WHERE d.building_id = %s
              AND r.time > now() - %s::interval
            GROUP BY d.id, d.label, d.type, r.metric, t
            ORDER BY d.id, r.metric, t
            """,
            (bucket, building_id, range_),
        )
        rows = await cur.fetchall()

    # Group flat rows into one series per (device, metric).
    series: dict[tuple[int, str], dict] = {}
    for device_id, label, device_type, metric, ts, value in rows:
        item = series.setdefault(
            (device_id, metric),
            {
                "device_id": device_id,
                "label": label,
                "type": device_type,
                "metric": metric,
                "points": [],
            },
        )
        item["points"].append({"time": ts, "value": value})

    return {
        "building": {"id": building[0], "name": building[1], "slug": building[2]},
        "range": range_,
        "series": list(series.values()),
    }
