"""
services/learning_analysis.py
------------------------------
PURE analysis (no DB) of a completed learning dataset -> the "Final Learned Sensor Result".

The Sensor Accuracy / Quality Score produced here is a BEHAVIOUR-BASED score computed only from the sensor's own
readings (raw, calibrated, filtered), its validation / fault / communication history, AI evidence and its baseline
history. It is NOT verified measurement accuracy: no reference device is used, and the result says so. Low variation
alone is never treated as proof of quality (a frozen sensor is perfectly "stable"), so a dedicated frozen-reading
check can cap the score and prevent a HEALTHY recommendation.

Separate from the Dynamic Trust Score: the trust score is read from sensor_health and only REPORTED here.

FORMULA VERSION "quality-v2" (stored with every result; any change to weights / thresholds / factors must get a new
version string - old sessions keep the version they were computed with):

  continuous sensors  (temperature, humidity, light, pressure, altitude, distance, gas, ...)
      valid_rate 15 | comm_reliability 10 | stability 20 | smoothness 15 | consistency 15 | in_range 5 | ai_cleanliness 20
  state sensors       (PIR motion; custom 0/1 sensors)
      valid_rate 25 | comm_reliability 15 | domain_validity 25 | consistency 15 | ai_cleanliness 20
  A factor whose evidence does not exist (e.g. no AI model trained, no communication data) is "unavailable" and the
  remaining weights are renormalised - it is never assumed to be 100.
  score = sum(value x weight) / sum(weights of available factors)
  caps:      FROZEN_SUSPECTED -> max 59 ; NO_STATE_CHANGE_OBSERVED -> max 79
  status:    < 55 UNRELIABLE ; < 80, or any caution -> SUSPECT ; else HEALTHY ; < 5 readings -> INSUFFICIENT_DATA
"""
from __future__ import annotations

import math
import statistics
from collections import Counter

from services.learning_stats import compute_baseline
from services.measurement_profiles import profile_for

FORMULA_VERSION = "quality-v2"
SCORE_TYPE = "BEHAVIOUR_QUALITY"
LABEL = "Sensor Accuracy / Quality Score (behaviour-based; not verified against a reference device)"

HEALTHY_MIN = 80.0
SUSPECT_MIN = 55.0
FROZEN_CAP = 59.0
NO_CHANGE_CAP = 79.0
MIN_SAMPLES = 5            # fewer valid readings -> no score at all
FROZEN_MIN_SAMPLES = 10    # frozen-sensor test needs at least this many readings
SUDDEN_K = 5.0
CONSISTENCY_K = 3.0
LARGE_CORRECTION_FRACTION = 0.15
DRIFT_CAUTION_STD = 3.0

WEIGHTS = {
    "continuous": {"valid_rate": 15, "comm_reliability": 10, "stability": 20, "smoothness": 15,
                   "consistency": 15, "in_range": 5, "ai_cleanliness": 20},
    "binary": {"valid_rate": 25, "comm_reliability": 15, "domain_validity": 25, "consistency": 15, "ai_cleanliness": 20},
}
FACTOR_INFO = {
    "valid_rate": ("Valid-reading rate", "valid readings / (valid + invalid events) during the test"),
    "comm_reliability": ("Communication reliability", "readings received / (received + delivery failures: timeouts, missing data, link errors)"),
    "stability": ("Stability", "spread (std dev) relative to the sensor's normal span, using this measurement's own scale"),
    "smoothness": ("Reading-to-reading behaviour", "half: share of steps that are not sudden jumps; half: typical step size - both per measurement type"),
    "consistency": ("Baseline consistency", "share of readings inside the learned band (previous completed baseline if one exists, else this dataset's own centre)"),
    "in_range": ("Within normal range", "share of readings inside the sensor's configured normal range"),
    "domain_validity": ("State validity", "share of readings that are a valid state (0 or 1)"),
    "ai_cleanliness": ("AI anomaly cleanliness", "share of readings the AI anomaly detector did NOT flag (unavailable if the detector produced no result)"),
}


def _stats(vals: list[float]) -> dict | None:
    if not vals:
        return None
    mean = statistics.fmean(vals)
    var = statistics.variance(vals) if len(vals) > 1 else 0.0
    return {"mean": mean, "median": statistics.median(vals), "min": min(vals), "max": max(vals),
            "range": max(vals) - min(vals), "variance": var, "std": math.sqrt(var)}


def _slope_per_s(ts: list, vals: list[float]) -> float:
    t0 = ts[0]
    xs = [(t - t0).total_seconds() for t in ts]
    mx, my = statistics.fmean(xs), statistics.fmean(vals)
    den = sum((x - mx) ** 2 for x in xs)
    return 0.0 if den == 0 else sum((x - mx) * (y - my) for x, y in zip(xs, vals)) / den


def _longest_run(vals: list[float]) -> int:
    best = run = 1
    for a, b in zip(vals, vals[1:]):
        run = run + 1 if abs(a - b) <= 1e-9 else 1
        best = max(best, run)
    return best if vals else 0


def _resolution(vals: list[float]) -> float | None:
    u = sorted(set(vals))
    diffs = [b - a for a, b in zip(u, u[1:]) if b - a > 1e-12]
    return min(diffs) if diffs else None


def analyze_dataset(*, rows: list[dict], sensor: dict, settings: dict, session: dict, invalid_summary: dict,
                    arrivals: int, prev_baseline: dict | None, trust: dict | None, final_trusted: dict | None,
                    settings_changed: bool = False) -> dict:
    """
    rows: chronological counted valid readings: timestamp, raw_value, calibrated_value, filtered_value and (when the
          pipeline produced them) ai_is_fault, ai_reasons, baseline_z, source, trusted_value, trusted_available.
    """
    n = len(rows)
    raw = [r["raw_value"] for r in rows]
    cal = [r["calibrated_value"] for r in rows]
    fil = [r["filtered_value"] for r in rows]
    ts = [r["timestamp"] for r in rows]
    stype = sensor.get("sensor_type")
    unit = sensor.get("unit")
    lo_n, hi_n = float(sensor.get("normal_min", min(cal))), float(sensor.get("normal_max", max(cal) + 1))
    span = hi_n - lo_n if hi_n > lo_n else 1.0
    prof = profile_for(stype, raw)
    binary = prof["kind"] == "binary"
    limitations: list[str] = [
        "Behaviour-based score: no reference device was used, so it does not verify physical measurement accuracy.",
        "Low variation alone is not proof of quality - a frozen sensor also looks stable (see the frozen-reading check).",
    ]
    cautions: list[str] = []
    if prof.get("generic"):
        limitations.append(f"No measurement-specific rules exist for type {stype}; the generic continuous profile was used.")

    # ---------------- statistics on every stage of the chain ----------------
    st = {"raw": _stats(raw), "calibrated": _stats(cal), "filtered": _stats(fil)}
    cs = st["calibrated"]
    mean_c = cs["mean"]
    if prof["cv"] and abs(mean_c) > 1e-9:
        cv, cv_note = cs["std"] / abs(mean_c) * 100.0, None
    else:
        cv, cv_note = None, "not meaningful for this measurement (interval-scale / state value or mean ~ 0)"

    # ---------------- reading-to-reading behaviour ----------------
    steps = [abs(b - a) for a, b in zip(cal, cal[1:])]
    med = statistics.median(cal)
    robust_sigma = 1.4826 * statistics.median(abs(v - med) for v in cal)
    lo_f, hi_f = prof["sudden"]
    threshold = min(max(SUDDEN_K * robust_sigma, lo_f * span), hi_f * span) if not binary else None
    sudden_idx = [i + 1 for i, s in enumerate(steps) if threshold is not None and s > threshold]
    mean_step = statistics.fmean(steps) if steps else 0.0
    variation = {"mean_abs_step": mean_step, "step_std": statistics.stdev(steps) if len(steps) > 1 else 0.0,
                 "max_step": max(steps) if steps else 0.0, "sudden_step_threshold": threshold,
                 "sudden_changes": len(sudden_idx),
                 "sudden_at_reading_numbers": [rows[i].get("reading_number", i + 1) for i in sudden_idx[:10]]}

    # ---------------- frozen-reading check (on RAW values; filters/calibration cannot mask it) ----------------
    run = _longest_run(raw)
    distinct = len(set(raw))
    frozen = {"assessed": n >= FROZEN_MIN_SAMPLES, "suspected": False, "longest_identical_run": run,
              "longest_run_fraction": run / n if n else 0.0, "distinct_values": distinct,
              "threshold_fraction": prof["frozen_run"], "value_resolution": _resolution(raw),
              "explanation": None}
    if binary:
        trans = sum(1 for a, b in zip(raw, raw[1:]) if a != b)
        ones = sum(1 for v in raw if v == 1.0)
        frozen["suspected"] = False
        frozen["explanation"] = "State sensor: a constant state can be legitimate (nothing happened); responsiveness is judged from state changes."
    elif frozen["assessed"] and (distinct == 1 or frozen["longest_run_fraction"] >= prof["frozen_run"]):
        frozen["suspected"] = True
        frozen["explanation"] = (f"{run} of {n} consecutive raw readings are identical ({distinct} distinct value(s)); "
                                 f"for a {stype or 'this'} sensor that is more repeating than expected - possible frozen / stuck output.")
        cautions.append("FROZEN_SUSPECTED")
    elif not frozen["assessed"]:
        frozen["explanation"] = f"Fewer than {FROZEN_MIN_SAMPLES} readings - frozen-sensor test not possible."
        limitations.append("Too few readings to test for a frozen sensor.")
        if distinct == 1:   # every reading identical and too few to judge: do not call that healthy
            cautions.append("ALL_READINGS_IDENTICAL_TOO_FEW_TO_JUDGE")
            limitations.append("All readings are identical but there are too few to decide whether the sensor is frozen.")

    # ---------------- calibration validity ----------------
    off, gain = float(settings.get("calibration_offset", 0.0)), float(settings.get("calibration_gain", 1.0))
    corr = statistics.fmean(c - r for c, r in zip(cal, raw))
    cal_issues = []
    if gain <= 0 or not math.isfinite(gain) or not math.isfinite(off):
        cal_issues.append("INVALID_PARAMETERS")
    if abs(corr) > LARGE_CORRECTION_FRACTION * span:
        cal_issues.append("LARGE_CORRECTION")
    vmin, vmax = settings.get("valid_min"), settings.get("valid_max")
    outside = sum(1 for c in cal if (vmin is not None and c < vmin) or (vmax is not None and c > vmax))
    if outside:
        cal_issues.append("CALIBRATED_VALUES_OUTSIDE_PHYSICAL_LIMITS")
    applied = off != 0.0 or gain != 1.0
    calibration = {"model": "linear: calibrated = raw x gain + offset", "offset": off, "gain": gain, "applied": applied,
                   "status": "NOT_APPLIED (identity)" if not applied else ("APPLIED" if not cal_issues else "APPLIED_WITH_ISSUES"),
                   "valid": not cal_issues, "issues": cal_issues, "mean_correction": corr,
                   "verified_against_reference": False}
    if applied:
        limitations.append("Calibration was applied but cannot be verified without a reference measurement.")
    if cal_issues:
        cautions.append("CALIBRATION_ISSUE")

    # ---------------- filtering effect ----------------
    method = settings.get("filter_method", "MEDIAN")
    step_c = statistics.fmean(abs(b - a) for a, b in zip(cal, cal[1:])) if n > 1 else 0.0
    step_f = statistics.fmean(abs(b - a) for a, b in zip(fil, fil[1:])) if n > 1 else 0.0
    dev = max(abs(f - c) for f, c in zip(fil, cal))
    filtering = {"method": method, "window": settings.get("filter_window"),
                 "alpha": settings.get("filter_alpha") if method == "EMA" else None,
                 "mean_step_before": step_c, "mean_step_after": step_f,
                 "noise_reduction_pct": (1 - step_f / step_c) * 100.0 if step_c > 0 and method != "NONE" else (0.0 if method == "NONE" else None),
                 "max_deviation_from_calibrated": dev,
                 "note": "Raw readings are always kept; filtering never replaces them, so faults stay visible in the raw data."}
    if threshold is not None and dev > threshold:
        filtering["note"] += " The filter moved a value by more than the sudden-change threshold (a spike was smoothed)."

    # ---------------- baseline & historical behaviour ----------------
    baseline = compute_baseline(list(zip(ts, cal)))
    duration = max(1.0, (ts[-1] - ts[0]).total_seconds())
    slope = _slope_per_s(ts, cal)
    floor = lo_f * span if not binary else 0.05
    scale_ref = max(cs["std"], floor, 1e-9)
    drift_total = slope * duration
    behaviour = {"trend_per_minute": slope * 60.0, "drift_over_session": drift_total, "drift_in_std": drift_total / scale_ref,
                 "duration_seconds": duration, "previous_baseline": None}
    if prev_baseline:
        shift = mean_c - prev_baseline["mean"]
        behaviour["previous_baseline"] = {"mean": prev_baseline["mean"], "std": prev_baseline["std"], "shift": shift,
                                          "shift_in_std": shift / max(prev_baseline["std"], floor, 1e-9)}
    if not binary and abs(drift_total) > DRIFT_CAUTION_STD * scale_ref and n >= 10:
        cautions.append("LARGE_DRIFT")

    # ---------------- AI, invalid events, communication, real/virtual ----------------
    evaluated = [r for r in rows if r.get("ai_is_fault") is not None]
    flagged = [r for r in evaluated if r["ai_is_fault"]]
    reasons = Counter(x for r in flagged for x in (r.get("ai_reasons") or []))
    ai = {"available": bool(evaluated), "readings_evaluated": len(evaluated), "anomalies": len(flagged),
          "anomaly_rate_pct": (100.0 * len(flagged) / len(evaluated)) if evaluated else None,
          "reasons": dict(reasons), "max_baseline_z": max([r["baseline_z"] for r in evaluated if r.get("baseline_z") is not None], default=None)}
    if not ai["available"]:
        limitations.append("No AI anomaly result was recorded for these readings (detector not trained or not run); that factor is excluded, not assumed good.")
    comm_events = int(invalid_summary.get("communication", 0))
    comm_total = arrivals + comm_events
    communication = {"readings_received": arrivals, "delivery_failures": comm_events,
                     "reliability_pct": 100.0 * arrivals / comm_total if comm_total else None}
    src = Counter((r.get("source") or "NOT_EVALUATED") for r in rows)
    source_history = {"REAL": src.get("REAL", 0), "VIRTUAL": src.get("VIRTUAL", 0), "REDUNDANT": src.get("REDUNDANT", 0),
                      "UNAVAILABLE": src.get("UNAVAILABLE", 0), "NOT_EVALUATED": src.get("NOT_EVALUATED", 0)}

    # ---------------- state-sensor specifics ----------------
    states = None
    if binary:
        trans = sum(1 for a, b in zip(raw, raw[1:]) if a != b)
        states = {"count_0": sum(1 for v in raw if v == 0.0), "count_1": sum(1 for v in raw if v == 1.0), "transitions": trans,
                  "duty_cycle_pct": 100.0 * sum(1 for v in raw if v == 1.0) / n, "longest_constant_run": run,
                  "state_changed": trans > 0}
        if not states["state_changed"]:
            cautions.append("NO_STATE_CHANGE_OBSERVED")
            limitations.append("No state change was observed: a state sensor that never changes cannot be told apart from one stuck at a constant output. Trigger it (e.g. move in front of a PIR) to verify it responds.")

    # ---------------- quality factors ----------------
    valid_total = session.get("valid_count", n) + int(invalid_summary.get("total", 0))
    fv: dict[str, float | None] = {
        "valid_rate": 100.0 * session.get("valid_count", n) / valid_total if valid_total else None,
        "comm_reliability": communication["reliability_pct"],
        "ai_cleanliness": 100.0 - ai["anomaly_rate_pct"] if ai["available"] else None,
    }
    if binary:
        fv["domain_validity"] = 100.0 * sum(1 for v in raw if v in (0.0, 1.0)) / n
        if prev_baseline:
            fv["consistency"] = max(0.0, 100.0 * (1.0 - abs(states["duty_cycle_pct"] / 100.0 - prev_baseline["mean"]) / 0.5))
            consistency_basis = "PREVIOUS_BASELINE"
        else:
            fv["consistency"], consistency_basis = None, "NONE"
    else:
        stab_zero = prof["stab_zero"]
        cap = stab_zero * span
        fv["stability"] = 100.0 * max(0.0, 1.0 - cs["std"] / (stab_zero * span))
        sudden_part = 100.0 * (1.0 - len(sudden_idx) / len(steps)) if steps else 100.0
        step_part = 100.0 * max(0.0, 1.0 - mean_step / (2.0 * stab_zero * span))
        fv["smoothness"] = 0.5 * sudden_part + 0.5 * step_part
        if prev_baseline:
            centre, scale, consistency_basis = prev_baseline["mean"], min(max(prev_baseline["std"], floor), cap), "PREVIOUS_BASELINE"
        else:
            centre, scale, consistency_basis = med, min(max(robust_sigma, floor), cap), "OWN_DATASET"
        fv["consistency"] = 100.0 * sum(1 for v in cal if abs(v - centre) <= CONSISTENCY_K * scale) / n
        fv["in_range"] = 100.0 * sum(1 for v in cal if lo_n <= v <= hi_n) / n

    weights = WEIGHTS["binary" if binary else "continuous"]
    avail_w = sum(w for k, w in weights.items() if fv.get(k) is not None)
    factors = []
    for k, w in weights.items():
        v = fv.get(k)
        label, desc = FACTOR_INFO[k]
        factors.append({"key": k, "label": label, "description": desc, "weight": w, "available": v is not None,
                        "value": v, "contribution": (v * w / avail_w) if (v is not None and avail_w) else None})
    base_score = sum(f["contribution"] for f in factors if f["contribution"] is not None) if avail_w else None

    caps = []
    if "FROZEN_SUSPECTED" in cautions:
        caps.append({"reason": "FROZEN_SUSPECTED", "max_score": FROZEN_CAP})
    if "NO_STATE_CHANGE_OBSERVED" in cautions:
        caps.append({"reason": "NO_STATE_CHANGE_OBSERVED", "max_score": NO_CHANGE_CAP})
    score = base_score
    if score is not None:
        for c in caps:
            score = min(score, c["max_score"])
    if n < MIN_SAMPLES or score is None:
        score, status = None, "INSUFFICIENT_DATA"
        limitations.append(f"Fewer than {MIN_SAMPLES} valid readings - no quality score is produced.")
    elif score < SUSPECT_MIN:
        status = "UNRELIABLE"
    elif score < HEALTHY_MIN or cautions:
        status = "SUSPECT"
    else:
        status = "HEALTHY"

    # ---------------- confidence ----------------
    pts, why = 0, []
    pts += 2 if n >= 30 else 1 if n >= 10 else 0
    why.append(f"{n} valid readings ({'enough for a reliable spread estimate' if n >= 30 else 'a small sample' if n >= 10 else 'very few'})")
    if ai["available"]:
        pts += 1; why.append("AI anomaly evidence available")
    else:
        why.append("no AI anomaly evidence")
    if prev_baseline:
        pts += 1; why.append("compared with a previous completed baseline")
    else:
        why.append("no previous baseline to compare with")
    if frozen["suspected"] or (binary and not states["state_changed"]):
        pts -= 1; why.append("possible frozen / non-responsive output lowers confidence")
    why.append("no reference device (accuracy not verified)")
    level = "HIGH" if pts >= 4 else "MEDIUM" if pts >= 2 else "LOW"
    if settings_changed:
        cautions.append("SETTINGS_CHANGED")
        limitations.append("Calibration / filter settings were changed while the test was running; early and late readings were processed differently.")

    quality = {
        "formula_version": FORMULA_VERSION, "score_type": SCORE_TYPE, "label": LABEL,
        "score": score, "status": status, "base_score_before_caps": base_score,
        "confidence": {"level": level, "points": pts, "reasons": why},
        "factors": factors, "caps": caps, "cautions": cautions, "limitations": limitations,
        "formula": {"version": FORMULA_VERSION, "weights": weights,
                    "thresholds": {"healthy_min": HEALTHY_MIN, "suspect_min": SUSPECT_MIN, "min_samples": MIN_SAMPLES},
                    "caps": {"FROZEN_SUSPECTED": FROZEN_CAP, "NO_STATE_CHANGE_OBSERVED": NO_CHANGE_CAP}},
        "measurement_kind": prof["kind"], "profile": {k: prof[k] for k in ("name", "note", "sudden", "stab_zero", "frozen_run")},
        "consistency_basis": consistency_basis,
        # compact fields the existing dashboard / cards already read
        "samples": n, "valid_readings": session.get("valid_count", n), "invalid_events": int(invalid_summary.get("total", 0)),
        "average": mean_c, "median": cs["median"], "minimum": cs["min"], "maximum": cs["max"], "std_dev": cs["std"],
        "variance": cs["variance"], "variation_range": cs["range"], "variation_cv_pct": cv,
        "mean_abs_step": mean_step, "max_step": variation["max_step"], "step_std": variation["step_std"],
        "sudden_changes": len(sudden_idx), "sudden_step_threshold": threshold,
        "stability": fv.get("stability"), "components": {k: v for k, v in fv.items() if v is not None},
        "weights": weights, "thresholds": {"healthy_min": HEALTHY_MIN, "warning_min": SUSPECT_MIN},
    }

    # ---------------- recommended operating status (uses quality AND the current trust, scores stay separate) ----------------
    reasons_rec = []
    tstate = (trust or {}).get("sensor_state")
    if status == "UNRELIABLE" or tstate == "FAULT":
        rec = "UNRELIABLE"
    elif status in ("SUSPECT", "INSUFFICIENT_DATA") or tstate in ("WARNING", "RECOVERING"):
        rec = "SUSPECT"
    else:
        rec = "HEALTHY"
    reasons_rec.append(f"quality status {status}")
    if tstate:
        reasons_rec.append(f"current trust state {tstate}")
    reasons_rec += [f"caution: {c}" for c in cautions]

    return {
        "formula_version": FORMULA_VERSION, "score_type": SCORE_TYPE,
        "target_valid_readings": session.get("target_readings"), "valid_readings": n,
        "invalid_events": invalid_summary,
        "measurement": {"sensor_id": sensor.get("sensor_id"), "sensor_type": stype, "unit": unit, "kind": prof["kind"],
                        "profile": prof["name"], "normal_min": lo_n, "normal_max": hi_n},
        "statistics": {**st, "coefficient_of_variation_pct": cv, "cv_note": cv_note},
        "variation": variation, "frozen": frozen, "states": states,
        "calibration": calibration, "filtering": filtering,
        "baseline": baseline, "behaviour": behaviour,
        "ai": ai, "communication": communication, "source_history": source_history,
        "quality": quality,
        "trust": {"score": (trust or {}).get("score"), "sensor_state": tstate, "recovery_state": (trust or {}).get("recovery_state"),
                  "note": "Dynamic Trust Score at completion - separate from the quality score and it keeps changing as new evidence arrives."},
        "final_trusted": final_trusted,
        "recommended_status": {"status": rec, "reasons": reasons_rec},
    }
