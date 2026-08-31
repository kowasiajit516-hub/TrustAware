"""
models/fault_injection.py
----------------------------
Pydantic schemas for the dashboard's Fault Injection panel (Phase 7
addition).

This does NOT bypass the core pipeline: POST /fault-injection computes
a deliberately corrupted value (reusing the exact SPIKE/STUCK/DRIFT
logic simulator/simulator.py already uses) and then calls the real
services/reading_service.create_reading() - the same function
POST /readings uses - so the corrupted value still goes through real
validation, real AI fault detection, real trust scoring, and real
virtual sensing. Nothing here writes to sensor_readings/predictions/
sensor_health/trusted_readings/fault_events directly.
"""

from enum import Enum

from pydantic import BaseModel, Field


class FaultType(str, Enum):
    SPIKE = "SPIKE"
    STUCK = "STUCK"
    DRIFT = "DRIFT"


class FaultInjectionRequest(BaseModel):
    """Payload for POST /fault-injection/{sensor_id}"""

    fault_type: FaultType
    offset: float | None = Field(
        default=None,
        description=(
            "Optional explicit offset added to the sensor's current "
            "value/range edge. If omitted, a random offset is generated "
            "the same way simulator.py's --fault-rate does."
        ),
    )


class FaultInjectionResponse(BaseModel):
    """What the API returns after injecting a fault."""

    sensor_id: str
    fault_type: FaultType
    injected_value: float
    reading: dict = Field(..., description="the SensorReadingResponse produced by the real /readings pipeline")
