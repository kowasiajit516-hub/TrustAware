import { useEffect, useState } from "react";
import { getHealingOverview, getSensorHealth, getLatestPrediction, getLatestTrustedReading } from "../api/client.js";

const f2 = (v, d = 2) => (v === null || v === undefined || Number.isNaN(Number(v)) ? "—" : Number(v).toFixed(d));

// Fallback used only when the new backend endpoint is not available: builds the same stage map from the
// older endpoints that already exist (sensor-health, predictions, trusted-readings). Stages that need the
// new backend (calibration / filtering / validation / baseline / recovery detail) stay grey.
function buildFallback(h, pred, tr) {
  const S = (state, detail) => ({ state, detail });
  const need = S("idle", "needs the updated backend");
  const state = !h ? null : h.status === "FAULTY" ? "FAULT" : h.status === "RECOVERING" ? (h.last_is_fault ? "WARNING" : "RECOVERING") : "HEALTHY";
  const source = !tr ? null : tr.source === "RAW" ? "REAL" : tr.source;
  const yes = source === "REAL";
  const avail = tr ? tr.trusted_value !== null && tr.trusted_value !== undefined : null;
  const tone = { HEALTHY: "ok", WARNING: "alert", FAULT: "alert", RECOVERING: "active" }[state] || "idle";
  return {
    sensor: S(tr || h ? "ok" : "idle", tr || h ? "sending data" : "no data yet"),
    raw: tr ? S("ok", f2(tr.raw_value)) : S("idle", "—"),
    calibration: need, filtering: need, validation: need, baseline: need,
    ai: pred ? (pred.is_fault ? S("alert", "ANOMALY") : S("ok", "NORMAL")) : S("idle", "—"),
    trust: h ? S(tone, `${f2(h.trust_score, 0)}% · ${state}`) : S("idle", "—"),
    decision: !source ? S("idle", "—") : yes ? S("ok", "YES — sensor trusted") : S("alert", "NO — sensor not trusted"),
    real_value: yes ? S("ok", f2(tr.trusted_value)) : S("idle", "not used"),
    isolate: !source || yes ? S("idle", "nothing to isolate") : S("alert", `raw ${f2(tr.raw_value)} kept out of the trusted chain`),
    substitute: source === "VIRTUAL" || source === "REDUNDANT" ? S("active", `${source}: ${f2(tr.trusted_value)}`) : source === "UNAVAILABLE" ? S("alert", "UNAVAILABLE") : S("idle", "not needed"),
    trusted_value: !source ? S("idle", "—") : avail ? S("ok", `${f2(tr.trusted_value)} (${source})`) : S("alert", "UNAVAILABLE"),
    automation: !source ? S("idle", "—") : avail ? S("ok", "evaluated with the trusted value") : S("alert", "HELD — no safe value"),
    actuator: !source ? S("idle", "—") : avail ? S("ok", "driven by the trusted value only") : S("alert", "keeps its last state"),
    monitoring: h ? S(state === "HEALTHY" ? "ok" : "active", `${h.consecutive_faults ?? 0} fault(s) in a row · ${h.consecutive_healthy ?? 0} valid in a row`) : S("idle", "—"),
    recovery_detection: h ? (state === "RECOVERING" ? S("active", "valid readings seen — verifying") : state === "HEALTHY" ? S("idle", "no fault episode") : S("alert", "fault active")) : S("idle", "—"),
    valid_readings: h && state !== "HEALTHY" ? S(state === "RECOVERING" ? "active" : "idle", `${h.consecutive_healthy ?? 0} consecutive valid`) : S("idle", "not needed"),
    trust_recovery: h ? S(state === "RECOVERING" ? "active" : "idle", `trust ${f2(h.trust_score, 0)}%`) : S("idle", "—"),
    restored: yes && state === "HEALTHY" ? S("ok", "real sensor in use") : S("idle", "not restored yet"),
  };
}

// Live self-healing pipeline. Every stage colour comes from the backend (GET /self-healing/{id}/overview):
//   green = passed / healthy · red = fault or problem · amber = in effect right now · grey = not applicable now
const DOT = {
  ok: "border-status-healthy text-status-healthy bg-status-healthy/10",
  alert: "border-status-faulty text-status-faulty bg-status-faulty/10",
  active: "border-status-recovering text-status-recovering bg-status-recovering/10",
  idle: "border-base-border text-[#64748B] bg-transparent",
};
const TEXT = { ok: "text-[#F8FAFC]", alert: "text-status-faulty", active: "text-status-recovering", idle: "text-[#64748B]" };

function Stage({ n, label, s }) {
  const st = s?.state || "idle";
  return (
    <div className="flex items-start gap-3">
      <span className={`mt-0.5 w-6 h-6 shrink-0 rounded-full border text-[10px] font-bold flex items-center justify-center ${DOT[st]}`}>{n}</span>
      <div className="min-w-0">
        <div className={`text-sm font-semibold ${TEXT[st]}`}>{label}</div>
        <div className="text-[11px] text-[#94A3B8] break-words">{s?.detail || "—"}</div>
      </div>
    </div>
  );
}

function Arrow() {
  return <div className="ml-3 h-3 border-l border-base-border" />;
}

function Branch({ title, tone, on, children }) {
  return (
    <div className={`rounded-lg border p-3 space-y-2 ${on ? (tone === "ok" ? "border-status-healthy/50 bg-status-healthy/5" : "border-status-faulty/50 bg-status-faulty/5") : "border-base-border opacity-60"}`}>
      <div className={`text-[11px] font-bold tracking-wider ${on ? (tone === "ok" ? "text-status-healthy" : "text-status-faulty") : "text-[#64748B]"}`}>{title}</div>
      {children}
    </div>
  );
}

export default function PipelineFlow({ sensorId }) {
  const [p, setP] = useState(null);
  const [note, setNote] = useState(null);

  useEffect(() => {
    if (!sensorId) return undefined;
    let cancelled = false;
    async function load() {
      try {
        const o = await getHealingOverview(sensorId);
        if (!o || !o.pipeline) throw new Error("the response has no 'pipeline' (old healing_overview.py?)");
        if (!cancelled) { setP(o.pipeline); setNote(null); }
      } catch (e) {
        const [h, pr, tr] = await Promise.allSettled([getSensorHealth(sensorId), getLatestPrediction(sensorId), getLatestTrustedReading(sensorId)]);
        if (cancelled) return;
        setP(buildFallback(h.status === "fulfilled" ? h.value : null, pr.status === "fulfilled" ? pr.value : null, tr.status === "fulfilled" ? tr.value : null));
        setNote(`New backend endpoint not available (${e.detail || e.message || e}). Showing limited live data. Copy the backend files, then restart uvicorn.`);
      }
    }
    load();
    const id = setInterval(load, 2000);
    return () => { cancelled = true; clearInterval(id); };
  }, [sensorId]);

  if (!p) return <p className="text-xs text-[#94A3B8]">Loading pipeline…</p>;
  const yes = p.decision.state === "ok";
  const no = p.decision.state === "alert";

  return (
    <div className="space-y-1">
      {note && (
        <div className="text-[11px] text-status-recovering bg-status-recovering/10 border border-status-recovering/30 rounded-lg px-3 py-2 mb-2">{note}</div>
      )}
      <div className="text-[10px] font-semibold tracking-wider text-[#94A3B8] uppercase mb-1">Processing</div>
      <Stage n={1} label="Sensor" s={p.sensor} /><Arrow />
      <Stage n={2} label="Raw Reading" s={p.raw} /><Arrow />
      <Stage n={3} label="Calibration" s={p.calibration} /><Arrow />
      <Stage n={4} label="Filtering" s={p.filtering} /><Arrow />
      <Stage n={5} label="Validation" s={p.validation} /><Arrow />
      <Stage n={6} label="30-Reading Baseline / Quality Score" s={p.baseline} /><Arrow />
      <Stage n={7} label="AI Anomaly Detection" s={p.ai} /><Arrow />
      <Stage n={8} label="Dynamic Trust Score" s={p.trust} /><Arrow />

      <div className="text-[10px] font-semibold tracking-wider text-[#94A3B8] uppercase mt-2 mb-1">Decision</div>
      <div className={`rounded-lg border px-3 py-2 ${yes ? "border-status-healthy/50" : no ? "border-status-faulty/50" : "border-base-border"}`}>
        <Stage n={9} label="Sensor Trusted?" s={p.decision} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
        <Branch title="YES" tone="ok" on={yes}>
          <Stage n="10" label="Real Value" s={p.real_value} />
        </Branch>
        <Branch title="NO" tone="alert" on={no}>
          <Stage n="11" label="Isolate Faulty Value" s={p.isolate} />
          <Stage n="12" label="Virtual / Redundant Value" s={p.substitute} />
        </Branch>
      </div>
      <Arrow />

      <div className="text-[10px] font-semibold tracking-wider text-[#94A3B8] uppercase mt-1 mb-1">Output</div>
      <Stage n={13} label="Trusted Value" s={p.trusted_value} /><Arrow />
      <Stage n={14} label="Automation Rule" s={p.automation} /><Arrow />
      <Stage n={15} label="Actuator" s={p.actuator} /><Arrow />

      <div className="text-[10px] font-semibold tracking-wider text-[#94A3B8] uppercase mt-1 mb-1">Recovery loop</div>
      <Stage n={16} label="Sensor Monitoring" s={p.monitoring} /><Arrow />
      <Stage n={17} label="Recovery Detection" s={p.recovery_detection} /><Arrow />
      <Stage n={18} label="Multiple Valid Readings" s={p.valid_readings} /><Arrow />
      <Stage n={19} label="Trust Recovery" s={p.trust_recovery} /><Arrow />
      <Stage n={20} label="Real Sensor Restored" s={p.restored} />

      <div className="flex flex-wrap gap-3 pt-3 text-[10px] text-[#94A3B8]">
        <span><b className="text-status-healthy">●</b> passed / healthy</span>
        <span><b className="text-status-faulty">●</b> fault / problem</span>
        <span><b className="text-status-recovering">●</b> in effect now</span>
        <span><b className="text-[#64748B]">●</b> not applicable now</span>
      </div>
    </div>
  );
}
