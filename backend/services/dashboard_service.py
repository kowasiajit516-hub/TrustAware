"""
services/dashboard_service.py
------------------------------
One read-only view of EVERY registered sensor for the dashboard: its latest raw / calibrated /
filtered / trusted values, trust, AI status, REAL/VIRTUAL source, health, last update, learning
progress / quality score and fault evidence - plus a merged history that keeps invalid / missing /
timeout / communication events visible.

Nothing is invented: every field is read from the collections the pipeline already writes
(sensors, sensor_readings, processed_readings, trusted_readings, predictions, sensor_health,
learning_sessions, invalid_readings, sensor_processing). No limit is applied to the sensor list.

Devices: a physical part with several measurements (DHT22 = temperature + humidity,
BMP280 = pressure + altitude) is registered as several sensors. Giving them the same
`device_group` (PUT /dashboard/sensors/{id}/device) shows them as ONE card with ALL measurements.
Sensors without a group are shown as their own card - never hidden.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import timedelta

from fastapi import HTTPException

from models.reading import now_utc
from services.learning_service import (INVALID, PROCESSED, PROCESSING, SESSIONS, SENSORS, _clean, _utc)
from services.virtual_sensor import SOURCE_RAW, TRUSTED_READINGS_COLLECTION
from utils.validators import ensure_exists

logger = logging.getLogger(__name__)

READINGS = "sensor_readings"
_LATEST = [("timestamp", -1), ("_id", -1)]
RECENT_FAULT_WINDOW_S = 600
SOURCE_LABEL = {SOURCE_RAW: "REAL", "VIRTUAL": "VIRTUAL", "REDUNDANT": "REDUNDANT", "UNAVAILABLE": "UNAVAILABLE"}
LEGACY_STATE = {"HEALTHY": "HEALTHY", "FAULTY": "FAULT", "RECOVERING": "RECOVERING", "OFFLINE": "OFFLINE"}
_RANK = {"FAULT": 4, "WARNING": 3, "RECOVERING": 2, "OFFLINE": 1, "HEALTHY": 0}


def _label(sensor_type: str | None) -> str:
    return (sensor_type or "CUSTOM").replace("_", " ").title()


async def _sensor_view(db, sensor: dict, health: dict | None, cfg: dict | None, now) -> dict:
    sid = sensor["sensor_id"]
    cutoff = now - timedelta(seconds=RECENT_FAULT_WINDOW_S)
    pred, trusted, processed, reading, last_bad, bad_recent, session = await asyncio.gather(
        db["predictions"].find_one({"sensor_id": sid}, sort=_LATEST),
        db[TRUSTED_READINGS_COLLECTION].find_one({"sensor_id": sid}, sort=_LATEST),
        db[PROCESSED].find_one({"sensor_id": sid}, sort=_LATEST),
        db[READINGS].find_one({"sensor_id": sid}, sort=_LATEST),
        db[INVALID].find_one({"sensor_id": sid}, sort=_LATEST),
        db[INVALID].count_documents({"sensor_id": sid, "timestamp": {"$gte": cutoff}}),
        db[SESSIONS].find_one({"sensor_id": sid}, sort=[("started_at", -1), ("_id", -1)]),
    )

    stamps = [_utc(d["timestamp"]) for d in (reading, processed, trusted) if d]
    last_update = max(stamps) if stamps else None
    age = (now - last_update).total_seconds() if last_update else None
    stale_after = max(30.0, 3.0 * float(sensor.get("sampling_interval_seconds", 5)))
    if not sensor.get("enabled", True):
        data_state = "DISABLED"
    elif last_update is None:
        data_state = "NO_DATA"
    else:
        data_state = "STALE" if age > stale_after else "LIVE"

    state = (health or {}).get("sensor_state") or LEGACY_STATE.get(sensor.get("status"), "HEALTHY")
    source = SOURCE_LABEL.get(trusted["source"], trusted["source"]) if trusted else None

    # measurement problem, shown on the card instead of hiding the sensor or the reading
    issue = None
    if processed is not None and not processed.get("valid", True):
        issue = f'{processed.get("fault_category")}: {processed.get("reason")}'
    if last_bad and (last_update is None or _utc(last_bad["timestamp"]) >= last_update - timedelta(seconds=1)):
        issue = f'{last_bad["fault_category"]}: {last_bad["reason"]}'
    if issue is None and data_state == "STALE":
        issue = f"No new reading for {age:.0f}s"
    if issue is None and data_state == "NO_DATA":
        issue = "No readings received yet"
    if trusted is not None and trusted.get("available") is False:
        issue = issue or f'Trusted value unavailable: {trusted.get("unavailable_reason")}'

    learning = None
    if session:
        q = session.get("quality") or {}
        learning = {
            "state": {"COLLECTING": "COLLECTING", "ANALYZING": "ANALYZING", "COMPLETE": "READY", "CANCELLED": "CANCELLED"}.get(session["status"], session["status"]),
            "reading_number": session["valid_count"], "target": session["target_readings"],
            "invalid_events": session.get("invalid_count", 0),
            "quality": {"score": q.get("score"), "status": q.get("status")} if q else None,
        }

    return {
        "sensor_id": sid, "name": sensor.get("name"), "sensor_type": sensor.get("sensor_type"),
        "label": _label(sensor.get("sensor_type")), "unit": sensor.get("unit"),
        "location": sensor.get("location"), "node_id": sensor.get("node_id"),
        "enabled": sensor.get("enabled", True),
        "device_group": (cfg or {}).get("device_group"), "device_model": (cfg or {}).get("device_model"),
        "sensor_state": state, "status": (health or {}).get("status") or sensor.get("status"),
        "trust_score": (health or {}).get("trust_score", sensor.get("trust_score")),
        "ai": None if not pred else ("ANOMALY" if pred["is_fault"] else "NORMAL"),
        "ai_reasons": (pred or {}).get("fault_reasons") or [],
        "source": source,
        "raw_value": reading["value"] if reading else (trusted or {}).get("raw_value"),
        "calibrated_value": (processed or {}).get("calibrated_value", (trusted or {}).get("calibrated_value")),
        "filtered_value": (processed or {}).get("filtered_value", (trusted or {}).get("filtered_value")),
        "trusted_value": (trusted or {}).get("trusted_value"),
        "trusted_available": None if not trusted else bool(trusted.get("available", True)),
        "unavailable_reason": (trusted or {}).get("unavailable_reason"),
        "raw_isolated": (trusted or {}).get("raw_isolated"),
        "recovery_state": (health or {}).get("recovery_state"),
        "last_update": last_update, "age_seconds": age, "data_state": data_state,
        "measurement_issue": issue,
        "faults": {"recent_count": bad_recent, "window_seconds": RECENT_FAULT_WINDOW_S,
                   "last": None if not last_bad else {
                       "category": last_bad["fault_category"], "reason": last_bad["reason"],
                       "timestamp": last_bad["timestamp"], "side": last_bad.get("fault_side")}},
        "learning": learning,
    }


async def _safe_view(db, sensor: dict, health, cfg, now) -> dict:
    """Never let one malformed sensor/document hide ALL sensors: return a clearly-marked degraded entry instead."""
    try:
        return await _sensor_view(db, sensor, health, cfg, now)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Dashboard view failed for sensor %s", sensor.get("sensor_id"))
        return {
            "sensor_id": sensor.get("sensor_id"), "name": sensor.get("name"), "sensor_type": sensor.get("sensor_type"),
            "label": _label(sensor.get("sensor_type")), "unit": sensor.get("unit"), "location": sensor.get("location"),
            "node_id": sensor.get("node_id"), "enabled": sensor.get("enabled", True),
            "device_group": (cfg or {}).get("device_group"), "device_model": (cfg or {}).get("device_model"),
            "sensor_state": None, "status": None, "trust_score": None, "ai": None, "ai_reasons": [], "source": None,
            "raw_value": None, "calibrated_value": None, "filtered_value": None, "trusted_value": None,
            "trusted_available": None, "unavailable_reason": None, "raw_isolated": None, "recovery_state": None,
            "last_update": None, "age_seconds": None, "data_state": "ERROR",
            "measurement_issue": f"Could not read this sensor's data: {type(exc).__name__}: {exc}",
            "faults": {"recent_count": 0, "window_seconds": RECENT_FAULT_WINDOW_S, "last": None}, "learning": None,
        }


async def get_sensor_dashboard(db) -> dict:
    now = _utc(now_utc())
    sensors = [s async for s in db[SENSORS].find({}).sort("sensor_id", 1)]       # NO limit
    health = {h["sensor_id"]: h async for h in db["sensor_health"].find({})}
    cfgs = {c["sensor_id"]: c async for c in db[PROCESSING].find({})}
    views = await asyncio.gather(*[_safe_view(db, s, health.get(s["sensor_id"]), cfgs.get(s["sensor_id"]), now)
                                   for s in sensors])

    groups: dict[str, dict] = {}
    for v in views:
        gid = v["device_group"] or v["sensor_id"]
        g = groups.setdefault(gid, {"device_id": gid, "name": v["device_group"] or v["name"] or v["sensor_id"],
                                    "model": v["device_model"], "grouped": bool(v["device_group"]),
                                    "node_id": v["node_id"], "location": v["location"], "sensors": []})
        g["sensors"].append(v)
        g["model"] = g["model"] or v["device_model"]
    devices = []
    for g in groups.values():
        ss = g["sensors"]
        g["state"] = max((s["sensor_state"] for s in ss), key=lambda x: _RANK.get(x, 0))
        stamps = [s["last_update"] for s in ss if s["last_update"]]
        g["last_update"] = max(stamps) if stamps else None
        g["measurements"] = len(ss)
        devices.append(g)

    count = lambda f: sum(1 for v in views if f(v))
    return _clean({
        "generated_at": now,
        "counts": {
            "sensors": len(views), "enabled": count(lambda v: v["enabled"]), "devices": len(devices),
            "live": count(lambda v: v["data_state"] == "LIVE"), "stale": count(lambda v: v["data_state"] == "STALE"),
            "no_data": count(lambda v: v["data_state"] == "NO_DATA"),
            "error": count(lambda v: v["data_state"] == "ERROR"),
            "disabled": count(lambda v: v["data_state"] == "DISABLED"),
            "fault": count(lambda v: v["sensor_state"] == "FAULT"),
            "virtual": count(lambda v: v["source"] in ("VIRTUAL", "REDUNDANT")),
            "with_issue": count(lambda v: bool(v["measurement_issue"])),
        },
        "sensors": views,
        "devices": devices,
    })


async def get_sensor_history(db, sensor_id: str, limit: int = 100) -> list[dict]:
    """Raw readings (with their processed + trusted values) AND fault events, newest first."""
    await ensure_exists(db, SENSORS, "sensor_id", sensor_id)
    raws = [r async for r in db[READINGS].find({"sensor_id": sensor_id}).sort(_LATEST).limit(limit)]
    ids = [str(r["_id"]) for r in raws]
    proc = {p["reading_id"]: p async for p in db[PROCESSED].find({"sensor_id": sensor_id, "reading_id": {"$in": ids}})}
    trus = {t["reading_id"]: t async for t in db[TRUSTED_READINGS_COLLECTION].find(
        {"sensor_id": sensor_id, "reading_id": {"$in": ids}})}
    out = []
    for r in raws:
        rid = str(r["_id"]); p = proc.get(rid) or {}; t = trus.get(rid) or {}
        out.append({
            "kind": "READING", "timestamp": r["timestamp"], "reading_id": rid, "raw_value": r["value"],
            "calibrated_value": p.get("calibrated_value"), "filtered_value": p.get("filtered_value"),
            "trusted_value": t.get("trusted_value"), "trusted_available": t.get("available") if t else None,
            "source": SOURCE_LABEL.get(t.get("source"), t.get("source")) if t else None,
            "valid": p.get("valid", True) if p else True,
            "fault_category": p.get("fault_category"), "reason": p.get("reason"),
        })
    async for e in db[INVALID].find({"sensor_id": sensor_id, "reading_id": None}).sort(_LATEST).limit(limit):
        out.append({"kind": "FAULT", "timestamp": e["timestamp"], "raw_value": e.get("raw_value"),
                    "fault_category": e["fault_category"], "reason": e["reason"], "valid": False,
                    "validation_status": e.get("validation_status"),
                    "communication_status": e.get("communication_status"), "source_of_event": e.get("source")})
    out.sort(key=lambda x: _utc(x["timestamp"]), reverse=True)
    return _clean(out[:limit])


async def set_device(db, sensor_id: str, device_group: str | None, device_model: str | None) -> dict:
    await ensure_exists(db, SENSORS, "sensor_id", sensor_id)
    group = (device_group or "").strip()[:64]
    model = (device_model or "").strip()[:64]
    upd = {"$set": {"device_model": model or None, "updated_at": now_utc()}}
    upd["$set"]["device_group"] = group or None
    await db[PROCESSING].update_one({"sensor_id": sensor_id}, upd, upsert=True)
    return {"sensor_id": sensor_id, "device_group": group or None, "device_model": model or None}
