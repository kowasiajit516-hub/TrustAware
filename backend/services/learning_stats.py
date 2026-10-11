"""
services/learning_stats.py
---------------------------
PURE statistics (no DB) for the learning baseline and the sensor quality score.
Every number comes from the sensor's own collected readings; nothing is hardcoded,
estimated or compared with an external reference.
"""
from __future__ import annotations

import math
import statistics
from datetime import datetime

# Baseline breach rule: a value breaches when its distance from the
# baseline mean exceeds BASELINE_K * max(std, floor). The floor
# (BASELINE_FLOOR_FRACTION of the sensor's normal span) stops a very
# quiet 5-minute baseline from flagging ordinary drift as a fault.
BASELINE_K = 6.0
BASELINE_FLOOR_FRACTION = 0.02


def compute_baseline(samples: list[tuple[datetime, float]]) -> dict:
    """samples: [(timestamp, calibrated_value)] for ALL valid readings."""
    if len(samples) < 2:
        raise ValueError("Need at least 2 valid readings to compute a baseline")
    samples = sorted(samples, key=lambda s: s[0])
    values = [v for _, v in samples]
    mean = statistics.fmean(values)
    std = statistics.stdev(values)
    mad = statistics.fmean(abs(v - mean) for v in values)

    rates, steps = [], []
    for (t0, v0), (t1, v1) in zip(samples, samples[1:]):
        dt = (t1 - t0).total_seconds()
        steps.append(abs(v1 - v0))
        if dt > 0:
            rates.append(abs(v1 - v0) / dt)

    return {
        "n": len(values),
        "mean": mean,
        "median": statistics.median(values),
        "min": min(values),
        "max": max(values),
        "std": std,
        "range": max(values) - min(values),
        "normal_variation": mad,  # mean absolute deviation from the mean
        "rate_of_change_per_s_mean": statistics.fmean(rates) if rates else 0.0,
        "rate_of_change_per_s_max": max(rates) if rates else 0.0,
        "max_step": max(steps) if steps else 0.0,
        "window_start": samples[0][0],
        "window_end": samples[-1][0],
    }


def baseline_check(value: float, baseline: dict, normal_min: float, normal_max: float) -> dict:
    span = normal_max - normal_min if normal_max > normal_min else 1.0
    scale = max(baseline["std"], BASELINE_FLOOR_FRACTION * span)
    z = abs(value - baseline["mean"]) / scale
    return {"baseline_z": z, "breach": z > BASELINE_K}


# ---------------------------------------------------------------------
# SENSOR ACCURACY / QUALITY SCORE  (behaviour of the user-selected number of
# valid readings; no external reference is used anywhere).
# Computed once, from ALL valid readings of a completed learning session.
# Five 0-100 components, weighted. Every component comes from the data;
# the constants below only define the scales/weights and are documented.
# ---------------------------------------------------------------------
QUALITY_LABEL = "SENSOR ACCURACY / QUALITY SCORE (from the sensor's own collected readings)"
QUALITY_WEIGHTS = {"valid_pct": 25, "stability": 25, "smoothness": 20, "consistency": 20, "in_range": 10}
HEALTHY_MIN = 85.0
WARNING_MIN = 60.0
STABILITY_ZERO_FRACTION = 0.05   # std of 5% of the normal span (or more) => stability 0
SUDDEN_K = 5.0                   # a step is "sudden" if > 5 x robust sigma ...
SUDDEN_MIN_FRACTION = 0.02       # ... and at least 2% of the normal span
SUDDEN_MAX_FRACTION = 0.10       # ... but never more than 10% of it, so a very noisy sensor cannot excuse itself
STEP_ZERO_FRACTION = 0.10        # mean reading-to-reading change of 10% of the span (or more) => step score 0
CONSISTENCY_K = 3.0              # inside centre +/- 3 x scale counts as consistent
CONSISTENCY_MAX_SCALE_FRACTION = 0.05  # scale capped at 5% of the span (band <= 15%) for the same reason


def compute_quality(values: list[float], valid_count: int, invalid_count: int,
                    normal_min: float, normal_max: float, prev_baseline: dict | None = None) -> dict:
    """values: the chronological calibrated values of ALL valid readings in the session."""
    n = len(values)
    if n < 2:
        raise ValueError("Need at least 2 readings to score")
    span = normal_max - normal_min if normal_max > normal_min else 1.0
    floor = BASELINE_FLOOR_FRACTION * span

    mean = statistics.fmean(values)
    median = statistics.median(values)
    std = statistics.stdev(values)
    robust_sigma = 1.4826 * statistics.median(abs(v - median) for v in values)

    stability = 100.0 * max(0.0, 1.0 - std / (STABILITY_ZERO_FRACTION * span))

    steps = [abs(b - a) for a, b in zip(values, values[1:])]
    threshold = min(max(SUDDEN_K * robust_sigma, SUDDEN_MIN_FRACTION * span), SUDDEN_MAX_FRACTION * span)
    sudden = sum(1 for s in steps if s > threshold)
    sudden_part = 100.0 * (1.0 - sudden / len(steps))
    mean_step = statistics.fmean(steps)
    step_part = 100.0 * max(0.0, 1.0 - mean_step / (STEP_ZERO_FRACTION * span))
    smoothness = 0.5 * sudden_part + 0.5 * step_part   # sudden jumps AND typical reading-to-reading change

    cap = CONSISTENCY_MAX_SCALE_FRACTION * span
    if prev_baseline:
        basis, centre, scale = "PREVIOUS_BASELINE", prev_baseline["mean"], min(max(prev_baseline["std"], floor), cap)
    else:
        basis, centre, scale = "OWN_DATASET", median, min(max(robust_sigma, floor), cap)
    consistent = sum(1 for v in values if abs(v - centre) <= CONSISTENCY_K * scale)
    consistency = 100.0 * consistent / n

    in_range = 100.0 * sum(1 for v in values if normal_min <= v <= normal_max) / n
    attempts = valid_count + invalid_count
    valid_pct = 100.0 * valid_count / attempts if attempts else 0.0

    components = {"valid_pct": valid_pct, "stability": stability, "smoothness": smoothness,
                  "consistency": consistency, "in_range": in_range}
    total_w = sum(QUALITY_WEIGHTS.values())
    score = sum(components[k] * w for k, w in QUALITY_WEIGHTS.items()) / total_w
    status = "HEALTHY" if score >= HEALTHY_MIN else "WARNING" if score >= WARNING_MIN else "UNRELIABLE"

    return {
        "label": QUALITY_LABEL, "score": score, "status": status,
        "samples": n, "valid_readings": valid_count, "invalid_events": invalid_count,
        "average": mean, "median": median, "minimum": min(values), "maximum": max(values),
        "std_dev": std, "variance": statistics.variance(values), "variation_range": max(values) - min(values),
        "mean_abs_step": mean_step, "step_std": statistics.stdev(steps) if len(steps) > 1 else 0.0,
        "max_step": max(steps),
        "variation_cv_pct": None if mean == 0 else std / abs(mean) * 100.0,
        "stability": stability, "sudden_changes": sudden, "sudden_step_threshold": threshold,
        "consistency_basis": basis, "components": components, "weights": QUALITY_WEIGHTS,
        "thresholds": {"healthy_min": HEALTHY_MIN, "warning_min": WARNING_MIN},
    }
