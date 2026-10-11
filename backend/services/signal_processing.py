"""
services/signal_processing.py
------------------------------
PURE functions (no DB) for the RAW -> CALIBRATION -> FILTERING ->
VALIDATION stages. Raw values are never modified; calibrated and
filtered values are computed alongside and stored separately.

Filtering is a causal MEDIAN over the last N calibrated *valid* values.
A median is used deliberately: unlike a moving average it does not
smear a single spike into neighbouring samples, and the raw value is
always kept, so the filter cannot hide a fault.
"""
from __future__ import annotations

import math
import statistics
from datetime import datetime

INVALID_VALUE = "INVALID_VALUE"
OUT_OF_RANGE = "OUT_OF_RANGE"
STALE_READING = "STALE_READING"


def calibrate(raw: float, offset: float = 0.0, gain: float = 1.0) -> float:
    return raw * gain + offset


def causal_median(previous_calibrated: list[float], current: float, window: int) -> float:
    """Median of the last `window` values INCLUDING current (never looks ahead)."""
    if window <= 1:
        return current
    tail = previous_calibrated[-(window - 1):] if previous_calibrated else []
    return float(statistics.median(tail + [current]))


FILTER_METHODS = ("NONE", "MEDIAN", "MOVING_AVERAGE", "EMA")


def apply_filter(method: str, previous_calibrated: list[float], current: float, window: int = 3,
                 alpha: float = 0.3, previous_filtered: float | None = None) -> float:
    """
    Causal filters (never look ahead; the raw value is always kept elsewhere, so no filter can hide a fault):
      NONE            - filtered == calibrated
      MEDIAN          - median of the last `window` calibrated values (spike-resistant)
      MOVING_AVERAGE  - mean of the last `window` calibrated values (smooths noise, but spreads a spike)
      EMA             - exponential moving average: alpha*current + (1-alpha)*previous filtered
    """
    if method == "NONE" or method is None:
        return current
    if method == "MEDIAN":
        return causal_median(previous_calibrated, current, window)
    if method == "MOVING_AVERAGE":
        tail = previous_calibrated[-(window - 1):] if window > 1 and previous_calibrated else []
        vals = tail + [current]
        return float(statistics.fmean(vals))
    if method == "EMA":
        return current if previous_filtered is None else float(alpha * current + (1.0 - alpha) * previous_filtered)
    raise ValueError(f"Unknown filter method: {method}")


def validate_value(
    raw: float,
    calibrated: float,
    valid_min: float | None,
    valid_max: float | None,
    reading_ts: datetime,
    now: datetime,
    stale_after_seconds: float,
) -> tuple[str, str] | None:
    """
    Return None if the reading is valid, else (category, reason).

    valid_min/valid_max are PHYSICAL limits of the sensor hardware
    (e.g. DHT22: -40..80 C), not the "normal" operating range - a value
    outside the normal range but inside physical limits is a legitimate
    (possibly faulty) measurement and is left to the AI stage.
    """
    if not math.isfinite(raw) or not math.isfinite(calibrated):
        return INVALID_VALUE, f"Non-finite value ({raw!r})"
    if valid_min is not None and calibrated < valid_min:
        return OUT_OF_RANGE, f"{calibrated:.3f} is below physical minimum {valid_min}"
    if valid_max is not None and calibrated > valid_max:
        return OUT_OF_RANGE, f"{calibrated:.3f} is above physical maximum {valid_max}"
    age = (now - reading_ts).total_seconds()
    if age > stale_after_seconds:
        return STALE_READING, f"Reading timestamp is {age:.0f}s old (limit {stale_after_seconds:.0f}s)"
    return None
