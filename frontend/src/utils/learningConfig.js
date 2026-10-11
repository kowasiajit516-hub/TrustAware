// Validation + request-building for the learning-test form. Mirrors the backend limits
// (models/learning.py LearningStart) so a bad value is explained in the form instead of failing as a 422.

export const FILTER_METHODS = [
  ["MEDIAN", "Median (spike-resistant)"],
  ["MOVING_AVERAGE", "Moving average"],
  ["EMA", "Exponential moving average"],
  ["NONE", "None (filtered = calibrated)"],
];
export const PRESETS = [10, 20, 30, 50, 100];
export const MIN_READINGS_UI = 5; // the API accepts 2+, but fewer than 5 cannot produce a meaningful score
export const MAX_READINGS = 1000;

const num = (s) => (s === "" || s === null || s === undefined ? NaN : Number(s));

export function validateConfig(f) {
  const e = {};
  const target = f.preset === "custom" ? num(f.customTarget) : Number(f.preset);
  if (!Number.isInteger(target) || target < MIN_READINGS_UI || target > MAX_READINGS)
    e.target = `Enter a whole number of valid readings between ${MIN_READINGS_UI} and ${MAX_READINGS}.`;
  const interval = num(f.interval);
  if (!Number.isFinite(interval) || interval < 1 || interval > 3600) e.interval = "Interval must be between 1 and 3600 seconds.";
  const offset = num(f.offset);
  if (!Number.isFinite(offset)) e.offset = "Calibration offset must be a number (0 = none).";
  const gain = num(f.gain);
  if (!Number.isFinite(gain) || gain <= 0) e.gain = "Calibration gain must be a number greater than 0 (1 = none).";
  if (!FILTER_METHODS.some(([m]) => m === f.method)) e.method = "Choose a filter method.";
  if (f.method === "MEDIAN" || f.method === "MOVING_AVERAGE") {
    const w = num(f.window);
    if (!Number.isInteger(w) || w < 1 || w > 21) e.window = "Window must be a whole number from 1 to 21 readings.";
  }
  if (f.method === "EMA") {
    const a = num(f.alpha);
    if (!Number.isFinite(a) || a <= 0 || a > 1) e.alpha = "Alpha must be greater than 0 and at most 1.";
  }
  return { errors: e, valid: Object.keys(e).length === 0, target, interval };
}

// The body sent to POST /learning/{sensor_id}/start
export function buildStartBody(sensorId, f) {
  const { target, interval } = validateConfig(f);
  const body = {
    sensor_id: sensorId,
    target_valid_readings: target,
    interval_seconds: interval,
    calibration_offset: num(f.offset),
    calibration_gain: num(f.gain),
    filter_method: f.method,
  };
  if (f.method === "MEDIAN" || f.method === "MOVING_AVERAGE") body.filter_window = num(f.window);
  if (f.method === "EMA") body.filter_alpha = num(f.alpha);
  return body;
}

// Initial form values from the sensor's stored processing config (so the form shows what is really in use).
export function formFromProcessing(p, defaultInterval = 10) {
  return {
    preset: "30", customTarget: "40", interval: String(defaultInterval),
    offset: String(p?.calibration_offset ?? 0), gain: String(p?.calibration_gain ?? 1),
    method: p?.filter_method || "MEDIAN", window: String(p?.filter_window ?? 3), alpha: String(p?.filter_alpha ?? 0.3),
  };
}

// Turns a failed learning request into a message that says what is actually wrong and what to do.
// `health` is the result of GET /health ({ ok, data } or { ok:false, error }) fetched after the failure, when available.
export function explainLearningError(err, health, sensorId, apiBase) {
  const status = err?.status;
  const detail = err?.detail || err?.message || String(err);
  const routeMissing = /no endpoint/i.test(detail) || /^not found\b/i.test(detail.trim());
  if (status === 0) {
    return {
      title: "Cannot reach the backend", detail,
      hint: `Tried ${apiBase || "the configured address"}. A free Render instance can take up to a minute to wake up — this page keeps retrying. Otherwise check VITE_API_BASE_URL and the backend's CORS_ORIGINS.`,
    };
  }
  if (status === 404 && routeMissing) {
    const upAndOld = health?.ok && !health.data?.features?.learning;
    return {
      title: upAndOld ? "The deployed backend is an older version without the learning API" : "The learning endpoint is not available on the backend",
      detail,
      hint: health?.ok
        ? "The server is running, but it does not serve /learning/… — the latest backend has not been deployed (or its deploy failed to start, so Render kept the old version)."
        : "The server did not answer /health either, so the deploy may have failed to start.",
      steps: [
        "Copy the latest backend files into your project (services/learning_*.py, services/measurement_profiles.py, routes/learning.py, models/learning.py, main.py, …).",
        "Run  python check_backend.py  in the backend folder — it lists any missing file or import error.",
        "git add . && git commit -m \"learning API\" && git push",
        "Render → your backend service → Logs: confirm the deploy finished without a traceback.",
        `Check the server:  python check_backend.py ${apiBase || "https://YOUR-BACKEND.onrender.com"}`,
      ],
    };
  }
  if (status === 404) {
    return { title: `Sensor ${sensorId || ""} is not known to the backend`, detail, hint: "The backend answered, so the learning API is deployed — but it has no sensor with this ID. Check the Sensors page." };
  }
  if (status >= 500) return { title: "The backend returned an error", detail, hint: "Open the backend logs (Render → Logs) and read the last traceback line." };
  return { title: "Could not load this sensor's learning data", detail, hint: "" };
}
