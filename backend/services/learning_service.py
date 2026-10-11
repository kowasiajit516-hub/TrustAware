"""
services/learning_service.py
------------------------------
Sensor learning (user-selected number of valid readings) + fault tracking + quality score.

Sits between RAW SENSOR and AI FAULT DETECTION:

    RAW -> CALIBRATION -> FILTERING -> VALIDATION -> (learning count)
        -> existing AI fault detection / trust / virtual sensing

Two kinds of record are kept SEPARATELY and neither is ever discarded:
  * VALID readings   -> `learning_readings` (count toward the selected target)
  * INVALID events   -> `invalid_readings`  (never count toward the selected target)
Every ingested reading (valid or not) also gets a `processed_readings`
document holding raw / calibrated / filtered side by side.

Collections used (all generic, none per sensor type):
  sensor_processing, processed_readings, learning_sessions,
  learning_readings, invalid_readings
"""
from __future__ import annotations

import logging
import uuid
from collections import Counter
from datetime import datetime, timedelta, timezone

from bson import ObjectId
from fastapi import HTTPException, status
from pymongo import ReturnDocument

from models.learning import COMM_SIDE, SENSOR_SIDE, InvalidReadingCreate, LearningStart, ProcessingConfig
from models.reading import now_utc
from services import learning_analysis as analysis
from services import learning_stats as stats
from services import signal_processing as sp
from utils.validators import ensure_exists

logger = logging.getLogger(__name__)

SENSORS = "sensors"
PROCESSING = "sensor_processing"
PROCESSED = "processed_readings"
SESSIONS = "learning_sessions"
LEARNING_READINGS = "learning_readings"
INVALID = "invalid_readings"

COLLECTING, COMPLETE, CANCELLED = "COLLECTING", "COMPLETE", "CANCELLED"

STALE_MIN_SECONDS = 30.0      # a reading is stale if older than max(this, 3 x interval)
STALE_FACTOR = 3.0
GAP_FACTOR = 3.0              # silence longer than 3 x expected interval = TIMEOUT event
SPACING_TOLERANCE = 0.8       # a reading counts if >= 80% of the learning interval since the last counted one
RELIABILITY_WINDOW_S = 600    # communication reliability looks at the last 10 minutes

DEFAULT_PROCESSING = {
    "calibration_offset": 0.0, "calibration_gain": 1.0,
    "valid_min": None, "valid_max": None, "filter_window": 3,
    "filter_method": "MEDIAN", "filter_alpha": 0.3,
    "redundant_with": [],
}
SETTINGS_KEYS = ("calibration_offset", "calibration_gain", "valid_min", "valid_max",
                 "filter_method", "filter_window", "filter_alpha")
SOURCE_LABEL = {"RAW": "REAL", "VIRTUAL": "VIRTUAL", "REDUNDANT": "REDUNDANT", "UNAVAILABLE": "UNAVAILABLE"}
ANALYZING = "ANALYZING"


# ---------------------------------------------------------------- helpers
def _utc(dt) -> datetime:
    if isinstance(dt, str):
        dt = datetime.fromisoformat(dt.replace("Z", "+00:00"))
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt.astimezone(timezone.utc)


def _clean(obj):
    """Mongo doc -> JSON-safe (ObjectId -> str, datetimes -> ISO 'Z')."""
    if isinstance(obj, dict):
        return {("id" if k == "_id" else k): _clean(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_clean(x) for x in obj]
    if isinstance(obj, datetime):
        return _utc(obj).isoformat().replace("+00:00", "Z")
    if isinstance(obj, ObjectId):
        return str(obj)
    return obj


def _statuses(category: str) -> tuple[str, str]:
    """(validation_status, communication_status) for a fault category."""
    comm = {"COMMUNICATION_FAULT": "FAILED", "TIMEOUT": "TIMEOUT"}.get(category, "OK")
    val = "MISSING" if category in ("MISSING_DATA", "TIMEOUT", "COMMUNICATION_FAULT") else "REJECTED"
    return val, comm


# ------------------------------------------------------ processing config
async def get_processing(db, sensor_id: str) -> dict:
    doc = await db[PROCESSING].find_one({"sensor_id": sensor_id}) or {}
    return {**DEFAULT_PROCESSING, **{k: doc[k] for k in DEFAULT_PROCESSING if k in doc}, "sensor_id": sensor_id}


async def set_processing(db, sensor_id: str, cfg: ProcessingConfig) -> dict:
    await ensure_exists(db, SENSORS, "sensor_id", sensor_id)
    changes = cfg.model_dump(exclude_unset=True)
    if changes.get("redundant_with"):
        peers = list(dict.fromkeys(changes["redundant_with"]))
        if sensor_id in peers:
            raise HTTPException(422, "A sensor cannot be redundant with itself")
        for pid in peers:
            await ensure_exists(db, SENSORS, "sensor_id", pid)
        changes["redundant_with"] = peers
    merged = {**(await get_processing(db, sensor_id)), **changes}
    if merged["valid_min"] is not None and merged["valid_max"] is not None \
            and merged["valid_max"] <= merged["valid_min"]:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "valid_max must be greater than valid_min")
    if merged["filter_method"] == "EMA" and not (0 < float(merged["filter_alpha"]) <= 1):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "filter_alpha must be in (0, 1] for the EMA filter")
    if changes:
        await db[PROCESSING].update_one(
            {"sensor_id": sensor_id}, {"$set": {**changes, "updated_at": now_utc()}}, upsert=True
        )
    return await get_processing(db, sensor_id)


# --------------------------------------------------------- invalid events
async def _active_session(db, sensor_id: str) -> dict | None:
    return await db[SESSIONS].find_one({"sensor_id": sensor_id, "status": COLLECTING})


async def _record_invalid(db, *, sensor_id, category, reason, raw_value, calibrated_value,
                          timestamp, source, reading_id=None, session=None) -> dict:
    validation_status, communication_status = _statuses(category)
    doc = {
        "sensor_id": sensor_id,
        "session_id": session["session_id"] if session else None,
        "timestamp": _utc(timestamp),
        "raw_value": raw_value,
        "calibrated_value": calibrated_value,
        "fault_category": category,
        "fault_side": "SENSOR" if category in SENSOR_SIDE else "COMMUNICATION" if category in COMM_SIDE else "DATA",
        "reason": reason,
        "validation_status": validation_status,
        "communication_status": communication_status,
        "source": source,
        "reading_id": reading_id,
        "counted_toward_learning": False,
        "created_at": now_utc(),
    }
    res = await db[INVALID].insert_one(doc)
    doc["_id"] = res.inserted_id
    if session:
        inc = {"invalid_count": 1}
        if category in SENSOR_SIDE:
            inc["fault_count"] = 1          # evidence about the sensor itself
        elif category in COMM_SIDE:
            inc["comm_count"] = 1           # evidence about delivery / communication
        await db[SESSIONS].update_one({"session_id": session["session_id"]}, {"$inc": inc})
    logger.warning("Invalid event sensor=%s category=%s reason=%s", sensor_id, category, reason)
    return _clean(doc)


async def report_invalid(db, payload: InvalidReadingCreate) -> dict:
    """Device-reported failure (e.g. DHT22 returned NaN, or WiFi was down)."""
    await ensure_exists(db, SENSORS, "sensor_id", payload.sensor_id)
    return await _record_invalid(
        db, sensor_id=payload.sensor_id, category=payload.category.value, reason=payload.reason,
        raw_value=payload.raw_value, calibrated_value=None,
        timestamp=payload.occurred_at or now_utc(), source="DEVICE_REPORT",
        session=await _active_session(db, payload.sensor_id),
    )


async def list_invalid(db, sensor_id=None, session_id=None, category=None, limit=100) -> list[dict]:
    q: dict = {}
    if sensor_id: q["sensor_id"] = sensor_id
    if session_id: q["session_id"] = session_id
    if category: q["fault_category"] = category
    cur = db[INVALID].find(q).sort([("timestamp", -1), ("_id", -1)]).limit(limit)
    return [_clean(d) async for d in cur]


# ------------------------------------------------- ingestion-time pipeline
async def process_reading(db, sensor: dict, reading: dict, defer_finalize: bool = False) -> dict:
    """
    Called by reading_service.create_reading right after the raw reading
    is stored. Returns context for the AI stage:
        {"calibrated_value", "forced_fault_reason"}
    The raw reading is already stored untouched; this only ADDS records.
    """
    sensor_id = reading["sensor_id"]
    raw = float(reading["value"])
    ts = _utc(reading["timestamp"])
    now = _utc(now_utc())

    cfg = await get_processing(db, sensor_id)
    calibrated = sp.calibrate(raw, cfg["calibration_offset"], cfg["calibration_gain"])

    method, window, alpha = cfg["filter_method"], int(cfg["filter_window"]), float(cfg["filter_alpha"])
    need = 1 if method == "EMA" else (window - 1 if method in ("MEDIAN", "MOVING_AVERAGE") else 0)
    prev_docs = []
    if need > 0:
        cur = db[PROCESSED].find({"sensor_id": sensor_id, "valid": True, "timestamp": {"$lt": ts}}) \
            .sort([("timestamp", -1), ("_id", -1)]).limit(need)
        prev_docs = [d async for d in cur]
    filtered = sp.apply_filter(
        method, [d["calibrated_value"] for d in reversed(prev_docs)], calibrated, window, alpha,
        prev_docs[0]["filtered_value"] if prev_docs else None)

    session = await _active_session(db, sensor_id)
    interval = float(sensor.get("sampling_interval_seconds", 5))
    stale_after = max(STALE_MIN_SECONDS, STALE_FACTOR * interval)

    # Silence watchdog: while learning, a long gap since the previous reading
    # is recorded as a TIMEOUT event (the device never reported it).
    if session:
        prev = await db[PROCESSED].find_one({"sensor_id": sensor_id, "timestamp": {"$lt": ts}},
                                            sort=[("timestamp", -1), ("_id", -1)])
        if prev:
            expected = max(interval, float(session["interval_seconds"]))
            gap = (ts - _utc(prev["timestamp"])).total_seconds()
            if gap > GAP_FACTOR * expected:
                await _record_invalid(
                    db, sensor_id=sensor_id, category="TIMEOUT", raw_value=None, calibrated_value=None,
                    reason=f"No reading received for {gap:.0f}s (expected about every {expected:.0f}s)",
                    timestamp=_utc(prev["timestamp"]) + timedelta(seconds=expected),
                    source="GAP_WATCHDOG", session=session)

    problem = sp.validate_value(raw, calibrated, cfg["valid_min"], cfg["valid_max"], ts, now, stale_after)
    valid = problem is None

    processed = {
        "sensor_id": sensor_id, "reading_id": reading["id"], "timestamp": ts,
        "raw_value": raw, "calibrated_value": calibrated, "filtered_value": filtered,
        "valid": valid, "fault_category": problem[0] if problem else None,
        "reason": problem[1] if problem else None,
        "learning_session_id": None, "learning_reading_number": None,
        "created_at": now_utc(),
    }
    res = await db[PROCESSED].insert_one(processed)

    forced = None
    finalize_id = None
    if not valid:
        await _record_invalid(
            db, sensor_id=sensor_id, category=problem[0], reason=problem[1], raw_value=raw,
            calibrated_value=calibrated, timestamp=ts, source="INGESTION",
            reading_id=reading["id"], session=session)
        if problem[0] in SENSOR_SIDE:
            forced = f"{problem[0]}: {problem[1]}"
    elif session:
        n, reached = await _try_count_valid(db, session, sensor, reading, ts, raw, calibrated, filtered, defer_finalize)
        if n:
            await db[PROCESSED].update_one(
                {"_id": res.inserted_id},
                {"$set": {"learning_session_id": session["session_id"], "learning_reading_number": n}})
        if reached and defer_finalize:
            finalize_id = session["session_id"]   # the caller finalises AFTER AI / trust / virtual stages added their evidence

    return {
        "calibrated_value": calibrated, "filtered_value": filtered, "forced_fault_reason": forced,
        "valid": valid,
        # invalid but NOT sensor-side (stale / non-finite): neither healthy nor faulty evidence
        "skip_pipeline": (not valid) and forced is None,
        "session_to_finalize": finalize_id,
    }


async def _try_count_valid(db, session, sensor, reading, ts, raw, calibrated, filtered, defer=False):
    """Returns (counted reading number or None, target_reached)."""
    last = session.get("last_counted_at")
    if last and (ts - _utc(last)).total_seconds() < session["interval_seconds"] * SPACING_TOLERANCE:
        return None, False  # arrived too soon after the last counted reading: stored, but not counted
    updated = await db[SESSIONS].find_one_and_update(
        {"session_id": session["session_id"], "status": COLLECTING,
         "valid_count": {"$lt": session["target_readings"]}},
        {"$inc": {"valid_count": 1}, "$set": {"last_counted_at": ts}},
        return_document=ReturnDocument.AFTER)
    if not updated:
        return None, False
    n = updated["valid_count"]
    await db[LEARNING_READINGS].insert_one({
        "session_id": session["session_id"], "reading_number": n,
        "sensor_id": sensor["sensor_id"], "sensor_type": sensor.get("sensor_type"),
        "measurement_type": sensor.get("sensor_type"), "unit": sensor.get("unit"),
        "raw_value": raw, "calibrated_value": calibrated, "filtered_value": filtered,
        "timestamp": ts, "validity_status": "VALID", "reading_id": reading["id"],
    })
    reached = n >= updated["target_readings"]
    if reached:
        if defer:   # stop counting now; analysis runs once the last reading's AI / trust evidence is attached
            await db[SESSIONS].update_one({"session_id": session["session_id"]},
                                          {"$set": {"status": ANALYZING, "analyzing_since": now_utc()}})
        else:
            await finalize_session(db, session["session_id"])
    return n, reached


async def attach_ai(db, reading_id: str, prediction: dict) -> None:
    """Keep the AI anomaly evidence with the reading it belongs to (processed + learning dataset)."""
    patch = {"ai_is_fault": bool(prediction["is_fault"]), "ai_anomaly_score": prediction.get("anomaly_score"),
             "ai_reasons": prediction.get("fault_reasons") or [], "baseline_z": prediction.get("baseline_z")}
    for coll in (PROCESSED, LEARNING_READINGS):
        await db[coll].update_one({"reading_id": reading_id}, {"$set": patch})


async def attach_trust(db, reading_id: str, health: dict, trusted: dict) -> None:
    """Keep the trust state and the REAL / VIRTUAL / UNAVAILABLE trusted value with the reading."""
    patch = {"trust_score": health.get("trust_score"), "sensor_state": health.get("sensor_state"),
             "recovery_state": health.get("recovery_state"), "trusted_value": trusted.get("trusted_value"),
             "source": SOURCE_LABEL.get(trusted.get("source"), trusted.get("source")),
             "trusted_available": bool(trusted.get("available", True))}
    for coll in (PROCESSED, LEARNING_READINGS):
        await db[coll].update_one({"reading_id": reading_id}, {"$set": patch})


async def finalize_session(db, session_id: str) -> dict | None:
    """
    Analyse ALL collected valid readings together and persist the Final Learned Sensor Result
    (settings snapshot, statistics, baseline, quality score + formula version, AI / invalid / comms / source history,
    trust at completion, final trusted value). Idempotent: a COMPLETE session is returned unchanged.
    """
    s = await db[SESSIONS].find_one({"session_id": session_id})
    if not s or s["status"] in (COMPLETE, CANCELLED):
        return s
    sid = s["sensor_id"]
    rows = [d async for d in db[LEARNING_READINGS].find({"session_id": session_id}).sort("reading_number", 1)]
    for r in rows:
        r["timestamp"] = _utc(r["timestamp"])
    sensor = await db[SENSORS].find_one({"sensor_id": sid}) or {}
    snap = s.get("settings") or {}
    cur_cfg = await get_processing(db, sid)
    settings = {**{k: cur_cfg[k] for k in SETTINGS_KEYS}, **snap}
    changed = any(cur_cfg.get(k) != snap.get(k) for k in SETTINGS_KEYS if k in snap)
    ev = [e async for e in db[INVALID].find({"session_id": session_id})]
    summary = {"total": len(ev), "sensor_side": sum(1 for e in ev if e["fault_side"] == "SENSOR"),
               "communication": sum(1 for e in ev if e["fault_side"] == "COMMUNICATION"),
               "other": sum(1 for e in ev if e["fault_side"] not in ("SENSOR", "COMMUNICATION")),
               "by_category": dict(Counter(e["fault_category"] for e in ev))}
    arrivals = await db[PROCESSED].count_documents({"sensor_id": sid, "timestamp": {"$gte": _utc(s["started_at"])}})
    prev = await db[SESSIONS].find_one({"sensor_id": sid, "status": COMPLETE, "session_id": {"$ne": session_id}},
                                       sort=[("completed_at", -1)])
    health = await db["sensor_health"].find_one({"sensor_id": sid})
    tr = await db["trusted_readings"].find_one({"sensor_id": sid}, sort=[("timestamp", -1), ("_id", -1)])
    final_trusted = None if not tr else {
        "value": tr.get("trusted_value"), "source": SOURCE_LABEL.get(tr.get("source"), tr.get("source")),
        "available": bool(tr.get("available", True)), "reason": tr.get("unavailable_reason"),
        "timestamp": tr.get("timestamp"), "raw_value": tr.get("raw_value")}
    trust = None if not health else {"score": health.get("trust_score"), "sensor_state": health.get("sensor_state"),
                                     "recovery_state": health.get("recovery_state")}
    session_view = {**s, "valid_count": len(rows)}
    try:
        result = analysis.analyze_dataset(
            rows=rows, sensor={**sensor, **(s.get("sensor_snapshot") or {})}, settings=settings, session=session_view,
            invalid_summary=summary, arrivals=arrivals, prev_baseline=(prev or {}).get("baseline"),
            trust=trust, final_trusted=final_trusted, settings_changed=changed)
    except Exception as exc:  # noqa: BLE001
        # Never leave the session stuck in ANALYZING (that would also block the UI): the collected readings and a
        # basic baseline are kept, the session is completed WITHOUT a result and the reason is recorded.
        logger.exception("Analysis failed for session %s", session_id)
        baseline = None
        try:
            baseline = stats.compute_baseline([(r["timestamp"], r["calibrated_value"]) for r in rows])
        except Exception:  # noqa: BLE001
            pass
        await db[SESSIONS].update_one({"session_id": session_id}, {"$set": {
            "status": COMPLETE, "completed_at": now_utc(), "baseline": baseline, "quality": None, "result": None,
            "analysis_error": f"{type(exc).__name__}: {exc}"}})
        return await db[SESSIONS].find_one({"session_id": session_id})
    result["settings_snapshot"] = settings
    result["interval_seconds"] = s["interval_seconds"]
    result["session_id"] = session_id
    await db[SESSIONS].update_one({"session_id": session_id}, {"$set": {
        "status": COMPLETE, "completed_at": now_utc(), "baseline": result["baseline"], "quality": result["quality"],
        "result": result, "formula_version": result["formula_version"]}})
    logger.info("Learning complete sensor=%s n=%d score=%s status=%s", sid, len(rows),
                result["quality"]["score"], result["quality"]["status"])
    return await db[SESSIONS].find_one({"session_id": session_id})


async def get_active_baseline(db, sensor_id: str) -> dict | None:
    """Baseline of the most recent COMPLETE learning session (used by AI fault detection)."""
    doc = await db[SESSIONS].find_one({"sensor_id": sensor_id, "status": COMPLETE},
                                      sort=[("completed_at", -1)])
    return doc["baseline"] if doc else None


# --------------------------------------------------------- session control
async def start_session(db, sensor_id: str, body: LearningStart) -> dict:
    sensor = await ensure_exists(db, SENSORS, "sensor_id", sensor_id)
    if await _active_session(db, sensor_id):
        raise HTTPException(409, f"A learning session is already running for '{sensor_id}'")
    overrides = body.processing_overrides()
    if overrides:   # validated like PUT /sensor-processing; applies to the live pipeline for this sensor too
        await set_processing(db, sensor_id, ProcessingConfig(**overrides))
    cfg = await get_processing(db, sensor_id)
    doc = {
        "session_id": uuid.uuid4().hex[:12], "sensor_id": sensor_id,
        "sensor_type": sensor.get("sensor_type"), "status": COLLECTING,
        "target_readings": body.target_readings, "interval_seconds": body.interval_seconds,
        "valid_count": 0, "invalid_count": 0, "fault_count": 0, "comm_count": 0, "last_counted_at": None,
        "started_at": now_utc(), "completed_at": None, "baseline": None,
        "settings": {k: cfg[k] for k in SETTINGS_KEYS}, "formula_version": analysis.FORMULA_VERSION,
        "sensor_snapshot": {k: sensor.get(k) for k in ("sensor_id", "sensor_type", "unit", "normal_min", "normal_max",
                                                        "sampling_interval_seconds")},
    }
    await db[SESSIONS].insert_one(doc)
    return _clean(doc)


async def cancel_session(db, sensor_id: str) -> dict:
    s = await db[SESSIONS].find_one_and_update(
        {"sensor_id": sensor_id, "status": {"$in": [COLLECTING, ANALYZING]}},
        {"$set": {"status": CANCELLED, "completed_at": now_utc()}}, return_document=ReturnDocument.AFTER)
    if not s:
        raise HTTPException(404, f"No running learning session for '{sensor_id}'")
    return _clean(s)


async def list_learning_readings(db, sensor_id: str, session_id: str | None = None) -> list[dict]:
    if session_id is None:
        s = await db[SESSIONS].find_one({"sensor_id": sensor_id}, sort=[("started_at", -1), ("_id", -1)])
        if not s:
            return []
        session_id = s["session_id"]
    cur = db[LEARNING_READINGS].find({"session_id": session_id}).sort("reading_number", 1)
    return [_clean(d) async for d in cur]


async def _comm_reliability(db, sensor_id: str) -> dict:
    cutoff = now_utc() - timedelta(seconds=RELIABILITY_WINDOW_S)
    arrived = await db[PROCESSED].count_documents({"sensor_id": sensor_id, "timestamp": {"$gte": cutoff}})
    lost = await db[INVALID].count_documents(
        {"sensor_id": sensor_id, "timestamp": {"$gte": cutoff}, "fault_category": {"$in": sorted(COMM_SIDE)}})
    total = arrived + lost
    return {"window_seconds": RELIABILITY_WINDOW_S, "readings_received": arrived, "delivery_failures": lost,
            "reliability_pct": None if total == 0 else arrived / total * 100.0}


async def get_status(db, sensor_id: str) -> dict:
    sensor = await ensure_exists(db, SENSORS, "sensor_id", sensor_id)
    session = await db[SESSIONS].find_one({"sensor_id": sensor_id}, sort=[("started_at", -1), ("_id", -1)])
    now = _utc(now_utc())
    # Safety net: if finalising failed right after the target was reached, retry it (not while it is still in progress).
    if session and session["status"] == ANALYZING and session.get("analyzing_since") \
            and (now - _utc(session["analyzing_since"])).total_seconds() > 5:
        try:
            await finalize_session(db, session["session_id"])
            session = await db[SESSIONS].find_one({"session_id": session["session_id"]})
        except Exception:
            logger.exception("Retrying finalisation of session %s failed", session["session_id"])
    progress = None
    state = "NOT_STARTED"
    if session:
        started = _utc(session["started_at"])
        end = _utc(session["completed_at"]) if session.get("completed_at") else now
        remaining_n = max(0, session["target_readings"] - session["valid_count"])
        state = {"COLLECTING": "COLLECTING", "ANALYZING": "ANALYZING", "COMPLETE": "READY", "CANCELLED": "CANCELLED"}.get(session["status"], session["status"])
        progress = {
            "reading_number": session["valid_count"], "target": session["target_readings"],
            "invalid_events": session["invalid_count"],
            "elapsed_seconds": (end - started).total_seconds(),
            # estimate only: remaining valid readings x configured interval
            "remaining_seconds_estimate": remaining_n * session["interval_seconds"] if session["status"] == COLLECTING else 0,
            "collection_status": session["status"],
            "target_valid_readings": session["target_readings"], "valid_readings": session["valid_count"],
            "invalid_readings": session["invalid_count"], "fault_events": session.get("fault_count", 0),
            "communication_events": session.get("comm_count", 0), "interval_seconds": session["interval_seconds"],
            "final_quality_score": (session.get("quality") or {}).get("score") if session["status"] == COMPLETE else None,
            "analysis_error": session.get("analysis_error"),
            "message": f'{session["target_readings"]}/{session["target_readings"]} COLLECTION COMPLETE · BASELINE READY'
            if session["status"] == COMPLETE else None,
        }
    latest = await db[PROCESSED].find_one({"sensor_id": sensor_id}, sort=[("timestamp", -1), ("_id", -1)])
    # most recent COMPLETED test (kept visible while a new test is collecting)
    done = await db[SESSIONS].find_one({"sensor_id": sensor_id, "status": COMPLETE}, sort=[("completed_at", -1)])
    return _clean({
        "sensor_id": sensor_id, "unit": sensor.get("unit"),
        "processing": await get_processing(db, sensor_id),
        "baseline_status": state, "session": session, "progress": progress,
        "quality": done.get("quality") if done else None,
        "result": done.get("result") if done else None,
        "settings": (session or {}).get("settings"),
        "quality_from": None if not done else {
            "session_id": done["session_id"], "completed_at": done["completed_at"],
            "target_valid_readings": done["target_readings"],
            "is_latest_test": bool(session and session["session_id"] == done["session_id"])},
        "baseline": session.get("baseline") if session and session["status"] == COMPLETE else await get_active_baseline(db, sensor_id),
        "latest_processed": latest,
        "communication": await _comm_reliability(db, sensor_id),
    })


async def get_result(db, sensor_id: str, session_id: str | None = None) -> dict:
    """The persisted Final Learned Sensor Result (survives page refreshes). Default: the latest completed test."""
    await ensure_exists(db, SENSORS, "sensor_id", sensor_id)
    q = {"sensor_id": sensor_id, "status": COMPLETE}
    if session_id:
        q["session_id"] = session_id
    s = await db[SESSIONS].find_one(q, sort=[("completed_at", -1)])
    if not s or not s.get("result"):
        raise HTTPException(404, f"No completed learning result for '{sensor_id}'")
    return _clean({"session_id": s["session_id"], "started_at": s["started_at"], "completed_at": s["completed_at"],
                   "formula_version": s.get("formula_version", "quality-v1"), "result": s["result"]})


async def list_sessions(db, sensor_id: str, limit: int = 20) -> list[dict]:
    await ensure_exists(db, SENSORS, "sensor_id", sensor_id)
    out = []
    async for s in db[SESSIONS].find({"sensor_id": sensor_id}).sort([("started_at", -1), ("_id", -1)]).limit(limit):
        q = s.get("quality") or {}
        out.append({"session_id": s["session_id"], "status": s["status"], "target_valid_readings": s["target_readings"],
                    "valid_readings": s["valid_count"], "invalid_events": s.get("invalid_count", 0),
                    "started_at": s["started_at"], "completed_at": s.get("completed_at"),
                    "formula_version": s.get("formula_version", "quality-v1"),
                    "quality_score": q.get("score"), "quality_status": q.get("status"),
                    "recommended_status": ((s.get("result") or {}).get("recommended_status") or {}).get("status")})
    return _clean(out)
