import {
  getSensorDashboard, listSensors, listSensorHealth, listPredictions, listTrustedReadings, listReadings,
  getSensorHealth, getLatestPrediction, getLatestTrustedReading, getLatestReading, getApiBase,
} from "../api/client.js";

// The same counts the backend returns, derived from the sensors we actually have.
export function computeCounts(sensors, devices) {
  const n = (f) => sensors.filter(f).length;
  return {
    sensors: sensors.length, enabled: n((v) => v.enabled !== false), devices: devices.length,
    live: n((v) => v.data_state === "LIVE"), stale: n((v) => v.data_state === "STALE"),
    no_data: n((v) => v.data_state === "NO_DATA"), disabled: n((v) => v.data_state === "DISABLED"),
    error: n((v) => v.data_state === "ERROR"),
    fault: n((v) => v.sensor_state === "FAULT"),
    virtual: n((v) => v.source === "VIRTUAL" || v.source === "REDUNDANT"),
    with_issue: n((v) => !!v.measurement_issue),
  };
}

const first = (list, key = "sensor_id") => {
  const m = {};
  (Array.isArray(list) ? list : []).forEach((x) => { if (x && !(x[key] in m)) m[x[key]] = x; });   // lists are newest first
  return m;
};
const settledValue = (r) => (r.status === "fulfilled" ? r.value : null);
const LEGACY_STATE = { HEALTHY: "HEALTHY", RECOVERING: "RECOVERING", FAULTY: "FAULT", OFFLINE: "OFFLINE" };
const label = (t) => (t || "CUSTOM").replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

async function pool(items, size, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]); }
  }));
  return out;
}

// Builds the same shape as GET /dashboard/sensors from endpoints that already exist in older backends.
// Nothing is invented: a missing piece stays null, a sensor with no health record is "UNKNOWN" (not "healthy").
async function loadLegacy(reason) {
  const sensors = await listSensors();
  const [h, p, t, r] = await Promise.allSettled([
    listSensorHealth(500), listPredictions({ limit: 500 }), listTrustedReadings({ limit: 500 }), listReadings({ limit: 500 }),
  ]);
  const health = first(settledValue(h)), preds = first(settledValue(p)), trusted = first(settledValue(t)), reads = first(settledValue(r));

  // sensors that did not appear in the newest bulk results get their own "latest" lookup (404 = genuinely none)
  const missing = sensors.filter((s) => !(s.sensor_id in reads) || !(s.sensor_id in trusted) || !(s.sensor_id in preds) || !(s.sensor_id in health));
  await pool(missing, 4, async (s) => {
    const id = s.sensor_id;
    const [hh, pp, tt, rr] = await Promise.allSettled([
      id in health ? null : getSensorHealth(id), id in preds ? null : getLatestPrediction(id),
      id in trusted ? null : getLatestTrustedReading(id), id in reads ? null : getLatestReading(id),
    ]);
    if (settledValue(hh)) health[id] = settledValue(hh);
    if (settledValue(pp)) preds[id] = settledValue(pp);
    if (settledValue(tt)) trusted[id] = settledValue(tt);
    if (settledValue(rr)) reads[id] = settledValue(rr);
  });

  const now = Date.now();
  const views = sensors.map((s) => {
    const id = s.sensor_id, hl = health[id], pr = preds[id], tr = trusted[id], rd = reads[id];
    const stamps = [rd?.timestamp, tr?.timestamp].filter(Boolean).map((x) => new Date(x).getTime()).filter((x) => !Number.isNaN(x));
    const last = stamps.length ? Math.max(...stamps) : null;
    const age = last === null ? null : (now - last) / 1000;
    const staleAfter = Math.max(30, 3 * (s.sampling_interval_seconds || 5));
    const data_state = s.enabled === false ? "DISABLED" : last === null ? "NO_DATA" : age > staleAfter ? "STALE" : "LIVE";
    const source = tr ? (tr.source === "RAW" ? "REAL" : tr.source) : null;
    const available = tr ? tr.trusted_value !== null && tr.trusted_value !== undefined : null;
    let issue = null;
    if (data_state === "NO_DATA") issue = "No readings received yet";
    else if (data_state === "STALE") issue = `No new reading for ${Math.round(age)}s`;
    if (available === false) issue = issue || "Trusted value unavailable";
    return {
      sensor_id: id, name: s.name, sensor_type: s.sensor_type, label: label(s.sensor_type), unit: s.unit,
      location: s.location, node_id: s.node_id, enabled: s.enabled !== false, device_group: null, device_model: null,
      sensor_state: hl ? hl.sensor_state || LEGACY_STATE[hl.status] || null : "UNKNOWN", status: hl?.status ?? null,
      trust_score: hl?.trust_score ?? null, ai: pr ? (pr.is_fault ? "ANOMALY" : "NORMAL") : null, ai_reasons: pr?.fault_reasons || [],
      source, raw_value: rd?.value ?? tr?.raw_value ?? null, calibrated_value: tr?.calibrated_value ?? null,
      filtered_value: tr?.filtered_value ?? null, trusted_value: tr?.trusted_value ?? null, trusted_available: available,
      unavailable_reason: tr?.unavailable_reason ?? null, raw_isolated: tr ? source !== "REAL" : null,
      recovery_state: hl?.recovery_state ?? null,
      last_update: last === null ? null : new Date(last).toISOString(), age_seconds: age, data_state,
      measurement_issue: issue, faults: { recent_count: 0, window_seconds: 600, last: null }, learning: null,
    };
  });
  const devices = views.map((v) => ({
    device_id: v.sensor_id, name: v.name || v.sensor_id, model: null, grouped: false, node_id: v.node_id,
    location: v.location, sensors: [v], state: v.sensor_state, last_update: v.last_update, measurements: 1,
  }));
  return { generated_at: new Date().toISOString(), counts: computeCounts(views, devices), sensors: views, devices, mode: "limited", fallback_reason: reason };
}

// Preferred: ONE call to GET /dashboard/sensors. If that endpoint is missing (older backend still deployed) or crashes,
// fall back to the endpoints every backend version has - and say so, instead of showing nothing.
export async function loadDashboard() {
  try {
    const d = await getSensorDashboard();
    if (!d || typeof d !== "object" || !Array.isArray(d.sensors)) {
      throw Object.assign(new Error("Unexpected response from /dashboard/sensors"), { status: 502, detail: "Unexpected response shape from /dashboard/sensors (no 'sensors' list)" });
    }
    return { ...d, mode: "full" };
  } catch (primary) {
    if (primary?.status === 0 || primary?.status === 401 || primary?.status === 403) throw primary;   // cannot reach / not allowed: nothing else would work either
    const reason = primary?.detail || primary?.message || String(primary);
    try {
      return await loadLegacy(reason);
    } catch (secondary) {
      const e = new Error(`${reason} — and the fallback also failed: ${secondary?.detail || secondary?.message}`);
      e.status = primary?.status;
      e.detail = e.message;
      throw e;
    }
  }
}

// A readable explanation + what to do, for the error box.
export function explainError(err) {
  const base = getApiBase ? getApiBase() : "";
  const status = err?.status;
  const detail = err?.detail || err?.message || String(err);
  if (status === 0) return { title: "Cannot reach the backend", detail, hint: `Tried ${base || "the configured address"}. If the backend is on a free Render plan it may be waking up (up to a minute) — this page keeps retrying. Otherwise check VITE_API_BASE_URL and the backend's CORS_ORIGINS.` };
  if (status === 404) return { title: "The backend does not have this endpoint yet", detail, hint: "Deploy the latest backend (git push, then redeploy on Render)." };
  if (status >= 500) return { title: "The backend returned an error", detail, hint: "Open the backend logs (Render → Logs) and read the last traceback line." };
  return { title: "Could not load sensors", detail, hint: "" };
}
