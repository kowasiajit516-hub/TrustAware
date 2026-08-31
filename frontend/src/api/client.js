/**
 * api/client.js
 * --------------
 * Thin fetch wrapper around the real FastAPI backend (Phases 1-7).
 *
 * IMPORTANT: this file only calls endpoints that actually exist in
 * backend/routes/. It does not invent endpoints for features the
 * backend doesn't support yet (automation-rule EVALUATION and
 * actuator driving are Phase 9; there is no fault-injection HTTP
 * endpoint - fault injection is a simulator CLI flag, see
 * simulator/simulator.py --fault-rate).
 */

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

class ApiError extends Error {
  constructor(message, status, detail) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

async function request(path, { method = "GET", body, params } = {}) {
  let url = `${BASE_URL}${path}`;
  if (params) {
    const search = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") search.set(k, v);
    });
    const qs = search.toString();
    if (qs) url += `?${qs}`;
  }

  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return null;

  let data = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    const detail = (data && data.detail) || res.statusText;
    throw new ApiError(`${method} ${path} failed: ${detail}`, res.status, detail);
  }
  return data;
}

// ---------------------------------------------------------------
// Health
// ---------------------------------------------------------------
export const getHealth = () => request("/health");

// ---------------------------------------------------------------
// Sensors
// ---------------------------------------------------------------
export const listSensors = (params) => request("/sensors", { params });
export const getSensor = (sensorId) => request(`/sensors/${sensorId}`);
export const createSensor = (payload) => request("/sensors", { method: "POST", body: payload });
export const updateSensor = (sensorId, payload) =>
  request(`/sensors/${sensorId}`, { method: "PUT", body: payload });
export const deleteSensor = (sensorId) => request(`/sensors/${sensorId}`, { method: "DELETE" });
export const enableSensor = (sensorId) => request(`/sensors/${sensorId}/enable`, { method: "PATCH" });
export const disableSensor = (sensorId) => request(`/sensors/${sensorId}/disable`, { method: "PATCH" });

// ---------------------------------------------------------------
// Actuators
// ---------------------------------------------------------------
export const listActuators = (params) => request("/actuators", { params });
export const getActuator = (actuatorId) => request(`/actuators/${actuatorId}`);
export const createActuator = (payload) => request("/actuators", { method: "POST", body: payload });
export const updateActuator = (actuatorId, payload) =>
  request(`/actuators/${actuatorId}`, { method: "PUT", body: payload });
export const deleteActuator = (actuatorId) => request(`/actuators/${actuatorId}`, { method: "DELETE" });
export const enableActuator = (actuatorId) => request(`/actuators/${actuatorId}/enable`, { method: "PATCH" });
export const disableActuator = (actuatorId) => request(`/actuators/${actuatorId}/disable`, { method: "PATCH" });
export const commandActuator = (actuatorId, command) =>
  request(`/actuators/${actuatorId}/command`, { method: "POST", body: { command } });

// ---------------------------------------------------------------
// Auth (Phase 7 addition)
// ---------------------------------------------------------------
export const registerAccount = (payload) => request("/auth/register", { method: "POST", body: payload });
export const login = (payload) => request("/auth/login", { method: "POST", body: payload });
export const forgotPassword = (payload) => request("/auth/forgot-password", { method: "POST", body: payload });
export const resetPassword = (payload) => request("/auth/reset-password", { method: "POST", body: payload });
export const getMe = (token) =>
  fetch(`${BASE_URL}/auth/me`, { headers: { Authorization: `Bearer ${token}` } }).then(async (res) => {
    if (!res.ok) throw new ApiError("Unauthorized", res.status);
    return res.json();
  });

// ---------------------------------------------------------------
// Fault injection (Phase 7 addition - real endpoint, real pipeline)
// ---------------------------------------------------------------
export const injectFault = (sensorId, faultType, offset) =>
  request(`/fault-injection/${sensorId}`, {
    method: "POST",
    body: { fault_type: faultType, offset: offset ?? null },
  });

// ---------------------------------------------------------------
// Actuator events (Phase 7 addition - read-only)
// ---------------------------------------------------------------
export const listActuatorEvents = (params) => request("/actuator-events", { params });
export const getLatestActuatorEvent = (actuatorId) =>
  request(`/actuator-events/${actuatorId}/latest`);

// ---------------------------------------------------------------
// Nodes
// ---------------------------------------------------------------
export const listNodes = (params) => request("/nodes", { params });
export const getNode = (nodeId) => request(`/nodes/${nodeId}`);
export const createNode = (payload) => request("/nodes", { method: "POST", body: payload });
export const updateNode = (nodeId, payload) => request(`/nodes/${nodeId}`, { method: "PUT", body: payload });
export const deleteNode = (nodeId) => request(`/nodes/${nodeId}`, { method: "DELETE" });

// ---------------------------------------------------------------
// Automation rules (CRUD only - evaluation engine is Phase 9)
// ---------------------------------------------------------------
export const listRules = (params) => request("/automation-rules", { params });
export const getRule = (ruleId) => request(`/automation-rules/${ruleId}`);
export const createRule = (payload) => request("/automation-rules", { method: "POST", body: payload });
export const updateRule = (ruleId, payload) =>
  request(`/automation-rules/${ruleId}`, { method: "PUT", body: payload });
export const deleteRule = (ruleId) => request(`/automation-rules/${ruleId}`, { method: "DELETE" });

// ---------------------------------------------------------------
// Readings (raw)
// ---------------------------------------------------------------
export const listReadings = (params) => request("/readings", { params });
export const getLatestReading = (sensorId) => request(`/readings/${sensorId}/latest`);

// ---------------------------------------------------------------
// Predictions (Isolation Forest - Phase 3)
// ---------------------------------------------------------------
export const listPredictions = (params) => request("/predictions", { params });
export const getLatestPrediction = (sensorId) => request(`/predictions/${sensorId}/latest`);

// ---------------------------------------------------------------
// Sensor health (dynamic trust score - Phase 4)
// ---------------------------------------------------------------
export const listSensorHealth = (limit) => request("/sensor-health", { params: { limit } });
export const getSensorHealth = (sensorId) => request(`/sensor-health/${sensorId}`);

// ---------------------------------------------------------------
// Trusted readings (virtual sensing - Phase 5)
// ---------------------------------------------------------------
export const listTrustedReadings = (params) => request("/trusted-readings", { params });
export const getLatestTrustedReading = (sensorId) => request(`/trusted-readings/${sensorId}/latest`);

// ---------------------------------------------------------------
// Fault events (self-healing transitions - Phase 6)
// ---------------------------------------------------------------
export const listFaultEvents = (params) => request("/fault-events", { params });
export const getLatestFaultEvent = (sensorId) => request(`/fault-events/${sensorId}/latest`);

export { ApiError };
