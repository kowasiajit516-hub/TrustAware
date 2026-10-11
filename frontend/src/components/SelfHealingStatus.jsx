import { usePolling } from "../hooks/usePolling.js";
import { getHealingOverview } from "../api/client.js";

const fmt = (v, d = 2) => (v === null || v === undefined || Number.isNaN(Number(v)) ? "—" : Number(v).toFixed(d));

const TONE = {
  green: "text-status-healthy bg-status-healthy/10 border-status-healthy/30",
  amber: "text-status-recovering bg-status-recovering/10 border-status-recovering/30",
  red: "text-status-faulty bg-status-faulty/10 border-status-faulty/30",
  grey: "text-[#94A3B8] bg-[#94A3B8]/10 border-[#94A3B8]/30",
  cyan: "text-accent-cyan bg-accent-cyan/10 border-accent-cyan/30",
};
const STATE_TONE = { HEALTHY: "green", WARNING: "amber", FAULT: "red", RECOVERING: "amber" };
const SOURCE_TONE = { REAL: "green", VIRTUAL: "amber", REDUNDANT: "cyan", UNAVAILABLE: "red" };
const RECOVERY_TONE = { NORMAL: "grey", FAULT: "red", VERIFYING: "amber", RECOVERED: "green" };
const RECOVERY_LABEL = { FAULT: "FAULT ACTIVE" };

function Pill({ tone, children }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[11px] font-bold tracking-wide ${TONE[tone] || TONE.grey}`}>
      {children}
    </span>
  );
}

function Tile({ label, children, sub }) {
  return (
    <div>
      <div className="text-[11px] text-[#94A3B8]">{label}</div>
      <div className="font-semibold text-[#F8FAFC] mt-1">{children}</div>
      {sub && <div className="text-[10px] text-[#64748B] mt-0.5">{sub}</div>}
    </div>
  );
}

// Live view of the self-healing pipeline for one sensor:
// RAW -> CALIBRATION -> FILTERING -> VALIDATION -> AI -> TRUST -> REAL/VIRTUAL/REDUNDANT -> TRUSTED -> AUTOMATION
export default function SelfHealingStatus({ sensorId }) {
  const { data: o } = usePolling(() => (sensorId ? getHealingOverview(sensorId) : Promise.resolve(null)), [sensorId], 2000);
  if (!o) return null;
  const unit = o.unit || "";
  const prog = o.recovery_progress;

  return (
    <div className="card p-5">
      <h2 className="font-semibold text-[#F8FAFC] mb-1">Self-Healing Pipeline — Live Status</h2>
      <p className="text-[11px] text-[#94A3B8] mb-4">Automation and actuators use the Trusted Value only — never the Raw Value.</p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <Tile label="Sensor Status">
          {o.sensor_state ? <Pill tone={STATE_TONE[o.sensor_state]}>{o.sensor_state}</Pill> : "—"}
        </Tile>
        <Tile label="Trust">{o.trust_score != null ? `${fmt(o.trust_score, 0)}%` : "—"}</Tile>
        <Tile label="AI" sub={o.ai_reasons?.length ? o.ai_reasons.join(" · ") : null}>
          {o.ai ? <Pill tone={o.ai === "NORMAL" ? "green" : "red"}>{o.ai}</Pill> : "—"}
        </Tile>
        <Tile label="Source" sub={o.redundant_sources?.length ? `from ${o.redundant_sources.join(", ")}` : null}>
          {o.source ? <Pill tone={SOURCE_TONE[o.source] || "grey"}>{o.source}</Pill> : "—"}
        </Tile>

        <Tile label="Raw Value" sub={o.raw_isolated ? "isolated — not used" : null}>
          {o.raw_value != null ? `${fmt(o.raw_value)} ${unit}` : "—"}
        </Tile>
        <Tile label="Calibrated Value">{o.calibrated_value != null ? `${fmt(o.calibrated_value)} ${unit}` : "—"}</Tile>
        <Tile label="Filtered Value">{o.filtered_value != null ? `${fmt(o.filtered_value)} ${unit}` : "—"}</Tile>
        <Tile label="Trusted Value">
          {o.trusted_available === false ? <span className="text-status-faulty">UNAVAILABLE</span> : o.trusted_value != null ? `${fmt(o.trusted_value)} ${unit}` : "—"}
        </Tile>

        <Tile
          label="Recovery"
          sub={o.recovery_state === "VERIFYING" && prog?.required ? `${prog.consecutive_valid}/${prog.required}+ consecutive valid readings` : null}
        >
          {o.recovery_state ? <Pill tone={RECOVERY_TONE[o.recovery_state] || "grey"}>{RECOVERY_LABEL[o.recovery_state] || o.recovery_state}</Pill> : "—"}
        </Tile>
      </div>

      {o.trusted_available === false && (
        <div className="mt-4 text-xs text-status-faulty bg-status-faulty/10 border border-status-faulty/30 rounded-lg px-3 py-2">
          No safe trusted value exists ({o.unavailable_reason || "insufficient data"}). Automation is held and actuators keep their last state — nothing is estimated.
        </div>
      )}
    </div>
  );
}
