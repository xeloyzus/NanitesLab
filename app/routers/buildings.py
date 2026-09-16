"""Building endpoints: list buildings and read their latest sensor values."""

from fastapi import APIRouter, HTTPException

from ..dependencies import DbConn
from ..schemas import Building, CurrentResponse

router = APIRouter(prefix="/api/buildings", tags=["buildings"])


@router.get("", response_model=list[Building])
async def list_buildings(db: DbConn):
    """Return every building (id, name, slug)."""
    async with db.cursor() as cur:
        await cur.execute("SELECT id, name, slug FROM buildings ORDER BY id")
        rows = await cur.fetchall()
    return [{"id": r[0], "name": r[1], "slug": r[2]} for r in rows]


@router.get("/{building_id}/current", response_model=CurrentResponse)
async def current(building_id: int, db: DbConn):
    """Latest value of every metric for every device in a building."""
    latest = """
        SELECT DISTINCT ON (d.id, r.metric)
               d.id, d.label, d.type, r.metric, r.value, r.time
        FROM readings r
        JOIN devices d ON d.id = r.device_id
        WHERE d.building_id = %s
        ORDER BY d.id, r.metric, r.time DESC
    """
    async with db.cursor() as cur:
        await cur.execute(
            "SELECT id, name, slug FROM buildings WHERE id = %s", (building_id,)
        )
        building = await cur.fetchone()
        if building is None:
            raise HTTPException(status_code=404, detail="building not found")

        await cur.execute(latest, (building_id,))
        rows = await cur.fetchall()

    # Group the flat rows into one entry per device.
    sensors: dict[int, dict] = {}
    for device_id, label, device_type, metric, value, _ts in rows:
        device = sensors.setdefault(
            device_id,
            {
                "device_id": device_id,
                "label": label,
                "type": device_type,
                "readings": {},
            },
        )
        device["readings"][metric] = value

    return {
        "building": {"id": building[0], "name": building[1], "slug": building[2]},
        "updated": max((r[5] for r in rows), default=None),
        "sensors": list(sensors.values()),
    }
