"""
models/learning.py
-------------------
Request schemas for sensor learning (30 valid readings -> baseline),
invalid/fault event reporting, per-sensor signal processing config,
and the sensor quality score.
"""
from datetime import datetime
from enum import Enum

from pydantic import AliasChoices, BaseModel, Field, model_validator


class FaultCategory(str, Enum):
    SENSOR_FAULT = "SENSOR_FAULT"
    COMMUNICATION_FAULT = "COMMUNICATION_FAULT"
    TIMEOUT = "TIMEOUT"
    MISSING_DATA = "MISSING_DATA"
    OUT_OF_RANGE = "OUT_OF_RANGE"
    ABNORMAL_BEHAVIOR = "ABNORMAL_BEHAVIOR"
    STALE_READING = "STALE_READING"
    INVALID_VALUE = "INVALID_VALUE"


# Evidence about the SENSOR itself (penalises trust). Everything else is
# evidence about the link / data delivery and lowers communication
# reliability instead - a timeout is not proof the sensor is damaged.
SENSOR_SIDE = {
    FaultCategory.SENSOR_FAULT.value,
    FaultCategory.OUT_OF_RANGE.value,
    FaultCategory.ABNORMAL_BEHAVIOR.value,
    FaultCategory.INVALID_VALUE.value,
}
COMM_SIDE = {
    FaultCategory.COMMUNICATION_FAULT.value,
    FaultCategory.TIMEOUT.value,
    FaultCategory.MISSING_DATA.value,
}


class ProcessingConfig(BaseModel):
    """Per-sensor calibration / filter / physical-limit configuration. Identity by default."""
    calibration_offset: float | None = None
    calibration_gain: float | None = Field(default=None, gt=0)
    valid_min: float | None = None
    valid_max: float | None = None
    filter_window: int | None = Field(default=None, ge=1, le=21)
    filter_method: str | None = Field(default=None, pattern="^(NONE|MEDIAN|MOVING_AVERAGE|EMA)$")
    filter_alpha: float | None = Field(default=None, gt=0, le=1)
    redundant_with: list[str] | None = Field(
        default=None, description="peer sensor ids (same unit) whose real trusted value may stand in during a fault")

    @model_validator(mode="after")
    def _limits(self):
        if self.valid_min is not None and self.valid_max is not None and self.valid_max <= self.valid_min:
            raise ValueError("valid_max must be greater than valid_min")
        return self


class LearningStart(BaseModel):
    """
    Start a learning / quality test. The number of VALID readings is chosen by the user
    (30 is only the default). Accepts `target_valid_readings` (preferred) or the older `target_readings`.
    """
    interval_seconds: float = Field(default=10.0, ge=1, le=3600)
    target_readings: int = Field(
        default=30, ge=2, le=1000,
        validation_alias=AliasChoices("target_valid_readings", "target_readings"),
    )
    # Optional per-test calibration / filter settings. When given they are applied to the sensor's processing
    # config (so the live pipeline uses them too) and a snapshot is stored with the session.
    calibration_offset: float | None = Field(default=None, ge=-1e9, le=1e9)
    calibration_gain: float | None = Field(default=None, gt=0, le=1e6)
    filter_method: str | None = Field(default=None, pattern="^(NONE|MEDIAN|MOVING_AVERAGE|EMA)$")
    filter_window: int | None = Field(default=None, ge=1, le=21)
    filter_alpha: float | None = Field(default=None, gt=0, le=1)

    def processing_overrides(self) -> dict:
        keys = ("calibration_offset", "calibration_gain", "filter_method", "filter_window", "filter_alpha")
        return {k: getattr(self, k) for k in keys if getattr(self, k) is not None}


class InvalidReadingCreate(BaseModel):
    """Posted by a device (ESP32) when a read failed, so the failure is recorded, not lost."""
    sensor_id: str = Field(..., min_length=1, max_length=64)
    category: FaultCategory = FaultCategory.MISSING_DATA
    reason: str = Field(..., min_length=1, max_length=300)
    raw_value: float | None = None
    occurred_at: datetime | None = None
