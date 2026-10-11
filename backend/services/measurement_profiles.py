"""
services/measurement_profiles.py
---------------------------------
Measurement-specific analysis rules. A temperature probe, an LDR, a PIR, an HC-SR04 and a BMP280 do not
behave alike, so the quality analysis does not use one set of thresholds for all of them.

Everything is DATA (this table), keyed by the generic `sensor_type` - there is no per-sensor-id logic, and an unknown
or CUSTOM type falls back to the GENERIC profile (and says so in the result's limitations).

Fractions are fractions of the sensor's own normal span (normal_max - normal_min), so they scale with the unit.
  sudden:      (lo, hi)  a reading-to-reading step counts as a "sudden change" when it exceeds
                         clamp(5 x robust sigma, lo x span, hi x span)
  stab_zero:   std of this fraction of the span (or more) gives a stability factor of 0
  frozen_run:  share of consecutive IDENTICAL raw readings that makes a frozen sensor suspected
               (slow, coarse-resolution quantities may legitimately repeat; noisy ADC-style ones should not)
  cv:          coefficient of variation is only meaningful for ratio-scale quantities (not degC, not altitude)
"""
from __future__ import annotations

GENERIC = {"kind": "continuous", "sudden": (0.02, 0.10), "stab_zero": 0.05, "frozen_run": 0.80, "cv": True,
           "note": "Generic continuous profile (no measurement-specific rules for this type)."}

PROFILES: dict[str, dict] = {
    "TEMPERATURE": {"kind": "continuous", "sudden": (0.02, 0.08), "stab_zero": 0.05, "frozen_run": 0.90, "cv": False,
                    "note": "Slow thermal dynamics; coarse (e.g. 0.1 degC) resolution can repeat values; CV not meaningful for degC."},
    "HUMIDITY": {"kind": "continuous", "sudden": (0.03, 0.10), "stab_zero": 0.08, "frozen_run": 0.90, "cv": True,
                 "note": "Slow, coarse resolution; legitimate repeats are common."},
    "LIGHT": {"kind": "continuous", "sudden": (0.05, 0.40), "stab_zero": 0.30, "frozen_run": 0.60, "cv": True,
              "note": "Light can change quickly (shadows, switching) and an ADC-based LDR is noisy, so identical repeats are suspicious."},
    "PRESSURE": {"kind": "continuous", "sudden": (0.002, 0.02), "stab_zero": 0.01, "frozen_run": 0.60, "cv": True,
                 "note": "Barometric pressure is very smooth; small steps are already notable; sensor noise is always present."},
    "ALTITUDE": {"kind": "continuous", "sudden": (0.005, 0.05), "stab_zero": 0.03, "frozen_run": 0.60, "cv": False,
                 "note": "Derived from pressure, so it inherits its smoothness and noise; CV not meaningful."},
    "DISTANCE": {"kind": "continuous", "sudden": (0.02, 0.15), "stab_zero": 0.10, "frozen_run": 0.60, "cv": True,
                 "note": "Ultrasonic distance jitters by millimetres even on a static target; moving objects cause real jumps."},
    "GAS": {"kind": "continuous", "sudden": (0.03, 0.25), "stab_zero": 0.20, "frozen_run": 0.60, "cv": True,
            "note": "Gas sensors drift and are noisy; step changes happen with real events."},
    "AIR_QUALITY": {"kind": "continuous", "sudden": (0.03, 0.25), "stab_zero": 0.20, "frozen_run": 0.60, "cv": True,
                    "note": "As GAS."},
    "SMOKE": {"kind": "continuous", "sudden": (0.03, 0.30), "stab_zero": 0.20, "frozen_run": 0.60, "cv": True, "note": "As GAS."},
    "SOIL_MOISTURE": {"kind": "continuous", "sudden": (0.01, 0.10), "stab_zero": 0.10, "frozen_run": 0.90, "cv": True,
                      "note": "Very slow quantity."},
    "WATER_LEVEL": {"kind": "continuous", "sudden": (0.01, 0.10), "stab_zero": 0.05, "frozen_run": 0.90, "cv": True,
                    "note": "Slow quantity."},
    "VIBRATION": {"kind": "continuous", "sudden": (0.10, 0.60), "stab_zero": 0.50, "frozen_run": 0.60, "cv": True,
                  "note": "Inherently fluctuating."},
    "CURRENT": {"kind": "continuous", "sudden": (0.05, 0.40), "stab_zero": 0.25, "frozen_run": 0.60, "cv": True,
                "note": "Load changes cause legitimate steps."},
    "VOLTAGE": {"kind": "continuous", "sudden": (0.01, 0.10), "stab_zero": 0.03, "frozen_run": 0.80, "cv": True,
                "note": "Normally steady."},
    "MOTION": {"kind": "binary", "sudden": (0.0, 0.0), "stab_zero": 0.0, "frozen_run": 1.0, "cv": False,
               "note": "State sensor (0/1): analysed by state counts, transitions and duty cycle, not by mean/std."},
}


def profile_for(sensor_type: str | None, values: list[float] | None = None) -> dict:
    t = (sensor_type or "CUSTOM").upper()
    if t in PROFILES:
        prof = dict(PROFILES[t]); prof["name"] = t; prof["generic"] = False
        return prof
    prof = dict(GENERIC); prof["name"] = "GENERIC"; prof["generic"] = True
    # An unknown/custom sensor that only ever reports 0 and 1 is treated as a state sensor.
    if t == "CUSTOM" and values and set(values) <= {0.0, 1.0}:
        prof.update(PROFILES["MOTION"]); prof["name"] = "BINARY(custom)"; prof["generic"] = True
    return prof
