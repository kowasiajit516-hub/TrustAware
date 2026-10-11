"""
routes/learning.py
-------------------
    PUT/GET  /sensor-processing/{sensor_id}   calibration / filter / physical limits
    POST     /learning/{sensor_id}/start      begin collecting the user-selected number of valid readings
    POST     /learning/{sensor_id}/cancel
    GET      /learning/{sensor_id}/status     progress, baseline, latest processed, comm reliability, quality score
    GET      /learning/{sensor_id}/readings   the valid readings of a session (default: latest), with AI / trust evidence
    GET      /learning/{sensor_id}/result     persisted Final Learned Sensor Result
    GET      /learning/{sensor_id}/sessions   history of tests (formula version, score, status)
    POST     /invalid-readings                device-reported failure (NaN, WiFi down, ...)
    GET      /invalid-readings                fault / anomaly event history
    GET      /self-healing/{sensor_id}/overview   pipeline status for the dashboard
"""
from fastapi import APIRouter, Depends, Query
from motor.motor_asyncio import AsyncIOMotorDatabase

from database import get_database
from models.learning import InvalidReadingCreate, LearningStart, ProcessingConfig
from services import healing_overview
from services import learning_service as svc

router = APIRouter(tags=["Learning"])


@router.get("/sensor-processing/{sensor_id}")
async def get_processing(sensor_id: str, db: AsyncIOMotorDatabase = Depends(get_database)):
    return await svc.get_processing(db, sensor_id)


@router.put("/sensor-processing/{sensor_id}")
async def put_processing(sensor_id: str, body: ProcessingConfig, db: AsyncIOMotorDatabase = Depends(get_database)):
    return await svc.set_processing(db, sensor_id, body)


@router.post("/learning/{sensor_id}/start", status_code=201)
async def start(sensor_id: str, body: LearningStart | None = None, db: AsyncIOMotorDatabase = Depends(get_database)):
    return await svc.start_session(db, sensor_id, body or LearningStart())


@router.post("/learning/{sensor_id}/cancel")
async def cancel(sensor_id: str, db: AsyncIOMotorDatabase = Depends(get_database)):
    return await svc.cancel_session(db, sensor_id)


@router.get("/learning/{sensor_id}/status")
async def status_(sensor_id: str, db: AsyncIOMotorDatabase = Depends(get_database)):
    return await svc.get_status(db, sensor_id)


@router.get("/learning/{sensor_id}/result")
async def result(sensor_id: str, session_id: str | None = None, db: AsyncIOMotorDatabase = Depends(get_database)):
    """The persisted Final Learned Sensor Result of the latest (or the given) completed test."""
    return await svc.get_result(db, sensor_id, session_id)


@router.get("/learning/{sensor_id}/sessions")
async def sessions(sensor_id: str, limit: int = Query(default=20, ge=1, le=100), db: AsyncIOMotorDatabase = Depends(get_database)):
    return await svc.list_sessions(db, sensor_id, limit)


@router.get("/learning/{sensor_id}/readings")
async def readings(sensor_id: str, session_id: str | None = None, db: AsyncIOMotorDatabase = Depends(get_database)):
    return await svc.list_learning_readings(db, sensor_id, session_id)


@router.post("/invalid-readings", status_code=201)
async def post_invalid(body: InvalidReadingCreate, db: AsyncIOMotorDatabase = Depends(get_database)):
    return await svc.report_invalid(db, body)


@router.get("/invalid-readings")
async def get_invalid(sensor_id: str | None = None, session_id: str | None = None, category: str | None = None,
                      limit: int = Query(default=100, ge=1, le=1000),
                      db: AsyncIOMotorDatabase = Depends(get_database)):
    return await svc.list_invalid(db, sensor_id, session_id, category, limit)


@router.get("/self-healing/{sensor_id}/overview")
async def healing_overview_(sensor_id: str, db: AsyncIOMotorDatabase = Depends(get_database)):
    """Sensor status, trust, AI, source, raw/filtered/trusted value and recovery state in one call."""
    return await healing_overview.get_overview(db, sensor_id)
