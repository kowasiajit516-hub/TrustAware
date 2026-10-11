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

// Set VITE_API_BASE_URL in frontend/.env (e.g. http://192.168.0.107:8000).
// If it is not set, fall back to the SAME HOST that served this page on port
// 8000 - so opening http://<PC-IP>:5173 on a phone talks to the PC's backend
// instead of "localhost", which on a phone would mean the phone itself.
// The address of the FastAPI backend. Common .env mistakes are repaired instead of
// failing mysteriously:
//   VITE_API_BASE_URL=VITE_API_BASE_URL=http://...  (variable name pasted twice)
//   VITE_API_BASE_URL=192.168.0.100:8000            (missing http://)
//   quotes / spaces / trailing "/"  ("http://host:8000/" + "/auth/login" would
//   request "//auth/login", which FastAPI answers with 404 Not Found)
function normalizeBase(raw) {
  let v = String(raw || "")
    .trim()
    .replace(/^(VITE_API_BASE_URL\s*=\s*)+/i, "")
    .replace(/^["']|["']$/g, "")
    .trim();
  if (v && !v.startsWith("/") && !/^https?:\/\//i.test(v)) v = `http://${v}`;
  return v.replace(/\/+$/, "");
}

const BASE_URL =
  normalizeBase(import.meta.env.VITE_API_BASE_URL) ||
  (typeof window !== "undefined" ? `http://${window.location.hostname}:8000` : "http://localhost:8000");

// ngrok's free tier answers BROWSER requests with an HTML warning page unless
// the visitor tapped "Visit Site" once (a cookie, valid 7 days) or the request
// carries this header. Send it only when this page itself is served from an
// ngrok domain, so ordinary LAN / localhost use adds no extra header (which
// would force an extra CORS preflight on cross-origin calls).
const ON_NGROK =
  typeof window !== "undefined" && (/ngrok/i.test(window.location.hostname) || /ngrok/i.test(BASE_URL));
const TUNNEL_HEADERS = ON_NGROK ? { "ngrok-skip-browser-warning": "true" } : {};

// ---------------------------------------------------------------
// Address recovery
// ---------------------------------------------------------------
// If a DIRECT backend address (e.g. http://192.168.1.15:8000 - often a stale IP
// or a different network) cannot be reached, but this page's own dev server
// answers "/api/health" (the proxy set up in vite.config.js), switch to "/api"
// so the app still works. A real {"status":"ok"} reply is required, so an
// unrelated page (e.g. a dev server without the proxy) is never mistaken for it.
let activeBase = BASE_URL;
let baseVerified = false; // true after the first successful call to activeBase
let lastProbe = 0;
const isRelativeBase = (b) => b.startsWith("/");

async function tryProxyFallback() {
  if (typeof window === "undefined" || isRelativeBase(activeBase)) return false;
  if (Date.now() - lastProbe < 10000) return false; // do not hammer the dev server
  lastProbe = Date.now();
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 4000);
    const r = await fetch("/api/health", { signal: ctl.signal, headers: { ...TUNNEL_HEADERS } });
    clearTimeout(timer);
    if (!r.ok) return false;
    const j = await r.json();
    if (j && j.status === "ok") {
      // eslint-disable-next-line no-console
      console.warn(
        `[api] ${activeBase} is not reachable - using the dev-server proxy /api instead. ` +
          `Set VITE_API_BASE_URL=/api in frontend/.env to remove this warning.`
      );
      activeBase = "/api";
      baseVerified = false;
      return true;
    }
  } catch {
    /* proxy not available */
  }
  return false;
}

// fetch() against the active base, with the one-time proxy fallback above.
// An address that has never answered gets a 7 s cap so an unreachable IP does not hang the UI.
async function fetchWithFallback(pathQuery, init = {}) {
  const attempt = async () => {
    const url = `${activeBase}${pathQuery}`;
    let timer = null;
    let signal = init.signal;
    if (!baseVerified && !isRelativeBase(activeBase) && !signal) {
      const ctl = new AbortController();
      timer = setTimeout(() => ctl.abort(), 7000);
      signal = ctl.signal;
    }
    try {
      const res = await fetch(url, { ...init, signal });
      baseVerified = true;
      return { res, url };
    } finally {
      if (timer) clearTimeout(timer);
    }
  };
  try {
    return await attempt();
  } catch (err) {
    if (await tryProxyFallback()) return attempt();
    throw err;
  }
}

class ApiError extends Error {
  constructor(message, status, detail) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

// Turns a bare HTTP 500 into an actionable message. In "/api" mode the Vite dev
// server returns the same 500 whether the backend is DOWN or CRASHED, so ask the
// backend's /health endpoint which one it is.
async function explainServerError(method, path, detail) {
  const generic = detail || "Server error";
  if (!isRelativeBase(activeBase)) {
    return (
      `${generic} - the backend crashed while handling ${method} ${path}. ` +
      `The reason is printed in the terminal running uvicorn (see the last line of the traceback).`
    );
  }
  let up = false;
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 4000);
    const r = await fetch(`${activeBase}/health`, { signal: ctl.signal, headers: { ...TUNNEL_HEADERS } });
    clearTimeout(timer);
    up = r.ok;
  } catch {
    up = false;
  }
  return up
    ? `${generic} - the backend IS running but crashed while handling ${method} ${path}. ` +
        `Read the last line of the traceback in the terminal running uvicorn.`
    : `${generic} - the backend is NOT reachable on port 8000 (the dev server could not connect to it). ` +
        `In the backend folder run:  python -m uvicorn main:app --reload`;
}

async function request(path, { method = "GET", body, params } = {}) {
  let pathQuery = path;
  if (params) {
    const search = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") search.set(k, v);
    });
    const qs = search.toString();
    if (qs) pathQuery += `?${qs}`;
  }

  let res;
  let url = `${activeBase}${pathQuery}`;
  try {
    ({ res, url } = await fetchWithFallback(pathQuery, {
      method,
      headers: { ...TUNNEL_HEADERS, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    }));
  } catch {
    // The browser only says "Failed to fetch" when the request could not be
    // completed at all (backend not running / wrong address / firewall / CORS
    // block). Say WHICH address was tried and what to check.
    const full = typeof window !== "undefined" ? new URL(url, window.location.href).href : url;
    throw new ApiError(
      `Cannot reach the backend (${method} ${full})`,
      0,
      `Cannot reach the backend (${method} ${full}). Check that the backend is running, that ` +
        `VITE_API_BASE_URL in frontend/.env is correct - use /api so the dev server forwards ` +
        `requests - and, if you use a direct address, that the backend's CORS allows this page.`
    );
  }

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

  // A success response that is a web page (starts with "<") is never valid API
  // data - typically ngrok's warning page. Fail clearly instead of handing an
  // HTML string to pages that expect arrays/objects.
  if (res.ok && typeof data === "string" && /^\s*</.test(data)) {
    const hint = ON_NGROK ? " Open this site once in the browser and tap 'Visit Site'." : "";
    throw new ApiError(
      `${method} ${path} returned a web page instead of API data.${hint}`,
      res.status,
      `The server returned a web page instead of API data (${method} ${url}).${hint}`
    );
  }

  if (!res.ok) {
    let detail = (data && data.detail) || res.statusText;
    // FastAPI's generic 404 ("Not Found") means NO ROUTE matched the URL - not
    // "record not found". Say which URL was requested so a wrong base URL,
    // stray path segment or an outdated backend is obvious on screen.
    if (res.status === 404 && detail === "Not Found") {
      detail = `Not Found - the server has no endpoint ${method} ${url}`;
    }
    // A bare 500 is either "backend crashed" or (in /api mode) "backend not
    // running" - the dev server answers 500 for both. Work out which one.
    if (res.status >= 500 && !(data && data.detail)) {
      detail = await explainServerError(method, path, detail);
    }
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
export const googleLogin = (idToken) =>
  request("/auth/google", { method: "POST", body: { id_token: idToken } });
export const forgotPassword = (payload) => request("/auth/forgot-password", { method: "POST", body: payload });
export const resetPassword = (payload) => request("/auth/reset-password", { method: "POST", body: payload });
export const getMe = (token) =>
  fetchWithFallback("/auth/me", { headers: { ...TUNNEL_HEADERS, Authorization: `Bearer ${token}` } }).then(async ({ res }) => {
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
// Settings (real, live-adjustable trust-engine parameters)
// ---------------------------------------------------------------
export const getSettings = () => request("/settings");
export const updateSettings = (payload) => request("/settings", { method: "PUT", body: payload });

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

// ---------------------------------------------------------------
// Sensor learning / invalid events / quality score
// ---------------------------------------------------------------
export const getProcessing = (sensorId) => request(`/sensor-processing/${sensorId}`);
export const updateProcessing = (sensorId, payload) =>
  request(`/sensor-processing/${sensorId}`, { method: "PUT", body: payload });
export const startLearning = (sensorId, payload) =>
  request(`/learning/${sensorId}/start`, { method: "POST", body: payload || {} });
export const cancelLearning = (sensorId) => request(`/learning/${sensorId}/cancel`, { method: "POST" });
export const getLearningStatus = (sensorId) => request(`/learning/${sensorId}/status`);
export const getLearningResult = (sensorId, sessionId) =>
  request(`/learning/${sensorId}/result`, { params: sessionId ? { session_id: sessionId } : undefined });
export const listLearningSessions = (sensorId, params) => request(`/learning/${sensorId}/sessions`, { params });
export const listLearningReadings = (sensorId, params) => request(`/learning/${sensorId}/readings`, { params });
export const listInvalidReadings = (params) => request("/invalid-readings", { params });
export const getSensorDashboard = () => request("/dashboard/sensors");
export const getSensorHistory = (sensorId, params) => request(`/dashboard/sensors/${sensorId}/history`, { params });
export const setSensorDevice = (sensorId, payload) =>
  request(`/dashboard/sensors/${sensorId}/device`, { method: "PUT", body: payload });
export const getHealingOverview = (sensorId) => request(`/self-healing/${sensorId}/overview`);

// The backend address currently in use (shown in error messages so a wrong base URL is obvious).
export const getApiBase = () => activeBase;

export { ApiError };
