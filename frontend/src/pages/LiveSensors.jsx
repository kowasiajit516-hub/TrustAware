import { useEffect, useMemo, useState } from "react";
import Topbar from "../components/Topbar.jsx";
import LiveSensorCard from "../components/LiveSensorCard.jsx";
import { useSafePolling } from "../hooks/useSafePolling.js";
import { listSensors } from "../api/client.js";
import { loadDashboard, explainError } from "../utils/dashboardLoader.js";
import { normalizeDashboard, ago } from "../utils/sensorData.js";

function Chip({ label, value, tone = "" }) {
  return (
    <div className="card px-4 py-3 min-w-[110px]">
      <div className="text-[11px] text-[#94A3B8]">{label}</div>
      <div className={`text-xl font-bold ${tone || "text-[#F8FAFC]"}`}>{value ?? "—"}</div>
    </div>
  );
}

const FILTERS = [
  ["ALL", "All"],
  ["PROBLEM", "Problems / faults"],
  ["VIRTUAL", "Virtual / redundant"],
  ["NO_DATA", "No data / stale"],
];

export default function LiveSensors() {
  // Poll every 3 s (6 s in limited mode, which needs more requests). Never overlaps, backs off after failures.
  const { data: raw, error, loading, failures, lastOk, refreshing, retry } = useSafePolling(
    () => loadDashboard(), [], (d) => (d?.mode === "limited" ? 6000 : 3000)
  );
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [nowMs, setNowMs] = useState(Date.now());
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (!loading) { setSlow(false); return undefined; }
    const id = setTimeout(() => setSlow(true), 8000);
    return () => clearTimeout(id);
  }, [loading]);

  const data = useMemo(() => normalizeDashboard(raw), [raw]);
  const limited = data?.mode === "limited";

  // Cross-check with GET /sensors (full mode only; limited mode already uses that list).
  const { data: plain } = useSafePolling(() => (limited ? Promise.resolve(null) : listSensors()), [limited], 8000);
  const listCount = Array.isArray(plain) ? plain.length : null;
  const mismatch = data && !limited && listCount !== null && listCount !== data.sensors.length;

  const devices = useMemo(() => {
    if (!data) return null;
    const q = search.trim().toLowerCase();
    return data.devices.filter((d) => {
      const text = [d.name, d.model, d.location, ...d.sensors.flatMap((s) => [s.sensor_id, s.name, s.sensor_type])].join(" ").toLowerCase();
      if (q && !text.includes(q)) return false;
      if (filter === "PROBLEM") return d.sensors.some((s) => s.sensor_state === "FAULT" || s.sensor_state === "WARNING" || s.data_state === "ERROR" || s.measurement_issue);
      if (filter === "VIRTUAL") return d.sensors.some((s) => s.source === "VIRTUAL" || s.source === "REDUNDANT");
      if (filter === "NO_DATA") return d.sensors.some((s) => s.data_state === "NO_DATA" || s.data_state === "STALE");
      return true;
    });
  }, [data, search, filter]);

  const c = data?.counts;
  const why = error ? explainError(error) : null;

  return (
    <div>
      <Topbar title="Live Sensors" subtitle="Every registered sensor and every measurement, straight from the backend — nothing hidden" />
      <div className="p-6 space-y-4">
        <div className="flex flex-wrap gap-3">
          <Chip label="Sensors" value={c?.sensors} />
          <Chip label="Devices" value={c?.devices} />
          <Chip label="Live" value={c?.live} tone="text-status-healthy" />
          <Chip label="Virtual / redundant" value={c?.virtual} tone="text-status-recovering" />
          <Chip label="Fault" value={c?.fault} tone="text-status-faulty" />
          <Chip label="With issues" value={c?.with_issue} tone="text-status-recovering" />
          <Chip label="No data / stale" value={c ? c.no_data + c.stale : null} />
        </div>

        {/* First load: clear about what is happening, and never forever */}
        {loading && (
          <div className="card p-6 text-sm text-[#94A3B8]">
            Loading sensors…
            {slow && <span className="block mt-1 text-status-recovering">Still waiting for the backend — if it is hosted on a free plan it can take up to a minute to wake up. This page keeps trying.</span>}
          </div>
        )}

        {/* Failure with nothing to show yet */}
        {!loading && error && !data && (
          <div role="alert" className="rounded-lg border border-status-faulty/30 bg-status-faulty/10 p-4">
            <div className="font-semibold text-status-faulty">{why.title}</div>
            <p className="text-xs text-[#F8FAFC] mt-1 break-words">{why.detail}</p>
            {why.hint && <p className="text-xs text-[#94A3B8] mt-2">{why.hint}</p>}
            <div className="flex items-center gap-3 mt-3">
              <button onClick={retry} disabled={refreshing}
                className="text-sm font-semibold px-3 py-1.5 rounded-lg bg-gradient-to-r from-accent-blue to-accent-purple text-white disabled:opacity-50">
                {refreshing ? "Retrying…" : "Retry"}
              </button>
              <span className="text-[11px] text-[#94A3B8]">Failed attempts: {failures} · retrying automatically</span>
            </div>
          </div>
        )}

        {/* Failure but we still have earlier data: keep showing it, say it is stale */}
        {error && data && (
          <div role="alert" className="flex flex-wrap items-center gap-3 text-xs text-status-recovering bg-status-recovering/10 border border-status-recovering/30 rounded-lg px-3 py-2">
            <span>Refresh failed ({why.detail}). Showing the last data received {ago(lastOk ? new Date(lastOk).toISOString() : null, nowMs)} — readings below may be out of date.</span>
            <button onClick={retry} disabled={refreshing} className="font-semibold underline disabled:opacity-50">{refreshing ? "Retrying…" : "Retry now"}</button>
          </div>
        )}

        {limited && (
          <div className="text-xs text-status-recovering bg-status-recovering/10 border border-status-recovering/30 rounded-lg px-3 py-2">
            Limited mode: the backend's <code>/dashboard/sensors</code> endpoint is not available ({data.fallback_reason}). Showing real data from the standard endpoints instead —
            device grouping, fault history and learning progress need the latest backend to be deployed.
          </div>
        )}
        {mismatch && (
          <div className="text-xs text-status-recovering bg-status-recovering/10 border border-status-recovering/30 rounded-lg px-3 py-2">
            Sensor list mismatch: this page shows {data.sensors.length} sensors but <code>GET /sensors</code> returned {listCount}.
            One of them is truncating the list (check for a default limit in the sensors route).
          </div>
        )}

        {data && (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <input className="input max-w-xs" placeholder="Search sensor, type, device…" value={search} onChange={(e) => setSearch(e.target.value)} />
              <div className="flex flex-wrap gap-2">
                {FILTERS.map(([k, label]) => (
                  <button key={k} onClick={() => setFilter(k)}
                    className={`text-xs font-semibold px-3 py-1.5 rounded-full border ${filter === k ? "border-accent-cyan text-accent-cyan bg-accent-cyan/10" : "border-base-border text-[#94A3B8]"}`}>
                    {label}
                  </button>
                ))}
              </div>
              <span className="text-xs text-[#94A3B8]">{devices ? `${devices.length} of ${data.devices.length} cards` : ""}</span>
            </div>

            {devices && devices.length === 0 && (
              <div className="card p-8 text-center text-sm text-[#94A3B8]">
                {data.sensors.length === 0 ? "No sensors registered yet." : "No sensors match this filter."}
              </div>
            )}
            <div className="grid grid-cols-1 2xl:grid-cols-2 gap-4">
              {(devices || []).map((d) => <LiveSensorCard key={d.device_id} device={d} reload={retry} />)}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
