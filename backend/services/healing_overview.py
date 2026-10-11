"""
services/healing_overview.py
-----------------------------
One read-only view of the self-healing pipeline state of a sensor, assembled from the
collections the existing stages already write (sensor_health, predictions, trusted_readings,
processed_readings). Nothing is recomputed here and nothing is invented: a missing piece is
returned as None.
"""
from __future__ import annotations

from services.learning_service import SENSORS, PROCESSED, SESSIONS, _clean, get_processing
from services.virtual_sensor import SOURCE_RAW, TRUSTED_READINGS_COLLECTION
from utils.validators import ensure_exists

_SOURCE_LABEL = {SOURCE_RAW: "REAL", "VIRTUAL": "VIRTUAL", "REDUNDANT": "REDUNDANT", "UNAVAILABLE": "UNAVAILABLE"}


async def get_overview(db, sensor_id: str) -> dict:
    sensor = await ensure_exists(db, SENSORS, "sensor_id", sensor_id)
    latest = {"sort": [("timestamp", -1), ("_id", -1)]}
    health = await db["sensor_health"].find_one({"sensor_id": sensor_id})
    pred = await db["predictions"].find_one({"sensor_id": sensor_id}, **latest)
    trusted = await db[TRUSTED_READINGS_COLLECTION].find_one({"sensor_id": sensor_id}, **latest)
    processed = await db[PROCESSED].find_one({"sensor_id": sensor_id}, **latest)

    def pick(key):
        if trusted and trusted.get(key) is not None:
            return trusted[key]
        return processed.get(key) if processed else None

    raw = trusted["raw_value"] if trusted else (processed["raw_value"] if processed else None)
    session = await db[SESSIONS].find_one({"sensor_id": sensor_id}, sort=[("started_at", -1)])
    cfg = await get_processing(db, sensor_id)
    pipeline = _pipeline(sensor, cfg, health, pred, trusted, processed, session, raw)
    return _clean({
        "pipeline": pipeline,
        "sensor_id": sensor_id,
        "unit": sensor.get("unit"),
        "sensor_state": health.get("sensor_state") if health else None,   # HEALTHY / WARNING / FAULT / RECOVERING
        "trust_score": health.get("trust_score") if health else sensor.get("trust_score"),
        "ai": None if not pred else ("ANOMALY" if pred["is_fault"] else "NORMAL"),
        "ai_reasons": (pred or {}).get("fault_reasons") or [],
        "source": _SOURCE_LABEL.get(trusted["source"], trusted["source"]) if trusted else None,
        "raw_value": raw,
        "calibrated_value": pick("calibrated_value" if trusted else "calibrated_value"),
        "filtered_value": pick("filtered_value"),
        "trusted_value": trusted.get("trusted_value") if trusted else None,
        "trusted_available": bool(trusted.get("available", True)) if trusted else None,
        "unavailable_reason": (trusted or {}).get("unavailable_reason"),
        "redundant_sources": (trusted or {}).get("redundant_sources"),
        "raw_isolated": (trusted or {}).get("raw_isolated"),
        "recovery_state": health.get("recovery_state") if health else None,  # NORMAL / FAULT / VERIFYING / RECOVERED
        "recovery_progress": None if not health else {
            "consecutive_valid": health.get("consecutive_healthy", 0),
            "required": health.get("recovery_required"),
        },
        "last_updated": (trusted or {}).get("timestamp"),
    })


def _f(v, d=2):
    return "—" if v is None else f"{float(v):.{d}f}"


def _pipeline(sensor, cfg, health, pred, trusted, processed, session, raw) -> dict:
    """
    State of every stage of the pipeline, derived only from stored data.
    state: ok (passed / healthy) | alert (fault or problem) | active (in effect right now) | idle (not applicable now)
    """
    u = sensor.get("unit") or ""
    p: dict = {}
    has = trusted is not None or processed is not None
    rec = (health or {}).get("recovery_state")
    state = (health or {}).get("sensor_state")
    source = _SOURCE_LABEL.get(trusted["source"], trusted["source"]) if trusted else None
    available = bool(trusted.get("available", True)) if trusted else None
    trust = (health or {}).get("trust_score")
    prog_n = (health or {}).get("consecutive_healthy", 0)
    prog_req = (health or {}).get("recovery_required")

    p["sensor"] = ("ok" if sensor.get("enabled", True) and has else "idle" if not has else "alert",
                   f'{sensor["sensor_id"]} · {"enabled" if sensor.get("enabled", True) else "DISABLED"}')
    p["raw"] = ("ok" if raw is not None else "idle", f"{_f(raw)} {u}" if raw is not None else "no reading yet")
    cal = (processed or {}).get("calibrated_value")
    p["calibration"] = ("ok" if cal is not None else "idle",
                        f'{_f(cal)} {u} (offset {cfg["calibration_offset"]}, gain {cfg["calibration_gain"]})' if cal is not None else "—")
    fil = (processed or {}).get("filtered_value")
    p["filtering"] = ("ok" if fil is not None else "idle", f'{_f(fil)} {u} (median of {cfg["filter_window"]})' if fil is not None else "—")
    if processed is None:
        p["validation"] = ("idle", "—")
    elif processed.get("valid"):
        p["validation"] = ("ok", "valid")
    else:
        p["validation"] = ("alert", f'{processed.get("fault_category")}: {processed.get("reason")}')

    if not session:
        p["baseline"] = ("idle", "not learned yet — run the 30-reading test")
    elif session["status"] == "COMPLETE":
        q = session.get("quality") or {}
        p["baseline"] = ("ok", f'READY · quality {_f(q.get("score"), 1)}% {q.get("status", "")}'.strip())
    elif session["status"] == "COLLECTING":
        p["baseline"] = ("active", f'collecting {session["valid_count"]}/{session["target_readings"]}')
    else:
        p["baseline"] = ("idle", "last test cancelled")

    if pred is None:
        p["ai"] = ("idle", "—")
    else:
        reasons = ", ".join(pred.get("fault_reasons") or [])
        p["ai"] = ("alert", f"ANOMALY ({reasons})") if pred["is_fault"] else ("ok", "NORMAL")

    tone = {"HEALTHY": "ok", "WARNING": "alert", "FAULT": "alert", "RECOVERING": "active"}.get(state, "idle")
    p["trust"] = (tone, f'{_f(trust, 0)}% · {state}' if state else "—")

    trusted_yes = source == "REAL"
    p["decision"] = ("idle", "—") if source is None else (
        ("ok", "YES — sensor trusted") if trusted_yes else ("alert", "NO — sensor not trusted"))
    p["real_value"] = ("ok", f'{_f(trusted["trusted_value"])} {u}') if trusted_yes else ("idle", "not used")
    if source is None or trusted_yes:
        p["isolate"] = ("idle", "nothing to isolate")
    else:
        p["isolate"] = ("alert", f"raw {_f(raw)} {u} kept out of the trusted chain")
    if source in ("VIRTUAL", "REDUNDANT"):
        extra = f' from {", ".join(trusted.get("redundant_sources") or [])}' if source == "REDUNDANT" else ""
        p["substitute"] = ("active", f'{source}{extra}: {_f(trusted["trusted_value"])} {u}')
    elif source == "UNAVAILABLE":
        p["substitute"] = ("alert", f'UNAVAILABLE — {trusted.get("unavailable_reason") or "no safe value"}')
    else:
        p["substitute"] = ("idle", "not needed")
    p["trusted_value"] = ("idle", "—") if source is None else (
        ("ok", f'{_f(trusted["trusted_value"])} {u} ({source})') if available else ("alert", "UNAVAILABLE"))
    p["automation"] = ("idle", "—") if source is None else (
        ("ok", "evaluated with the trusted value") if available else ("alert", "HELD — no safe value"))
    p["actuator"] = ("idle", "—") if source is None else (
        ("ok", "driven by the trusted value only") if available else ("alert", "keeps its last state"))

    p["monitoring"] = ("idle", "—") if not health else (
        "ok" if state == "HEALTHY" else "active",
        f'{health.get("consecutive_faults", 0)} fault(s) in a row · {prog_n} valid in a row')
    rec_tone = {"NORMAL": "idle", "FAULT": "alert", "VERIFYING": "active", "RECOVERED": "ok"}.get(rec, "idle")
    rec_text = {"NORMAL": "no fault episode", "FAULT": "fault active — waiting for valid readings",
                "VERIFYING": "valid readings seen — verifying", "RECOVERED": "recovery verified"}.get(rec, "—")
    p["recovery_detection"] = (rec_tone, rec_text)
    p["valid_readings"] = ({"VERIFYING": "active", "RECOVERED": "ok"}.get(rec, "idle"),
                           f"{prog_n}/{prog_req}+ consecutive valid" if prog_req and rec in ("FAULT", "VERIFYING", "RECOVERED") else "not needed")
    p["trust_recovery"] = ({"VERIFYING": "active", "RECOVERED": "ok"}.get(rec, "idle"),
                           f"trust {_f(trust, 0)}%" if trust is not None else "—")
    p["restored"] = ("ok", "real sensor restored and trusted") if rec == "RECOVERED" else (
        ("ok", "real sensor in use") if trusted_yes and rec == "NORMAL" else ("idle", "not restored yet"))
    return {k: {"state": s, "detail": d} for k, (s, d) in p.items()}
