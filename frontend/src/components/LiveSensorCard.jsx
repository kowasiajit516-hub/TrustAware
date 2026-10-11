import { useEffect, useState } from "react";
import TrustBar from "./TrustBar.jsx";
import { usePolling } from "../hooks/usePolling.js";
import { getSensorHistory, setSensorDevice } from "../api/client.js";
import { ago, fmt, measurementsOf, hasAnyValue, STATE_TONE, DATA_TONE, SOURCE_TONE, RECOVERY_TONE } from "../utils/sensorData.js";

const TONE = {
  green: "text-status-healthy bg-status-healthy/10 border-status-healthy/30",
  amber: "text-status-recovering bg-status-recovering/10 border-status-recovering/30",
  red: "text-status-faulty bg-status-faulty/10 border-status-faulty/30",
  grey: "text-[#94A3B8] bg-[#94A3B8]/10 border-[#94A3B8]/30",
  cyan: "text-accent-cyan bg-accent-cyan/10 border-accent-cyan/30",
};
function Pill({ tone = "grey", children, title }) {
  return (
    <span title={title} className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[10px] font-bold tracking-wide whitespace-nowrap ${TONE[tone]}`}>
      {children}
    </span>
  );
}

// A value cell. Missing values are marked, never silently blank.
function Val({ label, value, unit, missingText = "—", warnMissing = false, strong = false }) {
  const f = fmt(value);
  return (
    <div className="min-w-0">
      <div className="text-[10px] text-[#94A3B8]">{label}</div>
      <div className={`${strong ? "text-sm" : "text-xs"} font-semibold truncate ${f === null ? (warnMissing ? "text-status-recovering" : "text-[#64748B]") : "text-[#F8FAFC]"}`}>
        {f === null ? missingText : `${f}${unit ? ` ${unit}` : ""}`}
      </div>
    </div>
  );
}

function History({ sensorId }) {
  const { data: rows } = usePolling(() => getSensorHistory(sensorId, { limit: 40 }), [sensorId], 3000);
  if (!rows) return <p className="text-[11px] text-[#94A3B8] py-2">Loading history…</p>;
  if (rows.length === 0) return <p className="text-[11px] text-[#94A3B8] py-2">No readings or events yet.</p>;
  return (
    <div className="overflow-x-auto mt-2">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="text-left text-[#94A3B8] border-b border-base-border">
            {["Time", "Raw", "Calibrated", "Filtered", "Trusted", "Source", "Valid / fault"].map((h) => (
              <th key={h} className="py-1 pr-3 font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.timestamp}-${i}`} className={`border-b border-base-border/50 last:border-0 ${r.valid === false ? "bg-status-faulty/5" : ""}`}>
              <td className="py-1 pr-3 text-[#94A3B8] whitespace-nowrap">{new Date(r.timestamp).toLocaleTimeString()}</td>
              <td className="py-1 pr-3 text-[#F8FAFC]">{fmt(r.raw_value) ?? "missing"}</td>
              <td className="py-1 pr-3 text-[#F8FAFC]">{fmt(r.calibrated_value) ?? "—"}</td>
              <td className="py-1 pr-3 text-[#F8FAFC]">{fmt(r.filtered_value) ?? "—"}</td>
              <td className="py-1 pr-3 text-[#F8FAFC]">{r.trusted_available === false ? "unavailable" : fmt(r.trusted_value) ?? "—"}</td>
              <td className="py-1 pr-3">{r.source ? <Pill tone={SOURCE_TONE[r.source] || "grey"}>{r.source}</Pill> : "—"}</td>
              <td className="py-1 pr-3">
                {r.kind === "FAULT" ? (
                  <span className="text-status-faulty">EVENT · {r.fault_category}: {r.reason}</span>
                ) : r.valid === false ? (
                  <span className="text-status-faulty">INVALID · {r.fault_category}: {r.reason}</span>
                ) : (
                  <span className="text-status-healthy">valid</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DeviceEditor({ s, onDone }) {
  const [group, setGroup] = useState(s.device_group || "");
  const [model, setModel] = useState(s.device_model || "");
  const [err, setErr] = useState(null);
  async function save() {
    try {
      await setSensorDevice(s.sensor_id, { device_group: group, device_model: model });
      onDone();
    } catch (e) {
      setErr(e.detail || e.message);
    }
  }
  return (
    <div className="mt-2 p-2 rounded-md border border-base-border bg-base-bg/40 text-[11px] space-y-2">
      <p className="text-[#94A3B8]">Give every measurement of one physical device the same group name (e.g. the DHT22&apos;s temperature and humidity sensors) to show them on one card.</p>
      <div className="flex flex-wrap gap-2">
        <input className="input py-1 text-xs w-40" placeholder="Device group" value={group} onChange={(e) => setGroup(e.target.value)} />
        <input className="input py-1 text-xs w-32" placeholder="Model (DHT22)" value={model} onChange={(e) => setModel(e.target.value)} />
        <button className="px-2 py-1 rounded-md bg-accent-cyan/20 text-accent-cyan font-semibold" onClick={save}>Save</button>
        <button className="px-2 py-1 rounded-md text-[#94A3B8]" onClick={onDone}>Cancel</button>
      </div>
      {err && <p className="text-status-faulty">{err}</p>}
    </div>
  );
}

function MeasurementRow({ row, reload }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const unit = row.unit || "";
  const noData = row.data_state === "NO_DATA";
  const unavailable = row.trusted_available === false;
  const L = row.learning;
  return (
    <div className="rounded-md border border-base-border p-3 bg-base-bg/40">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-[#F8FAFC] truncate">{row.label}{unit ? <span className="text-[#94A3B8] font-normal"> ({unit})</span> : null}</div>
          <div className="text-[10px] text-[#94A3B8] truncate">{row.sensor_id}{row.name ? ` · ${row.name}` : ""}</div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {row.sensor_state && <Pill tone={STATE_TONE[row.sensor_state] || "grey"}>{row.sensor_state}</Pill>}
          {row.ai && <Pill tone={row.ai === "NORMAL" ? "green" : "red"} title={(row.ai_reasons || []).join(" · ")}>AI {row.ai}</Pill>}
          {row.source && <Pill tone={SOURCE_TONE[row.source] || "grey"}>{row.source}</Pill>}
          {row.data_state && row.data_state !== "LIVE" && <Pill tone={DATA_TONE[row.data_state]}>{row.data_state.replace("_", " ")}</Pill>}
          {row.recovery_state && row.recovery_state !== "NORMAL" && (
            <Pill tone={RECOVERY_TONE[row.recovery_state]}>{row.recovery_state === "FAULT" ? "FAULT ACTIVE" : row.recovery_state}</Pill>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
        <Val label="Raw" value={row.raw_value} unit={unit} missingText={noData ? "no data" : "missing"} warnMissing />
        <Val label="Calibrated" value={row.calibrated_value} unit={unit} />
        <Val label="Filtered" value={row.filtered_value} unit={unit} />
        <Val label="Trusted" value={row.trusted_value} unit={unit} strong
             missingText={unavailable ? "UNAVAILABLE" : noData ? "no data" : "missing"} warnMissing />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3 items-end">
        <div>
          <div className="text-[10px] text-[#94A3B8] mb-1">Trust</div>
          {row.trust_score != null ? <TrustBar score={row.trust_score} /> : <span className="text-xs text-[#64748B]">—</span>}
        </div>
        <div>
          <div className="text-[10px] text-[#94A3B8]">Last update</div>
          <div className="text-xs font-semibold text-[#F8FAFC]">{ago(row.last_update, row._now)}</div>
        </div>
        <div>
          <div className="text-[10px] text-[#94A3B8]">Learning / quality</div>
          {L ? (
            <div className="text-xs font-semibold text-[#F8FAFC]">
              {L.state === "COLLECTING" && `Reading ${L.reading_number}/${L.target}`}
              {L.state === "READY" && (L.quality?.score != null ? `${fmt(L.quality.score, 1)}% ${L.quality.status}` : "Baseline ready")}
              {L.state === "CANCELLED" && <span className="text-[#64748B]">cancelled</span>}
            </div>
          ) : (
            <span className="text-xs text-[#64748B]">not run</span>
          )}
        </div>
      </div>

      {row.measurement_issue && (
        <div className="mt-3 text-[11px] text-status-faulty bg-status-faulty/10 border border-status-faulty/30 rounded-md px-2 py-1.5">
          ⚠ {row.measurement_issue}
          {row.faults?.recent_count > 0 && <span className="text-[#94A3B8]"> · {row.faults.recent_count} fault event(s) in the last {Math.round(row.faults.window_seconds / 60)} min</span>}
        </div>
      )}
      {row.raw_isolated && row.trusted_available !== false && (
        <p className="mt-2 text-[11px] text-status-recovering">Raw value isolated — trusted value comes from the {row.source} source.</p>
      )}
      {!hasAnyValue(row) && !row.measurement_issue && <p className="mt-2 text-[11px] text-[#94A3B8]">No values received yet.</p>}

      <div className="flex gap-3 mt-3 text-[11px]">
        <button className="text-accent-cyan hover:underline" onClick={() => setOpen((o) => !o)}>{open ? "Hide history" : "Show history"}</button>
        <button className="text-[#94A3B8] hover:text-[#F8FAFC]" onClick={() => setEditing((e) => !e)}>Device…</button>
      </div>
      {editing && <DeviceEditor s={row} onDone={() => { setEditing(false); reload?.(); }} />}
      {open && <History sensorId={row.sensor_id} />}
    </div>
  );
}

// One card per physical device; ALL of its measurements are listed (a missing one is marked, not dropped).
export default function LiveSensorCard({ device, reload }) {
  const [nowMs, setNowMs] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const rows = device.sensors.flatMap((s) => measurementsOf({ ...s, _now: nowMs }));
  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-[#F8FAFC] truncate">{device.name}</h3>
          <p className="text-[11px] text-[#94A3B8] truncate">
            {[device.model, device.location, device.node_id].filter(Boolean).join(" · ") || "—"}
            {` · ${rows.length} measurement${rows.length === 1 ? "" : "s"}`}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Pill tone={STATE_TONE[device.state] || "grey"}>{device.state || "—"}</Pill>
        </div>
      </div>
      <div className="space-y-3">
        {rows.map((r) => <MeasurementRow key={`${r.sensor_id}-${r.key}`} row={r} reload={reload} />)}
      </div>
    </div>
  );
}
