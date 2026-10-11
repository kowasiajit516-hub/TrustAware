"""
services/virtual_sensor.py
----------------------------
VIRTUAL SENSOR + TRUSTED VALUE stages of the core pipeline:

    ... -> DYNAMIC TRUST SCORE -> VIRTUAL SENSOR -> TRUSTED VALUE -> ...

Consumes Phase 4's derived SensorStatus for a reading and produces the
TRUSTED VALUE for it, written to the generic `trusted_readings`
collection (schema/index defined since Phase 1, unused until now):

  - status == HEALTHY
      -> the raw reading IS the trusted value (source="RAW"). The
         sensor has already proven itself trustworthy; nothing to
         predict.
  - status != HEALTHY (RECOVERING or FAULTY)
      -> the raw value is NOT trusted. A REAL, trained sklearn
         RandomForestRegressor (ml/train_random_forest.py) predicts a
         plausible virtual value to stand in for it (source="VIRTUAL").

No data leakage (master plan rule #5): the model NEVER sees the
current, untrusted raw value as an input feature - only that sensor's
own prior TRUSTED history (pulled from THIS collection, so a fault's
predicted values feed the *next* prediction's lag features instead of
letting the raw spike propagate) plus generic time-of-day features.
See ml/virtual_sensor_features.py for the full explanation.

This stage does NOT wire up automation/actuators (Phase 6/9) - it only
produces and persists the trusted value for each reading.
"""

from __future__ import annotations

import logging
from pathlib import Path

import joblib
from motor.motor_asyncio import AsyncIOMotorDatabase

from ml.virtual_sensor_features import compute_virtual_features, denormalize
from models.sensor import SensorStatus
from models.trusted_reading import now_utc
from utils.validators import ensure_exists, serialize_mongo_doc

logger = logging.getLogger(__name__)

SENSORS_COLLECTION = "sensors"
TRUSTED_READINGS_COLLECTION = "trusted_readings"

MODEL_PATH = Path(__file__).resolve().parent.parent / "ml" / "models" / "random_forest.joblib"

# How many prior TRUSTED readings to pull for lag/rolling features
# (must be >= ml.virtual_sensor_features.WINDOW; a small buffer is fine).
HISTORY_LOOKBACK = 20

SOURCE_RAW = "RAW"            # shown as REAL on the dashboard
SOURCE_VIRTUAL = "VIRTUAL"
SOURCE_REDUNDANT = "REDUNDANT"
SOURCE_UNAVAILABLE = "UNAVAILABLE"

# A virtual value is only produced from real trusted history. With fewer
# trusted readings than this the model would be guessing, so the trusted
# value is reported UNAVAILABLE instead (tunable: settings.virtual_min_history).
MIN_VIRTUAL_HISTORY = 3
HOLD_STATES = ("FAULT", "VERIFYING")   # recovery states in which the real sensor is NOT yet trusted


class VirtualSensorUnavailable(RuntimeError):
    """Raised when the RandomForestRegressor has not been trained/saved yet."""


_model_cache: dict[str, object] = {}


def _get_model():
    """
    Lazily load and cache the trained model. Cached by file mtime so a
    freshly retrained model is picked up without restarting the process.
    Mirrors services/fault_detection.py's _get_model exactly.
    """
    if not MODEL_PATH.exists():
        raise VirtualSensorUnavailable(
            f"No trained model found at {MODEL_PATH}. "
            "Run: python ml/train_random_forest.py"
        )

    mtime = MODEL_PATH.stat().st_mtime
    cached = _model_cache.get("model")
    cached_mtime = _model_cache.get("mtime")

    if cached is None or cached_mtime != mtime:
        model = joblib.load(MODEL_PATH)
        _model_cache["model"] = model
        _model_cache["mtime"] = mtime
        logger.info("Loaded RandomForestRegressor model from %s", MODEL_PATH)

    return _model_cache["model"]


def reload_model() -> None:
    """Clear the cached model (used by tests to point at a fresh model file)."""
    _model_cache.clear()


async def _fetch_trusted_history(
    db: AsyncIOMotorDatabase, sensor_id: str, before_timestamp, limit: int = HISTORY_LOOKBACK
) -> list[float]:
    """
    Fetch up to `limit` prior TRUSTED values for this sensor, strictly
    older than `before_timestamp`, in chronological order (oldest
    first) - deliberately reads from `trusted_readings` (not raw
    `sensor_readings`), so a previous fault's predicted virtual value -
    not the raw spike it replaced - is what feeds the next prediction.
    """
    cursor = (
        db[TRUSTED_READINGS_COLLECTION]
        .find({"sensor_id": sensor_id, "timestamp": {"$lt": before_timestamp},
               "trusted_value": {"$ne": None}})
        .sort([("timestamp", -1), ("_id", -1)])
        .limit(limit)
    )
    values = [doc["trusted_value"] async for doc in cursor]
    values.reverse()  # now oldest-first
    return values


async def _min_history(db) -> int:
    try:
        from services import settings_service

        return int((await settings_service.get_settings(db)).get("virtual_min_history", MIN_VIRTUAL_HISTORY))
    except Exception:
        return MIN_VIRTUAL_HISTORY


async def _redundant_value(db, sensor: dict, reading: dict):
    """
    REDUNDANT source: median of the latest REAL trusted values of peer sensors the
    user declared as redundant (PUT /sensor-processing/{id} redundant_with=[...]).
    Peers must be same unit, enabled, currently HEALTHY and not themselves being
    verified, with a fresh REAL trusted reading. Returns (value, [peer ids]) or None.
    """
    from services.learning_service import _utc

    cfg = await db["sensor_processing"].find_one({"sensor_id": sensor["sensor_id"]}) or {}
    values, used = [], []
    ts = _utc(reading["timestamp"])
    for pid in cfg.get("redundant_with") or []:
        peer = await db[SENSORS_COLLECTION].find_one({"sensor_id": pid})
        if not peer or not peer.get("enabled", True) or peer.get("unit") != sensor.get("unit"):
            continue
        health = await db["sensor_health"].find_one({"sensor_id": pid})
        if not health or health.get("status") != SensorStatus.HEALTHY.value \
                or health.get("recovery_state") in HOLD_STATES:
            continue
        tr = await db[TRUSTED_READINGS_COLLECTION].find_one(
            {"sensor_id": pid}, sort=[("timestamp", -1), ("_id", -1)])
        if not tr or tr.get("source") != SOURCE_RAW or tr.get("trusted_value") is None:
            continue
        max_age = max(30.0, 3.0 * float(peer.get("sampling_interval_seconds", 5)))
        if abs((ts - _utc(tr["timestamp"])).total_seconds()) > max_age:
            continue
        values.append(float(tr["trusted_value"]))
        used.append(pid)
    if not values:
        return None
    import statistics

    return float(statistics.median(values)), used


def _build_doc(reading, status, recovery_state, context, *, trusted_value, source, extra=None) -> dict:
    return {
        "sensor_id": reading["sensor_id"],
        "reading_id": reading["id"],
        "raw_value": reading["value"],
        "calibrated_value": context.get("calibrated_value"),
        "filtered_value": context.get("filtered_value"),
        "trusted_value": trusted_value,
        "source": source,
        "available": trusted_value is not None,
        "raw_isolated": source != SOURCE_RAW,
        "status_at_prediction": status,
        "recovery_state": recovery_state,
        "timestamp": reading["timestamp"],
        "created_at": now_utc(),
        **(extra or {}),
    }


async def _store(db, doc: dict) -> dict:
    result = await db[TRUSTED_READINGS_COLLECTION].insert_one(doc)
    doc["id"] = str(result.inserted_id)
    return serialize_mongo_doc(doc)


async def compute_trusted_value(
    db: AsyncIOMotorDatabase, reading: dict, status: str,
    recovery_state: str | None = None, context: dict | None = None,
) -> dict:
    """
    REAL / VIRTUAL / REDUNDANT decision + TRUSTED VALUE.

      REAL (stored as source="RAW"): sensor HEALTHY and not in a fault/recovery-verification
        episode -> the CALIBRATED reading (identity calibration = the raw value).
      otherwise the raw value is isolated and a substitute is used, in order:
        REDUNDANT  - a declared, healthy peer sensor's real trusted value
        VIRTUAL    - RandomForest prediction from this sensor's own trusted history
                     (never from the current untrusted raw value - no leakage)
      If neither is possible, VirtualSensorUnavailable is raised (no value is invented);
      reading_service then stores an UNAVAILABLE trusted reading via record_unavailable().

    `recovery_state` / `context` are optional; omitted => legacy behaviour.
    """
    context = context or {}
    sensor_id = reading["sensor_id"]
    sensor = await db[SENSORS_COLLECTION].find_one({"sensor_id": sensor_id})
    if sensor is None:
        raise ValueError(f"Cannot compute trusted value: unknown sensor_id='{sensor_id}'")

    is_trusted = status == SensorStatus.HEALTHY.value and recovery_state not in HOLD_STATES
    extra = None

    if is_trusted:
        trusted_value = context.get("calibrated_value", reading["value"])
        source = SOURCE_RAW
    else:
        redundant = await _redundant_value(db, sensor, reading)
        if redundant is not None:
            trusted_value, peers = redundant
            source, extra = SOURCE_REDUNDANT, {"redundant_sources": peers}
        else:
            model = _get_model()  # raises VirtualSensorUnavailable if untrained
            history = await _fetch_trusted_history(db, sensor_id, reading["timestamp"])
            need = await _min_history(db)
            if len(history) < need:
                raise VirtualSensorUnavailable(
                    f"Only {len(history)} trusted reading(s) of history for '{sensor_id}' (need {need}); "
                    "refusing to fabricate a virtual value."
                )
            features = compute_virtual_features(
                reading["timestamp"], sensor["normal_min"], sensor["normal_max"], history
            )
            predicted_normalized = float(model.predict([features])[0])
            trusted_value = denormalize(predicted_normalized, sensor["normal_min"], sensor["normal_max"])
            source = SOURCE_VIRTUAL

    doc = _build_doc(reading, status, recovery_state, context,
                     trusted_value=trusted_value, source=source, extra=extra)
    logger.info(
        "Trusted value sensor=%s status=%s recovery=%s source=%s raw=%s trusted=%.4f",
        sensor_id, status, recovery_state, source, reading["value"], trusted_value,
    )
    return await _store(db, doc)


async def record_unavailable(
    db: AsyncIOMotorDatabase, reading: dict, status: str,
    recovery_state: str | None, reason: str, context: dict | None = None,
) -> dict:
    """Persist 'no safe trusted value exists' so the dashboard shows it and automation is held."""
    doc = _build_doc(reading, status, recovery_state, context or {},
                     trusted_value=None, source=SOURCE_UNAVAILABLE, extra={"unavailable_reason": reason})
    logger.warning("Trusted value UNAVAILABLE sensor=%s: %s", reading["sensor_id"], reason)
    return await _store(db, doc)


async def list_trusted(
    db: AsyncIOMotorDatabase, sensor_id: str | None = None, limit: int = 100
) -> list[dict]:
    query: dict = {}
    if sensor_id is not None:
        query["sensor_id"] = sensor_id

    cursor = (
        db[TRUSTED_READINGS_COLLECTION]
        .find(query)
        .sort([("timestamp", -1), ("_id", -1)])
        .limit(limit)
    )
    results = []
    async for doc in cursor:
        doc["id"] = str(doc["_id"])
        results.append(serialize_mongo_doc(doc))
    return results


async def get_latest_trusted(db: AsyncIOMotorDatabase, sensor_id: str) -> dict:
    from fastapi import HTTPException, status as http_status

    await ensure_exists(db, SENSORS_COLLECTION, "sensor_id", sensor_id)
    doc = await db[TRUSTED_READINGS_COLLECTION].find_one(
        {"sensor_id": sensor_id}, sort=[("timestamp", -1), ("_id", -1)]
    )
    if doc is None:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail=f"No trusted readings found for sensor_id='{sensor_id}'",
        )
    doc["id"] = str(doc["_id"])
    return serialize_mongo_doc(doc)
