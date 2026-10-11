"""
routes/dashboard.py
--------------------
    GET /dashboard/sensors                      EVERY registered sensor with all latest values (no limit) + devices + counts
    GET /dashboard/sensors/{sensor_id}/history  readings AND fault events (timeouts / invalid / missing stay visible)
    PUT /dashboard/sensors/{sensor_id}/device   group sensors into one device card (e.g. DHT22 temp + humidity)
"""
import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field

from database import get_database
from services import dashboard_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


class DeviceAssign(BaseModel):
    device_group: str | None = Field(default=None, max_length=64, description="same value on every measurement of one device")
    device_model: str | None = Field(default=None, max_length=64, examples=["DHT22"])


@router.get("/sensors")
async def sensors(db: AsyncIOMotorDatabase = Depends(get_database)):
    # An unhandled exception would be answered by Starlette's outermost handler WITHOUT CORS headers,
    # which the browser reports as a mysterious "Failed to fetch". An HTTPException keeps the CORS headers
    # and carries a readable reason to the UI.
    try:
        return await dashboard_service.get_sensor_dashboard(db)
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        logger.exception("GET /dashboard/sensors failed")
        raise HTTPException(status_code=500, detail=f"Dashboard query failed: {type(exc).__name__}: {exc}")


@router.get("/sensors/{sensor_id}/history")
async def history(sensor_id: str, limit: int = Query(default=100, ge=1, le=500),
                  db: AsyncIOMotorDatabase = Depends(get_database)):
    try:
        return await dashboard_service.get_sensor_history(db, sensor_id, limit)
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        logger.exception("GET /dashboard/sensors/%s/history failed", sensor_id)
        raise HTTPException(status_code=500, detail=f"History query failed: {type(exc).__name__}: {exc}")


@router.put("/sensors/{sensor_id}/device")
async def device(sensor_id: str, body: DeviceAssign, db: AsyncIOMotorDatabase = Depends(get_database)):
    return await dashboard_service.set_device(db, sensor_id, body.device_group, body.device_model)
