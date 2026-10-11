// Helpers that turn a backend sensor object into display rows, whatever shape it arrives in:
//   * individual fields:        { sensor_id, sensor_type, trusted_value, raw_value, ... }
//   * a `measurements` object:  { measurements: { temperature: {trusted_value, ...}, humidity: 51.2 } }
//   * a `measurements` array:   { measurements: [ { key: "temperature", ... } ] }
// Nothing is invented: a measurement that the backend did not return stays null and is shown as missing.

const FIELDS = ["raw_value", "calibrated_value", "filtered_value", "trusted_value"];

export function sourceLabel(s) {
  if (!s) return null;
  return s === "RAW" ? "REAL" : s;
}

export function fmt(v, d = 2) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (Number.isNaN(n)) return String(v);
  return Number.isInteger(n) ? String(n) : n.toFixed(d);
}

function asRow(parent, key, m) {
  const obj = m !== null && typeof m === "object" ? m : { raw_value: m, trusted_value: m };
  return {
    ...parent,
    ...obj,
    key,
    label: obj.label || (key ? key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : parent.label),
    unit: obj.unit ?? parent.unit,
    source: sourceLabel(obj.source ?? parent.source),
  };
}

// All measurement rows of one sensor object (>= 1 row, never 0: a sensor is never hidden).
export function measurementsOf(sensor) {
  const m = sensor?.measurements;
  if (Array.isArray(m) && m.length) return m.map((x, i) => asRow(sensor, x.key || x.type || String(i), x));
  if (m && typeof m === "object" && Object.keys(m).length) {
    return Object.entries(m).map(([k, v]) => asRow(sensor, k, v));
  }
  return [asRow(sensor, (sensor?.sensor_type || "value").toLowerCase(), {})];
}

export function hasAnyValue(row) {
  return FIELDS.some((f) => row[f] !== null && row[f] !== undefined);
}

// Accepts { sensors, devices } (current API) or a plain array of sensors (older/other shapes).
export function normalizeDashboard(resp) {
  if (!resp) return null;
  if (Array.isArray(resp)) {
    const devices = resp.map((s) => ({
      device_id: s.device_group || s.sensor_id, name: s.device_group || s.name || s.sensor_id,
      model: s.device_model, grouped: !!s.device_group, location: s.location, node_id: s.node_id,
      sensors: [s], state: s.sensor_state || s.status, last_update: s.last_update, measurements: 1,
    }));
    return { sensors: resp, devices, counts: { sensors: resp.length, devices: devices.length } };
  }
  return { ...resp, sensors: resp.sensors || [], devices: resp.devices || [] };
}

export const STATE_TONE = { HEALTHY: "green", WARNING: "amber", RECOVERING: "amber", FAULT: "red", OFFLINE: "grey" };
export const DATA_TONE = { LIVE: "green", STALE: "amber", NO_DATA: "grey", DISABLED: "grey", ERROR: "red" };
export const SOURCE_TONE = { REAL: "green", VIRTUAL: "amber", REDUNDANT: "cyan", UNAVAILABLE: "red" };
export const RECOVERY_TONE = { NORMAL: "grey", FAULT: "red", VERIFYING: "amber", RECOVERED: "green" };

export function ago(iso, nowMs) {
  if (!iso) return "never";
  const s = Math.max(0, Math.round((nowMs - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s ago`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m ago`;
}
