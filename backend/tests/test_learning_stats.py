"""Pure unit tests (no MongoDB): baseline statistics, quality score, signal processing."""
import math
import statistics
from datetime import datetime, timedelta, timezone

import pytest

from services import learning_stats as st
from services import signal_processing as sp

T0 = datetime(2026, 1, 1, tzinfo=timezone.utc)


def _samples(vals, step=10):
    return [(T0 + timedelta(seconds=step * i), v) for i, v in enumerate(vals)]


def test_baseline_matches_independent_statistics():
    vals = [24.0, 24.2, 23.9, 24.1, 24.3, 23.8, 24.0, 24.4]
    b = st.compute_baseline(_samples(vals))
    assert b["n"] == 8
    assert b["mean"] == pytest.approx(statistics.fmean(vals))
    assert b["median"] == pytest.approx(statistics.median(vals))
    assert b["std"] == pytest.approx(statistics.stdev(vals))
    assert (b["min"], b["max"]) == (23.8, 24.4)
    # rate of change: |dv| / 10 s, averaged
    expected = statistics.fmean(abs(b2 - a) / 10 for a, b2 in zip(vals, vals[1:]))
    assert b["rate_of_change_per_s_mean"] == pytest.approx(expected)


def test_baseline_needs_two_readings():
    with pytest.raises(ValueError):
        st.compute_baseline(_samples([1.0]))


def test_baseline_check_flags_large_shift_only():
    b = st.compute_baseline(_samples([24.0, 24.1, 23.9, 24.0, 24.2, 23.8]))
    assert not st.baseline_check(24.3, b, 15, 40)["breach"]
    assert st.baseline_check(35.0, b, 15, 40)["breach"]


def test_calibration_and_causal_median():
    assert sp.calibrate(10.0, offset=1.5, gain=2.0) == 21.5
    assert sp.causal_median([20, 20, 20], 90.0, 3) == 20  # filter smooths, raw is kept elsewhere
    assert sp.causal_median([], 5.0, 3) == 5.0
    assert sp.causal_median([1, 2, 3], 9.0, 1) == 9.0


def test_validation_categories():
    now = T0
    ok = lambda **k: sp.validate_value(**{"raw": 25.0, "calibrated": 25.0, "valid_min": -40, "valid_max": 80,
                                          "reading_ts": now, "now": now, "stale_after_seconds": 30, **k})
    assert ok() is None
    assert ok(raw=math.nan, calibrated=math.nan)[0] == sp.INVALID_VALUE
    assert ok(calibrated=120.0)[0] == sp.OUT_OF_RANGE
    assert ok(calibrated=-50.0)[0] == sp.OUT_OF_RANGE
    assert ok(reading_ts=now - timedelta(seconds=120))[0] == sp.STALE_READING
    assert ok(valid_min=None, valid_max=None, calibrated=9999.0) is None  # no limits configured -> no range rejection


# ---- 30-reading quality score ----
def _q(vals, invalid=0, **kw):
    return st.compute_quality(vals, len(vals), invalid, 15.0, 40.0, **kw)


def test_quality_good_sensor_is_healthy():
    vals = [24.0 + 0.1 * ((i * 7) % 5 - 2) for i in range(30)]
    q = _q(vals)
    assert q["samples"] == 30 and q["status"] == "HEALTHY" and q["score"] > 85
    assert q["average"] == pytest.approx(statistics.fmean(vals))
    assert q["std_dev"] == pytest.approx(statistics.stdev(vals))


def test_quality_depends_on_all_readings_and_behaviour():
    good = [24.0 + 0.05 * (i % 3) for i in range(30)]
    spiky = list(good); spiky[10] = 39.0; spiky[20] = 16.0
    noisy = [24.0 + (6.0 if i % 2 else -6.0) for i in range(30)]
    qg, qs, qn = _q(good), _q(spiky), _q(noisy)
    assert qg["score"] > qs["score"] > qn["score"]
    assert qs["sudden_changes"] >= 3 and qn["status"] == "UNRELIABLE"
    assert _q(good, invalid=15)["score"] < qg["score"]          # invalid events lower it
    assert _q(good)["score"] != _q(good[:-1] + [30.0])["score"]  # a single reading changes the result


def test_quality_uses_previous_baseline_when_given():
    vals = [24.0] * 15 + [24.1] * 15
    prev = {"mean": 30.0, "std": 0.1}
    assert _q(vals, prev_baseline=prev)["components"]["consistency"] == 0.0
    assert _q(vals)["consistency_basis"] == "OWN_DATASET"


def test_quality_reports_all_required_statistics():
    vals = [24.0 + 0.1 * ((i * 7) % 5 - 2) for i in range(50)]
    q = _q(vals)
    assert q["samples"] == 50
    assert q["variance"] == pytest.approx(statistics.variance(vals))
    assert q["variation_range"] == pytest.approx(max(vals) - min(vals))
    assert q["variation_cv_pct"] == pytest.approx(statistics.stdev(vals) / statistics.fmean(vals) * 100)
    steps = [abs(b - a) for a, b in zip(vals, vals[1:])]
    assert q["mean_abs_step"] == pytest.approx(statistics.fmean(steps))
    assert q["max_step"] == pytest.approx(max(steps))
    assert set(q["components"]) == {"valid_pct", "stability", "smoothness", "consistency", "in_range"}


def test_reading_to_reading_variation_lowers_the_score():
    calm = [24.0 + 0.02 * (i % 3) for i in range(40)]
    jittery = [24.0 + (1.2 if i % 2 else -1.2) for i in range(40)]   # same centre, big step every reading
    assert _q(jittery)["components"]["smoothness"] < _q(calm)["components"]["smoothness"]
    assert _q(jittery)["score"] < _q(calm)["score"]


def test_quality_works_for_any_sensor_scale():
    # distance (cm), pressure (hPa) and a 0/1 motion sensor all produce a valid 0-100 score
    for lo, hi, base in [(2, 400, 120.0), (900, 1100, 1010.0), (0, 1, 0.0)]:
        vals = [base + (hi - lo) * 0.001 * ((i * 3) % 4) for i in range(30)]
        q = st.compute_quality(vals, 30, 0, float(lo), float(hi))
        assert 0 <= q["score"] <= 100 and q["status"] in ("HEALTHY", "WARNING", "UNRELIABLE")
