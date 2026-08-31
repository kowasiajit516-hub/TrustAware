"""
services/fault_injection_service.py
--------------------------------------
Backing logic for the dashboard's Fault Injection panel (Phase 7).

Reuses the exact fault-shape math from simulator/simulator.py's
Simulator.inject_fault (SPIKE/STUCK/DRIFT), driven only by the
sensor's own normal_min/normal_max (generic, per rule #6 - never a
per-sensor-type table). The corrupted value is then handed to
services/reading_service.create_reading() - the same function
POST /readings uses - so it goes through the real pipeline
(validation -> AI fault detection -> trust scoring -> virtual
sensing), never a shortcut straight into the database.
"""

from __future__ import annotations

import random

from motor.motor_asyncio import AsyncIOMotorDatabase

from models.fault_injection import FaultType
from models.reading import SensorReadingCreate
from services import reading_service
from utils.validators import ensure_exists

SENSORS_COLLECTION = "sensors"

_rng = random.Random()


def generate_fault_value(sensor: dict, fault_type: FaultType, offset: float | None) -> float:
    """
    Compute a deliberately corrupted value for `sensor`, using the same
    shape logic as simulator.py's inject_fault - SPIKE goes past an
    edge of the normal range, STUCK repeats a stale value, DRIFT wanders
    outside the range from the midpoint.
    """
    lo, hi = sensor["normal_min"], sensor["normal_max"]
    span = hi - lo if hi > lo else 1.0
    mid = (lo + hi) / 2

    if fault_type == FaultType.SPIKE:
        direction = _rng.choice([-1, 1])
        edge = hi if direction > 0 else lo
        magnitude = offset if offset is not None else span * _rng.uniform(0.5, 2.0)
        value = edge + direction * abs(magnitude)

    elif fault_type == FaultType.STUCK:
        # "Stuck" from the dashboard means: repeat a stale in-range
        # value (the sensor's last known value, or its midpoint if
        # unknown) rather than tracking real conditions.
        value = sensor.get("_last_known_value", mid)

    else:  # DRIFT
        direction = _rng.choice([-1, 1])
        magnitude = offset if offset is not None else span * _rng.uniform(0.3, 0.8)
        value = mid + direction * abs(magnitude)

    return round(value, 3)


async def inject_fault(
    db: AsyncIOMotorDatabase, sensor_id: str, fault_type: FaultType, offset: float | None
) -> tuple[float, dict]:
    """
    Look up the real sensor, compute a corrupted value for it, and post
    that value through the real ingestion pipeline. Returns
    (injected_value, reading_response).
    """
    sensor = await ensure_exists(db, SENSORS_COLLECTION, "sensor_id", sensor_id)

    last = await db["sensor_readings"].find_one(
        {"sensor_id": sensor_id}, sort=[("timestamp", -1), ("_id", -1)]
    )
    if last is not None:
        sensor["_last_known_value"] = last["value"]

    value = generate_fault_value(sensor, fault_type, offset)

    reading = await reading_service.create_reading(
        db, SensorReadingCreate(sensor_id=sensor_id, value=value)
    )
    return value, reading
