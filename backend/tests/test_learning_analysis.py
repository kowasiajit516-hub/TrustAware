"""
Pure tests (no MongoDB) for the final learned result / quality score v2 (services/learning_analysis.py):
frozen-but-stable sensors, calibration, filtering, sudden jumps, measurement-specific logic, state sensors,
insufficient data, versioning, and the separation of quality from trust.
"""
import math
import random
import statistics
from datetime import datetime, timedelta, timezone

import pytest

from services import learning_analysis as la
from services import signal_processing as sp

T0 = datetime(2026, 1, 1, tzinfo=timezone.utc)
SENSORS = {
    "TEMPERATURE": dict(sensor_id="T", sensor_type="TEMPERATURE", unit="C", normal_min=15.0, normal_max=40.0),
    "HUMIDITY": dict(sensor_id="H", sensor_type="HUMIDITY", unit="%", normal_min=20.0, normal_max=80.0),
    "LIGHT": dict(sensor_id="L", sensor_type="LIGHT", unit="lux", normal_min=0.0, normal_max=1000.0),
    "PRESSURE": dict(sensor_id="P", sensor_type="PRESSURE", unit="hPa", normal_min=900.0, normal_max=1100.0),
    "DISTANCE": dict(sensor_id="D", sensor_type="DISTANCE", unit="cm", normal_min=2.0, normal_max=400.0),
    "ALTITUDE": dict(sensor_id="A", sensor_type="ALTITUDE", unit="m", normal_min=-50.0, normal_max=2000.0),
    "MOTION": dict(sensor_id="M", sensor_type="MOTION", unit="state", normal_min=0.0, normal_max=1.0),
}


def rows_from(raw, *, offset=0.0, gain=1.0, method="MEDIAN", window=3, alpha=0.3, step=10):
    rows, prev_cal, prev_fil = [], [], None
    for i, r in enumerate(raw):
        c = sp.calibrate(r, offset, gain)
        f = sp.apply_filter(method, prev_cal, c, window, alpha, prev_fil)
        rows.append({"reading_number": i + 1, "timestamp": T0 + timedelta(seconds=i * step),
                     "raw_value": r, "calibrated_value": c, "filtered_value": f})
        prev_cal.append(c); prev_fil = f
    return rows


def analyze(raw, stype="TEMPERATURE", *, invalid=None, ai=None, prev=None, trust=None, arrivals=None, **kw):
    settings = {"calibration_offset": kw.pop("offset", 0.0), "calibration_gain": kw.pop("gain", 1.0), "valid_min": None, "valid_max": None,
                "filter_method": kw.get("method", "MEDIAN"), "filter_window": kw.get("window", 3), "filter_alpha": kw.get("alpha", 0.3)}
    rows = rows_from(raw, offset=settings["calibration_offset"], gain=settings["calibration_gain"], method=settings["filter_method"],
                     window=settings["filter_window"], alpha=settings["filter_alpha"])
    if ai is not None:
        for r in rows:
            r["ai_is_fault"], r["ai_reasons"], r["baseline_z"] = ai, (["ISOLATION_FOREST"] if ai else []), 0.1
    inv = invalid or {"total": 0, "communication": 0, "sensor_side": 0}
    return la.analyze_dataset(rows=rows, sensor=SENSORS[stype], settings=settings, session={"target_readings": len(raw), "valid_count": len(raw)},
                              invalid_summary=inv, arrivals=len(raw) if arrivals is None else arrivals, prev_baseline=prev,
                              trust=trust, final_trusted=None)


def noisy(n, base, sd, seed=1):
    r = random.Random(seed)
    return [round(base + r.gauss(0, sd), 2) for _ in range(n)]


def test_healthy_sensor_and_every_required_part_present():
    res = analyze(noisy(30, 24.0, 0.1), ai=False)
    q = res["quality"]
    assert q["status"] == "HEALTHY" and q["score"] > 80 and q["formula_version"] == "quality-v2"
    for key in ["statistics", "variation", "frozen", "calibration", "filtering", "baseline", "behaviour", "ai", "communication",
                "source_history", "quality", "trust", "recommended_status", "invalid_events"]:
        assert key in res
    for stage in ("raw", "calibrated", "filtered"):
        s = res["statistics"][stage]
        assert {"mean", "median", "min", "max", "range", "variance", "std"} <= set(s)
    assert res["quality"]["confidence"]["level"] in ("LOW", "MEDIUM", "HIGH")
    assert any("no reference device" in x for x in q["limitations"])           # honest labelling
    assert math.isclose(sum(f["contribution"] for f in q["factors"] if f["contribution"] is not None), q["score"], rel_tol=1e-9)


def test_frozen_but_stable_sensor_is_not_healthy():
    res = analyze([24.0] * 30, ai=False)
    q = res["quality"]
    assert res["frozen"]["suspected"] is True and "FROZEN_SUSPECTED" in q["cautions"]
    assert q["score"] <= la.FROZEN_CAP and q["status"] == "SUSPECT"
    assert res["recommended_status"]["status"] == "SUSPECT"
    assert q["base_score_before_caps"] > 90          # perfectly 'stable' before the cap - low variation alone was not trusted
    stab = next(f for f in q["factors"] if f["key"] == "stability")
    assert stab["value"] == 100.0


def test_frozen_check_is_measurement_specific():
    # 60% identical readings: suspicious for a noisy ADC light sensor, normal for slow coarse-resolution humidity
    seq = [400.0] * 18 + noisy(12, 400.0, 3.0)
    assert analyze(seq, "LIGHT")["frozen"]["suspected"] is True
    hum = [55.0] * 18 + [55.1, 55.0, 55.1, 55.2, 55.1, 55.0, 55.1, 55.2, 55.1, 55.0, 55.1, 55.1]
    assert analyze(hum, "HUMIDITY")["frozen"]["suspected"] is False


def test_unfrozen_noise_is_not_flagged_and_short_runs_cannot_be_assessed():
    assert analyze(noisy(40, 1010.0, 0.1), "PRESSURE")["frozen"]["suspected"] is False
    short = analyze([24.0] * 7)
    assert short["frozen"]["assessed"] is False
    assert any("Too few readings to test for a frozen" in x for x in short["quality"]["limitations"])
    assert "ALL_READINGS_IDENTICAL_TOO_FEW_TO_JUDGE" in short["quality"]["cautions"] and short["quality"]["status"] == "SUSPECT"
    varied = analyze([24.0, 24.1, 23.9, 24.0, 24.2, 24.1, 23.9], ai=False)      # varying, merely short: not flagged
    assert varied["frozen"]["assessed"] is False and "ALL_READINGS_IDENTICAL_TOO_FEW_TO_JUDGE" not in varied["quality"]["cautions"]


def test_sudden_jumps_are_detected_and_lower_the_score():
    calm = analyze(noisy(30, 24.0, 0.05), ai=False)
    spiky_raw = noisy(30, 24.0, 0.05); spiky_raw[8] = 36.0; spiky_raw[20] = 16.0
    spiky = analyze(spiky_raw, ai=False)
    assert spiky["variation"]["sudden_changes"] >= 4 and calm["variation"]["sudden_changes"] == 0
    assert spiky["variation"]["sudden_at_reading_numbers"]
    assert spiky["quality"]["score"] < calm["quality"]["score"] - 5


def test_calibration_is_reflected_in_values_and_results():
    raw = noisy(30, 24.0, 0.1)
    plain, cal = analyze(raw), analyze(raw, offset=1.5, gain=1.0)
    assert cal["statistics"]["calibrated"]["mean"] == pytest.approx(plain["statistics"]["calibrated"]["mean"] + 1.5)
    assert cal["statistics"]["raw"]["mean"] == pytest.approx(plain["statistics"]["raw"]["mean"])      # raw untouched
    assert cal["calibration"]["applied"] and cal["calibration"]["offset"] == 1.5 and not plain["calibration"]["applied"]
    assert cal["calibration"]["mean_correction"] == pytest.approx(1.5) and cal["calibration"]["verified_against_reference"] is False
    assert any("cannot be verified" in x for x in cal["quality"]["limitations"])
    big = analyze(raw, offset=8.0)                                                                       # 32% of the span
    assert "LARGE_CORRECTION" in big["calibration"]["issues"] and "CALIBRATION_ISSUE" in big["quality"]["cautions"]
    assert big["quality"]["status"] != "HEALTHY"


def test_filter_method_changes_filtered_values_and_documented_result():
    raw = noisy(40, 24.0, 0.4, seed=5); raw[15] = 31.0
    res = {m: analyze(raw, method=m, window=5, alpha=0.3) for m in ("NONE", "MEDIAN", "MOVING_AVERAGE", "EMA")}
    means = {m: r["statistics"]["filtered"]["std"] for m, r in res.items()}
    assert len(set(round(v, 6) for v in means.values())) == 4                                         # four distinct filtered series
    assert res["NONE"]["statistics"]["filtered"]["mean"] == pytest.approx(res["NONE"]["statistics"]["calibrated"]["mean"])
    for m in ("MEDIAN", "MOVING_AVERAGE", "EMA"):
        assert res[m]["filtering"]["method"] == m and res[m]["filtering"]["noise_reduction_pct"] > 0
    assert res["NONE"]["filtering"]["noise_reduction_pct"] == 0.0
    assert res["EMA"]["filtering"]["alpha"] == 0.3 and res["MEDIAN"]["filtering"]["alpha"] is None and res["MEDIAN"]["filtering"]["window"] == 5
    assert res["MOVING_AVERAGE"]["filtering"]["max_deviation_from_calibrated"] > 0
    assert all(r["statistics"]["raw"]["max"] == 31.0 for r in res.values())                           # raw spike still visible whatever the filter


def test_apply_filter_unit_behaviour():
    assert sp.apply_filter("MEDIAN", [20, 20], 90.0, 3) == 20                    # median ignores a single spike
    assert sp.apply_filter("MOVING_AVERAGE", [20, 20], 80.0, 3) == pytest.approx(40.0)   # average spreads it
    assert sp.apply_filter("EMA", [], 10.0, 3, 0.5, 20.0) == pytest.approx(15.0)
    assert sp.apply_filter("NONE", [1, 2], 9.0, 3) == 9.0
    with pytest.raises(ValueError):
        sp.apply_filter("BOGUS", [], 1.0)


def test_measurement_specific_thresholds_differ():
    # the SAME relative wobble (a 3%-of-span step every reading) is a sudden change for smooth pressure but not for a fast LDR
    def wobble(lo, hi):
        mid, step = (lo + hi) / 2, 0.03 * (hi - lo)
        return [mid + (step if i % 2 else 0.0) for i in range(30)]
    p = analyze(wobble(900, 1100), "PRESSURE", ai=False)
    l = analyze(wobble(0, 1000), "LIGHT", ai=False)
    assert p["variation"]["sudden_changes"] > 0 and l["variation"]["sudden_changes"] == 0
    assert p["measurement"]["profile"] == "PRESSURE" and l["measurement"]["profile"] == "LIGHT"
    assert p["variation"]["sudden_step_threshold"] != l["variation"]["sudden_step_threshold"]


def test_cv_only_where_meaningful_and_per_type_kinds():
    assert analyze(noisy(30, 24.0, 0.1))["statistics"]["coefficient_of_variation_pct"] is None            # degC: interval scale
    assert analyze(noisy(30, 55.0, 0.3), "HUMIDITY")["statistics"]["coefficient_of_variation_pct"] > 0
    assert analyze(noisy(30, 120.0, 0.4), "DISTANCE")["measurement"]["kind"] == "continuous"
    assert analyze(noisy(30, 120.0, 0.4), "DISTANCE")["statistics"]["cv_note"] is None
    assert analyze([0.0, 1.0] * 15, "MOTION")["measurement"]["kind"] == "binary"


def test_state_sensor_uses_states_not_mean_std():
    live = analyze([0, 0, 1, 1, 0, 0, 0, 1, 0, 0] * 3, "MOTION", ai=False)
    s = live["states"]
    assert s["state_changed"] and s["transitions"] > 0 and s["count_0"] + s["count_1"] == 30 and 0 < s["duty_cycle_pct"] < 100
    assert "stability" not in live["quality"]["components"] and "domain_validity" in live["quality"]["components"]
    assert live["quality"]["status"] == "HEALTHY"
    quiet = analyze([0.0] * 30, "MOTION", ai=False)                                   # never changes: cannot be verified
    assert "NO_STATE_CHANGE_OBSERVED" in quiet["quality"]["cautions"] and quiet["quality"]["status"] == "SUSPECT"
    assert quiet["quality"]["score"] <= la.NO_CHANGE_CAP and any("Trigger it" in x for x in quiet["quality"]["limitations"])
    assert quiet["frozen"]["suspected"] is False
    bad = analyze([0, 1, 2, 0, 1, 3] * 5, "MOTION", ai=False)                         # not valid states
    assert bad["quality"]["components"]["domain_validity"] < 100


def test_invalid_events_and_communication_failures_lower_the_score():
    raw = noisy(30, 24.0, 0.1)
    clean = analyze(raw, ai=False)
    dirty = analyze(raw, ai=False, invalid={"total": 12, "communication": 8, "sensor_side": 4}, arrivals=30)
    assert dirty["quality"]["score"] < clean["quality"]["score"]
    assert dirty["communication"]["reliability_pct"] == pytest.approx(100 * 30 / 38)
    vr = next(f for f in dirty["quality"]["factors"] if f["key"] == "valid_rate")["value"]
    assert vr == pytest.approx(100 * 30 / 42)


def test_ai_evidence_is_used_when_present_and_excluded_when_absent():
    raw = noisy(30, 24.0, 0.1)
    none = analyze(raw)
    f = {x["key"]: x for x in none["quality"]["factors"]}
    assert f["ai_cleanliness"]["available"] is False and none["ai"]["available"] is False
    assert any("excluded, not assumed good" in x for x in none["quality"]["limitations"])
    flagged = analyze(raw, ai=True)
    assert flagged["ai"]["anomalies"] == 30 and flagged["quality"]["score"] < analyze(raw, ai=False)["quality"]["score"] - 10


def test_baseline_history_and_drift():
    first = analyze(noisy(30, 24.0, 0.1, seed=2), ai=False)
    same = analyze(noisy(30, 24.0, 0.1, seed=3), ai=False, prev=first["baseline"])
    moved = analyze(noisy(30, 27.0, 0.1, seed=4), ai=False, prev=first["baseline"])
    assert same["quality"]["consistency_basis"] == "PREVIOUS_BASELINE" and moved["behaviour"]["previous_baseline"]["shift"] == pytest.approx(3.0, abs=0.2)
    assert moved["quality"]["components"]["consistency"] < same["quality"]["components"]["consistency"] - 50
    drifting = analyze([22.0 + 0.1 * i for i in range(30)], ai=False)
    assert drifting["behaviour"]["trend_per_minute"] == pytest.approx(0.6, abs=0.01) and "LARGE_DRIFT" in drifting["quality"]["cautions"]


def test_insufficient_data_is_unavailable_not_invented():
    res = analyze([24.0, 24.1, 23.9])
    assert res["quality"]["score"] is None and res["quality"]["status"] == "INSUFFICIENT_DATA"
    assert res["recommended_status"]["status"] == "SUSPECT"


def test_quality_and_trust_are_separate_and_recommendation_uses_both():
    raw = noisy(30, 24.0, 0.1)
    good = analyze(raw, ai=False, trust={"score": 100.0, "sensor_state": "HEALTHY"})
    faulty_now = analyze(raw, ai=False, trust={"score": 20.0, "sensor_state": "FAULT"})
    assert good["quality"]["score"] == faulty_now["quality"]["score"]                    # trust never changes the quality score
    assert good["recommended_status"]["status"] == "HEALTHY" and faulty_now["recommended_status"]["status"] == "UNRELIABLE"
    assert faulty_now["trust"]["score"] == 20.0 and "separate from the quality score" in faulty_now["trust"]["note"]


def test_formula_is_versioned_and_documented():
    q = analyze(noisy(30, 24.0, 0.1))["quality"]
    assert q["formula_version"] == "quality-v2" == q["formula"]["version"] == la.FORMULA_VERSION
    assert sum(q["formula"]["weights"].values()) == 100
    assert sum(la.WEIGHTS["binary"].values()) == 100
    assert q["score_type"] == "BEHAVIOUR_QUALITY" and "not verified" in q["label"]
    assert all(f["description"] for f in q["factors"])


def test_works_for_every_measurement_type_without_mixing():
    for stype, base, sd in [("TEMPERATURE", 24, .1), ("HUMIDITY", 55, .3), ("LIGHT", 400, 6), ("PRESSURE", 1010, .1),
                            ("DISTANCE", 120, .4), ("ALTITUDE", 560, .5)]:
        r = analyze(noisy(30, base, sd), stype, ai=False)
        assert r["measurement"]["unit"] == SENSORS[stype]["unit"] and r["quality"]["status"] in ("HEALTHY", "SUSPECT"), (stype, r["quality"]["score"], r["quality"]["cautions"])
        assert 0 <= r["quality"]["score"] <= 100
