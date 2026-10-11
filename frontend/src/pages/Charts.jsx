import { useCallback, useEffect, useRef, useState } from 'react';
import Charts3D from './charts3d/Charts3D';

// ---- CHANGE ONLY THESE LINES IF YOUR BACKEND DIFFERS ----
const API = import.meta.env.VITE_API_BASE_URL || '/api'; // your dev-server proxy. If /api/sensors gives 404, use 'http://localhost:8000'
const SENSORS_URL = `${API}/sensors`;
// backend max limit is 1000. If your filter param is not 'sensor_id', check /docs and change it here.
const READINGS_URL = (id) => `${API}/readings?sensor_id=${encodeURIComponent(id)}&limit=1000`;
// Paths that hold trusted values / anomaly scores. null = auto-discover them from the backend's OpenAPI spec.
const EXTRA_PATHS = null; // e.g. { flat: ['/trusted-readings'], param: [] }
// ----------------------------------------------------------

const toList = (j) =>
  Array.isArray(j) ? j : j?.items || j?.data || j?.results || j?.readings || j?.sensors || [];

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    let detail = '';
    try { detail = JSON.stringify((await res.json()).detail); } catch {}
    throw new Error(`${url} → HTTP ${res.status} ${detail}`);
  }
  return toList(await res.json());
}

const first = (o, keys) => { for (const k of keys) if (o?.[k] !== undefined && o[k] !== null) return o[k]; return undefined; };

const WANT = /trust|health|predict|anomal|fault|score/i;

// Find GET endpoints that look like trust / health / prediction / anomaly data.
// flat = no path params, param = one path param (e.g. /sensors/{sensor_id}/health)
async function discoverPaths() {
  for (const u of [`${API}/openapi.json`, 'http://localhost:8000/openapi.json']) {
    try {
      const spec = await (await fetch(u)).json();
      if (!spec?.paths) continue;
      const all = Object.entries(spec.paths).filter(([p, o]) => o.get && WANT.test(p)).map(([p]) => p);
      return {
        flat: all.filter((p) => !p.includes('{')),
        param: all.filter((p) => (p.match(/\{/g) || []).length === 1),
      };
    } catch { /* try next */ }
  }
  return { flat: [], param: [] };
}

const normalise = (rows, fallbackId) => {
  const out = [];
  for (const x of rows) {
    const sensor_id = first(x, ['sensor_id', 'sensorId', 'sensor']) ?? fallbackId;
    const timestamp = first(x, ['timestamp', 'created_at', 'time', 'ts', 'updated_at']);
    const trusted_value = first(x, ['trusted_value', 'trusted']);
    const anomaly_score = first(x, ['anomaly_score', 'if_score', 'decision_score', 'anomaly', 'score']);
    if (sensor_id && timestamp && (trusted_value !== undefined || anomaly_score !== undefined))
      out.push({ sensor_id, timestamp, trusted_value, anomaly_score });
  }
  return out;
};

async function fetchRows(url) {
  try { return await getJson(`${url}${url.includes('?') ? '&' : '?'}limit=1000`); }
  catch { try { return await getJson(url); } catch { return []; } }
}

async function fetchExtra(path) {
  const rows = await fetchRows(`${API}${path}`);
  return { path, total: rows.length, rows: normalise(rows) };
}

// per-sensor endpoints like /sensors/{sensor_id}/health
async function fetchParam(path, sensors) {
  const parts = await Promise.all(sensors.map(async (x) => {
    const id = x.sensor_id ?? x.id ?? x._id;
    const rows = await fetchRows(`${API}${path.replace(/\{[^}]+\}/, encodeURIComponent(id))}`);
    return { n: rows.length, rows: normalise(rows, id) };
  }));
  return { path, total: parts.reduce((a, b) => a + b.n, 0), rows: parts.flatMap((p) => p.rows) };
}

export default function Charts() {
  const [sensors, setSensors] = useState([]);
  const [readings, setReadings] = useState([]);
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const pathsRef = useRef(EXTRA_PATHS);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const s = await getJson(SENSORS_URL);
      // one request per sensor so every sensor gets its own (up to 1000) readings
      const lists = await Promise.all(
        s.map((x) => getJson(READINGS_URL(x.sensor_id ?? x.id ?? x._id)).catch(() => []))
      );
      if (!pathsRef.current) pathsRef.current = await discoverPaths();
      const extras = await Promise.all(pathsRef.current.flat.map(fetchExtra));
      const gotSomething = extras.some((e) => e.rows.length);
      if (!gotSomething) extras.push(...(await Promise.all(pathsRef.current.param.map((p) => fetchParam(p, s)))));
      setSources(extras.map((e) => ({
        path: e.path, total: e.total ?? 0, usable: e.rows.length,
        trusted: e.rows.filter((r) => r.trusted_value !== undefined).length,
        anomaly: e.rows.filter((r) => r.anomaly_score !== undefined).length,
      })));
      lists.push(...extras.map((e) => e.rows));

      const seen = new Set();
      const r = lists.flat().filter((x) => {
        const k = x._id || x.id || `${x.sensor_id}|${x.timestamp}|${x.trusted_value ?? ''}|${x.anomaly_score ?? ''}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      setSensors(s);
      setReadings(r);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, [load]);

  const tCount = sources.reduce((a, b) => a + b.trusted, 0);
  const aCount = sources.reduce((a, b) => a + b.anomaly, 0);

  return (
    <div style={{ padding: 'clamp(10px, 3vw, 24px)', minWidth: 0 }}>
      <h2 style={{ margin: 0, color: '#fff' }}>Charts &amp; Graphs</h2>
      <p style={{ margin: '4px 0 16px', color: '#8fb8d6' }}>
        Visualize sensor data with interactive 3D surface graphs
      </p>
      <Charts3D sensors={sensors} readings={readings} loading={loading} error={error} onRefresh={load} />
      <details style={{ marginTop: 14, color: '#8fb8d6', fontSize: 13 }}>
        <summary style={{ cursor: 'pointer' }}>
          Data sources — trusted values: {tCount} · anomaly scores: {aCount}
        </summary>
        {sources.length ? (
          <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
            {sources.map((x) => (
              <li key={x.path}>{x.path}: {x.total} rows fetched, {x.usable} usable (trusted {x.trusted}, anomaly {x.anomaly})</li>
            ))}
          </ul>
        ) : (
          <p style={{ margin: '8px 0 0' }}>
            No trust / health / anomaly endpoint was found in the backend. These two graphs need the backend to store
            trusted values and anomaly scores first.
          </p>
        )}
      </details>
    </div>
  );
}
