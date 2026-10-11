import { useEffect, useMemo, useRef, useState } from "react";
import Topbar from "../components/Topbar.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import TrustBar from "../components/TrustBar.jsx";
import { usePolling } from "../hooks/usePolling.js";
import { useSafePolling } from "../hooks/useSafePolling.js";
import {
  listSensors,
  getLearningStatus,
  listLearningReadings,
  listInvalidReadings,
  startLearning,
  cancelLearning,
  getSensorHealth,
  getLatestPrediction,
  getLatestTrustedReading,
  getHealth,
  getApiBase,
} from "../api/client.js";
import { loadDashboard } from "../utils/dashboardLoader.js";
import { FILTER_METHODS, PRESETS, MIN_READINGS_UI, MAX_READINGS, validateConfig, buildStartBody, formFromProcessing, explainLearningError } from "../utils/learningConfig.js";

const fmt = (v, d = 2) => (v === null || v === undefined || Number.isNaN(Number(v)) ? "—" : Number(v).toFixed(d));
const mmss = (s) => {
  if (s === null || s === undefined) return "—";
  const t = Math.max(0, Math.round(s));
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
};

const TONE = {
  green: "text-status-healthy bg-status-healthy/10 border-status-healthy/30",
  amber: "text-status-recovering bg-status-recovering/10 border-status-recovering/30",
  red: "text-status-faulty bg-status-faulty/10 border-status-faulty/30",
  grey: "text-[#94A3B8] bg-[#94A3B8]/10 border-[#94A3B8]/30",
  cyan: "text-accent-cyan bg-accent-cyan/10 border-accent-cyan/30",
};
const OP_TONE = { HEALTHY: "green", SUSPECT: "amber", UNRELIABLE: "red", INSUFFICIENT_DATA: "grey", WARNING: "amber" };
const SRC_TONE = { REAL: "green", VIRTUAL: "amber", REDUNDANT: "cyan", UNAVAILABLE: "red" };
function Pill({ tone = "grey", children }) {
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[11px] font-bold whitespace-nowrap ${TONE[tone]}`}>{children}</span>;
}

const SENSOR_SIDE = ["SENSOR_FAULT", "OUT_OF_RANGE", "ABNORMAL_BEHAVIOR", "INVALID_VALUE"];
function CategoryBadge({ category }) {
  return <Pill tone={SENSOR_SIDE.includes(category) ? "red" : "amber"}>{category}</Pill>;
}

function KV({ label, value, sub }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] text-[#94A3B8]">{label}</div>
      <div className="font-semibold text-[#F8FAFC] mt-0.5 break-words">{value}</div>
      {sub && <div className="text-[10px] text-[#64748B] mt-0.5">{sub}</div>}
    </div>
  );
}

function Field({ label, error, children }) {
  return (
    <label className="text-[11px] text-[#94A3B8] block">
      {label}
      <div className="mt-1">{children}</div>
      {error && <span className="block text-status-faulty mt-1 max-w-[220px]">{error}</span>}
    </label>
  );
}

function Sub({ title, children }) {
  return (
    <div>
      <h3 className="text-xs font-semibold tracking-wide text-[#94A3B8] uppercase mb-2">{title}</h3>
      {children}
    </div>
  );
}

function ErrorBox({ info, onRetry, retrying }) {
  return (
    <div role="alert" className="rounded-lg border border-status-faulty/30 bg-status-faulty/10 p-4" data-testid="learning-error">
      <div className="font-semibold text-status-faulty">{info.title}</div>
      <p className="text-xs text-[#F8FAFC] mt-1 break-words">{info.detail}</p>
      {info.hint && <p className="text-xs text-[#94A3B8] mt-2">{info.hint}</p>}
      {info.steps && (
        <ol className="list-decimal ml-5 mt-2 text-xs text-[#94A3B8] space-y-1">
          {info.steps.map((s) => <li key={s}>{s}</li>)}
        </ol>
      )}
      <div className="mt-3 flex items-center gap-3">
        <button onClick={onRetry} disabled={retrying} className="text-sm font-semibold px-3 py-1.5 rounded-lg bg-gradient-to-r from-accent-blue to-accent-purple text-white disabled:opacity-50">Retry</button>
        <span className="text-[11px] text-[#94A3B8]">Retrying automatically.</span>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------------------------
// Final Learned Sensor Result: everything below comes from the persisted backend result (survives refreshes)
// ------------------------------------------------------------------------------------------------------------------
function FinalResult({ r, unit, liveTrust }) {
  const q = r.quality;
  const st = r.statistics;
  const noScore = q.score === null || q.score === undefined;
  const STAT_ROWS = [["Mean", "mean"], ["Median", "median"], ["Minimum", "min"], ["Maximum", "max"], ["Range", "range"], ["Variance", "variance"], ["Std deviation", "std"]];
  return (
    <div className="card p-5 space-y-6" data-testid="final-result">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold text-[#F8FAFC]">Final Learned Sensor Result</h2>
        <span className="text-[11px] text-[#94A3B8]">
          {r.measurement.sensor_id} · {r.measurement.sensor_type} ({r.measurement.unit}) · profile {r.measurement.profile} · formula {r.formula_version}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-lg border border-base-border p-4">
          <div className="text-[11px] text-[#94A3B8]">Sensor Accuracy / Quality Score</div>
          {noScore ? (
            <div className="text-xl font-bold text-[#94A3B8] mt-1">Unavailable</div>
          ) : (
            <div className="text-4xl font-bold text-[#F8FAFC] mt-1">{fmt(q.score, 1)}%</div>
          )}
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <Pill tone={OP_TONE[q.status] || "grey"}>{q.status}</Pill>
            <Pill tone={q.confidence.level === "HIGH" ? "green" : q.confidence.level === "MEDIUM" ? "amber" : "red"}>{q.confidence.level} confidence</Pill>
          </div>
          <p className="text-[10px] text-[#64748B] mt-2">
            Behaviour-based quality / stability score from this sensor&apos;s own readings. It is not verified measurement accuracy — no reference device was used.
          </p>
          {noScore && <p className="text-[11px] text-status-recovering mt-2">Not enough valid readings to calculate a score.</p>}
        </div>

        <div className="rounded-lg border border-base-border p-4">
          <div className="text-[11px] text-[#94A3B8]">Recommended operating status</div>
          <div className="mt-2"><Pill tone={OP_TONE[r.recommended_status.status] || "grey"}>{r.recommended_status.status}</Pill></div>
          <ul className="text-[11px] text-[#94A3B8] mt-2 list-disc ml-4 space-y-0.5">
            {r.recommended_status.reasons.map((x) => <li key={x}>{x}</li>)}
          </ul>
        </div>

        <div className="rounded-lg border border-base-border p-4">
          <div className="text-[11px] text-[#94A3B8]">Current Dynamic Trust Score</div>
          <div className="mt-2 max-w-[220px]">{liveTrust != null ? <TrustBar score={liveTrust} /> : <span className="text-sm text-[#64748B]">—</span>}</div>
          <p className="text-[11px] text-[#94A3B8] mt-2">
            At completion: {r.trust?.score != null ? `${fmt(r.trust.score, 0)}% (${r.trust.sensor_state || "—"})` : "—"}.
          </p>
          <p className="text-[10px] text-[#64748B] mt-1">Separate from the quality score: trust changes as new evidence arrives; quality summarises this test.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
        <KV label="Selected target" value={`${r.target_valid_readings} valid readings`} />
        <KV label="Actual valid readings" value={r.valid_readings} />
        <KV label="Interval" value={`${fmt(r.interval_seconds, 0)} s`} />
        <KV label="Invalid events" value={r.invalid_events.total} sub={`${r.invalid_events.sensor_side} sensor · ${r.invalid_events.communication} communication`} />
        <KV label="Duration" value={mmss(r.behaviour.duration_seconds)} />
      </div>

      <Sub title="Statistics of the collected readings">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[#94A3B8] border-b border-base-border">
                <th className="py-1.5 pr-4 font-medium" />
                <th className="py-1.5 pr-4 font-medium">Raw</th>
                <th className="py-1.5 pr-4 font-medium">Calibrated</th>
                <th className="py-1.5 pr-4 font-medium">Filtered</th>
              </tr>
            </thead>
            <tbody>
              {STAT_ROWS.map(([label, key]) => (
                <tr key={key} className="border-b border-base-border/50 last:border-0">
                  <td className="py-1.5 pr-4 text-[#94A3B8]">{label}</td>
                  {["raw", "calibrated", "filtered"].map((s) => (
                    <td key={s} className="py-1.5 pr-4 text-[#F8FAFC]">{fmt(st[s]?.[key], key === "variance" ? 5 : 3)}{["variance", "std"].includes(key) ? "" : ` ${unit || ""}`}</td>
                  ))}
                </tr>
              ))}
              <tr>
                <td className="py-1.5 pr-4 text-[#94A3B8]">Coefficient of variation</td>
                <td colSpan={3} className="py-1.5 pr-4 text-[#F8FAFC]">
                  {st.coefficient_of_variation_pct != null ? `${fmt(st.coefficient_of_variation_pct, 2)}% (calibrated)` : <span className="text-[#64748B]">n/a — {st.cv_note}</span>}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Sub>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Sub title="Calibration">
          <div className="space-y-1 text-xs">
            <div><Pill tone={r.calibration.valid ? (r.calibration.applied ? "green" : "grey") : "red"}>{r.calibration.status}</Pill></div>
            <p className="text-[#94A3B8]">{r.calibration.model}; offset {fmt(r.calibration.offset, 3)}, gain {fmt(r.calibration.gain, 4)}; mean correction {fmt(r.calibration.mean_correction, 3)} {unit}</p>
            {r.calibration.issues.length > 0 && <p className="text-status-faulty">Issues: {r.calibration.issues.join(", ")}</p>}
            <p className="text-[10px] text-[#64748B]">Not verified against a reference measurement.</p>
          </div>
        </Sub>
        <Sub title="Filtering">
          <div className="space-y-1 text-xs">
            <div><Pill tone="cyan">{r.filtering.method}</Pill></div>
            <p className="text-[#94A3B8]">
              {r.filtering.window != null && r.filtering.method !== "EMA" && r.filtering.method !== "NONE" ? `window ${r.filtering.window} · ` : ""}
              {r.filtering.alpha != null ? `alpha ${r.filtering.alpha} · ` : ""}
              noise reduction {r.filtering.noise_reduction_pct != null ? `${fmt(r.filtering.noise_reduction_pct, 1)}%` : "n/a"} · max change vs calibrated {fmt(r.filtering.max_deviation_from_calibrated, 3)} {unit}
            </p>
            <p className="text-[10px] text-[#64748B]">{r.filtering.note}</p>
          </div>
        </Sub>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Sub title="Learned baseline & historical behaviour">
          <div className="grid grid-cols-2 gap-3 text-xs">
            <KV label="Baseline mean ± std" value={`${fmt(r.baseline.mean, 3)} ± ${fmt(r.baseline.std, 4)}`} />
            <KV label="Min / Max" value={`${fmt(r.baseline.min)} / ${fmt(r.baseline.max)}`} />
            <KV label="Trend" value={`${fmt(r.behaviour.trend_per_minute, 4)} ${unit}/min`} sub={`drift over test ${fmt(r.behaviour.drift_over_session, 3)} (${fmt(r.behaviour.drift_in_std, 1)}σ)`} />
            <KV label="vs previous baseline" value={r.behaviour.previous_baseline ? `${fmt(r.behaviour.previous_baseline.shift, 3)} (${fmt(r.behaviour.previous_baseline.shift_in_std, 1)}σ)` : "no previous baseline"} />
          </div>
        </Sub>
        <Sub title={r.states ? "State behaviour" : "Variation & frozen-reading check"}>
          {r.states ? (
            <div className="grid grid-cols-2 gap-3 text-xs">
              <KV label="State 0 / 1" value={`${r.states.count_0} / ${r.states.count_1}`} />
              <KV label="Transitions" value={r.states.transitions} />
              <KV label="Duty cycle (on)" value={`${fmt(r.states.duty_cycle_pct, 1)}%`} />
              <KV label="Longest constant run" value={r.states.longest_constant_run} />
            </div>
          ) : (
            <div className="space-y-2 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <KV label="Reading-to-reading change" value={`avg ${fmt(r.variation.mean_abs_step, 4)} · max ${fmt(r.variation.max_step, 3)}`} />
                <KV label="Sudden changes" value={r.variation.sudden_changes} sub={r.variation.sudden_step_threshold != null ? `step > ${fmt(r.variation.sudden_step_threshold, 3)} ${unit}` : null} />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Pill tone={r.frozen.suspected ? "red" : r.frozen.assessed ? "green" : "grey"}>
                  {r.frozen.suspected ? "FROZEN SUSPECTED" : r.frozen.assessed ? "not frozen" : "frozen test not possible"}
                </Pill>
                <span className="text-[#94A3B8]">longest identical run {r.frozen.longest_identical_run} of {r.valid_readings}</span>
              </div>
              {r.frozen.explanation && <p className="text-[10px] text-[#94A3B8]">{r.frozen.explanation}</p>}
            </div>
          )}
        </Sub>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Sub title="AI anomalies">
          {r.ai.available ? (
            <div className="text-xs space-y-1">
              <KV label="Flagged" value={`${r.ai.anomalies} of ${r.ai.readings_evaluated} (${fmt(r.ai.anomaly_rate_pct, 1)}%)`} />
              {Object.keys(r.ai.reasons).length > 0 && <p className="text-[#94A3B8]">{Object.entries(r.ai.reasons).map(([k, v]) => `${k} ×${v}`).join(" · ")}</p>}
            </div>
          ) : <p className="text-xs text-[#94A3B8]">No AI result was recorded for these readings (excluded from the score, not assumed good).</p>}
        </Sub>
        <Sub title="Invalid events & communication">
          <div className="text-xs space-y-1">
            <div className="flex flex-wrap gap-1.5">
              {Object.keys(r.invalid_events.by_category || {}).length === 0 && <span className="text-[#94A3B8]">none</span>}
              {Object.entries(r.invalid_events.by_category || {}).map(([k, v]) => <span key={k} className="flex items-center gap-1"><CategoryBadge category={k} /> ×{v}</span>)}
            </div>
            <p className="text-[#94A3B8]">Communication reliability: {r.communication.reliability_pct != null ? `${fmt(r.communication.reliability_pct, 1)}%` : "n/a"} ({r.communication.readings_received} received, {r.communication.delivery_failures} lost)</p>
          </div>
        </Sub>
        <Sub title="Real vs virtual data-source history">
          <div className="flex flex-wrap gap-2 text-xs">
            {["REAL", "VIRTUAL", "REDUNDANT", "UNAVAILABLE"].map((k) => (
              <span key={k} className="flex items-center gap-1"><Pill tone={SRC_TONE[k]}>{k}</Pill> {r.source_history[k] ?? 0}</span>
            ))}
            {r.source_history.NOT_EVALUATED > 0 && <span className="text-[#64748B]">not evaluated {r.source_history.NOT_EVALUATED}</span>}
          </div>
        </Sub>
      </div>

      <Sub title="Final trusted value">
        {r.final_trusted ? (
          r.final_trusted.available ? (
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="text-xl font-bold text-[#F8FAFC]">{fmt(r.final_trusted.value, 3)} {unit}</span>
              <Pill tone={SRC_TONE[r.final_trusted.source] || "grey"}>{r.final_trusted.source}</Pill>
              <span className="text-[11px] text-[#94A3B8]">raw {fmt(r.final_trusted.raw_value, 3)} · latest at completion</span>
            </div>
          ) : (
            <div className="text-sm text-status-faulty">UNAVAILABLE — {r.final_trusted.reason || "no safe trusted value exists"}. Nothing is estimated.</div>
          )
        ) : <p className="text-xs text-[#94A3B8]">No trusted value has been produced for this sensor yet.</p>}
      </Sub>

      <Sub title="How the score was calculated">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[#94A3B8] border-b border-base-border">
                {["Factor", "Value", "Weight", "Contribution", "What it measures"].map((h) => <th key={h} className="py-1.5 pr-4 font-medium">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {q.factors.map((f) => (
                <tr key={f.key} className="border-b border-base-border/50 last:border-0 align-top">
                  <td className="py-1.5 pr-4 text-[#F8FAFC] font-semibold whitespace-nowrap">{f.label}</td>
                  <td className="py-1.5 pr-4 text-[#F8FAFC]">{f.available ? `${fmt(f.value, 1)}%` : <span className="text-[#64748B]">unavailable</span>}</td>
                  <td className="py-1.5 pr-4 text-[#94A3B8]">{f.weight}</td>
                  <td className="py-1.5 pr-4 text-[#F8FAFC]">{f.contribution != null ? fmt(f.contribution, 1) : "—"}</td>
                  <td className="py-1.5 pr-4 text-[#94A3B8]">{f.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-[#94A3B8] mt-3">
          Score = Σ(value × weight) ÷ Σ(weights of available factors). Formula <b>{q.formula.version}</b>: HEALTHY ≥ {q.formula.thresholds.healthy_min}, SUSPECT ≥ {q.formula.thresholds.suspect_min}, otherwise UNRELIABLE;
          fewer than {q.formula.thresholds.min_samples} readings → no score.
          {q.base_score_before_caps != null && q.caps.length > 0 && ` Base score ${fmt(q.base_score_before_caps, 1)}% before caps.`}
        </p>
        {q.caps.length > 0 && <p className="text-xs text-status-faulty mt-2">Score capped: {q.caps.map((c) => `${c.reason} → max ${c.max_score}%`).join("; ")}</p>}
        {q.cautions.length > 0 && <p className="text-xs text-status-recovering mt-1">Cautions: {q.cautions.join(", ")}</p>}
        <div className="mt-3">
          <div className="text-[11px] text-[#94A3B8] mb-1">Confidence: <b className="text-[#F8FAFC]">{q.confidence.level}</b> — {q.confidence.reasons.join("; ")}</div>
          <div className="text-[11px] text-[#94A3B8] mb-1">Limitations</div>
          <ul className="list-disc ml-4 text-[11px] text-[#94A3B8] space-y-0.5">{q.limitations.map((x) => <li key={x}>{x}</li>)}</ul>
        </div>
      </Sub>
    </div>
  );
}

export default function Learning() {
  const { data: sensors } = usePolling(() => listSensors(), [], 8000);
  const [selected, setSelected] = useState("");
  const sensorId = selected || sensors?.[0]?.sensor_id || "";
  const sensorInfo = (sensors || []).find((s) => s.sensor_id === sensorId);

  const { data: status, error: statusError, retry: reloadStatus } = useSafePolling(
    () => (sensorId ? getLearningStatus(sensorId) : Promise.resolve(null)), [sensorId], 2000
  );
  // After a failure, ask /health once (per distinct error) so the message can say WHY (old deploy vs unknown sensor vs down).
  const [healthInfo, setHealthInfo] = useState(null);
  useEffect(() => {
    if (!statusError) { setHealthInfo(null); return undefined; }
    let alive = true;
    getHealth().then((data) => alive && setHealthInfo({ ok: true, data })).catch((error) => alive && setHealthInfo({ ok: false, error }));
    return () => { alive = false; };
  }, [statusError?.status, statusError?.detail]); // eslint-disable-line react-hooks/exhaustive-deps
  const { data: readings } = usePolling(() => (sensorId ? listLearningReadings(sensorId) : Promise.resolve([])), [sensorId], 3000);
  const { data: invalid } = usePolling(
    () => (sensorId ? listInvalidReadings({ sensor_id: sensorId, limit: 100 }) : Promise.resolve([])), [sensorId], 3000
  );
  const { data: live } = usePolling(
    async () => {
      if (!sensorId) return null;
      const [h, p, t] = await Promise.allSettled([getSensorHealth(sensorId), getLatestPrediction(sensorId), getLatestTrustedReading(sensorId)]);
      return {
        health: h.status === "fulfilled" ? h.value : null,
        prediction: p.status === "fulfilled" ? p.value : null,
        trusted: t.status === "fulfilled" ? t.value : null,
      };
    },
    [sensorId], 2000
  );
  // Sensors of the same physical device (e.g. DHT22 temperature + humidity) are evaluated separately, one result each.
  const { data: dash } = useSafePolling(() => loadDashboard(), [], 5000);
  const device = useMemo(
    () => (dash?.devices || []).find((d) => d.sensors.length > 1 && d.sensors.some((s) => s.sensor_id === sensorId)) || null,
    [dash, sensorId]
  );

  // The form exists from the first render (sensible defaults), so the "Number of Readings" choice never depends on
  // the status request succeeding. When the sensor's stored calibration / filter config arrives it fills the form -
  // unless the user has already started editing.
  const [form, setForm] = useState(() => formFromProcessing(null, 10));
  const [formFor, setFormFor] = useState("");
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const touched = useRef(false);
  useEffect(() => {
    touched.current = false;
    setForm(formFromProcessing(null, sensorInfo?.sampling_interval_seconds || 10));
    setFormFor("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sensorId]);
  useEffect(() => {
    if (status?.sensor_id === sensorId && formFor !== sensorId) {
      if (!touched.current) setForm(formFromProcessing(status.processing, sensorInfo?.sampling_interval_seconds || 10));
      setFormFor(sensorId);
    }
  }, [status, sensorId, formFor, sensorInfo]);
  const setField = (k, v) => { touched.current = true; setForm((f) => ({ ...f, [k]: v })); };
  const check = validateConfig(form);

  async function run(fn, after) {
    setErr(null);
    setBusy(true);
    try { await fn(); await after?.(); } catch (e) { setErr(e.detail || e.message); } finally { setBusy(false); }
  }

  const prog = status?.progress;
  const pct = prog ? Math.min(100, (prog.valid_readings / prog.target_valid_readings) * 100) : 0;
  const collecting = prog?.collection_status === "COLLECTING";
  const analyzing = prog?.collection_status === "ANALYZING";
  const busyTest = collecting || analyzing;
  const lp = status?.latest_processed;
  const unit = status?.unit || "";
  const base = status?.baseline;
  const result = status?.result;
  const used = status?.session?.settings;
  const estimate = check.valid ? check.target * check.interval : null;

  // NOT STARTED / COLLECTING / COMPLETED / ERROR (plus the transient ANALYSING and a user-cancelled test)
  const sessionLabel = statusError && !status ? "ERROR"
    : !prog ? "NOT STARTED"
    : prog.analysis_error ? "ERROR"
    : collecting ? "COLLECTING"
    : analyzing ? "ANALYSING"
    : prog.collection_status === "COMPLETE" ? "COMPLETED" : "CANCELLED";
  const SESSION_TONE = { "NOT STARTED": "grey", COLLECTING: "cyan", ANALYSING: "amber", COMPLETED: "green", ERROR: "red", CANCELLED: "grey" };
  const trustedNow = live?.trusted;

  const baselineBadge = useMemo(() => {
    switch (status?.baseline_status) {
      case "READY": return "HEALTHY";
      case "COLLECTING": case "ANALYZING": return "RECOVERING";
      default: return "UNKNOWN";
    }
  }, [status]);

  return (
    <div>
      <Topbar title="Sensor Learning & Accuracy" subtitle="Collect configurable valid readings → learn baseline → calculate sensor quality score." />
      <div className="p-6 space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <select className="input max-w-xs" value={sensorId} onChange={(e) => setSelected(e.target.value)}>
            {(sensors || []).map((s) => <option key={s.sensor_id} value={s.sensor_id}>{s.sensor_id} — {s.name} ({s.sensor_type}, {s.unit})</option>)}
          </select>
          {status && <StatusBadge status={baselineBadge} />}
          {status && <span className="text-xs text-[#94A3B8]">Baseline: {status.baseline_status.replace("_", " ")}</span>}
        </div>
        {statusError && !status && (
          <ErrorBox info={explainLearningError(statusError, healthInfo, sensorId, getApiBase())} onRetry={reloadStatus} />
        )}
        {err && <div className="text-sm text-status-faulty bg-status-faulty/10 border border-status-faulty/30 rounded-lg px-3 py-2">{err}</div>}
        {!sensorId && <div className="card p-8 text-center text-sm text-[#94A3B8]">Add a sensor first.</div>}

        {sensorId && (
          <>
            {device && (
              <div className="card p-4">
                <div className="text-xs text-[#94A3B8] mb-2">
                  Device <b className="text-[#F8FAFC]">{device.name}</b>{device.model ? ` (${device.model})` : ""} — each measurement is analysed and scored separately; units are never mixed.
                </div>
                <div className="flex flex-wrap gap-2">
                  {device.sensors.map((s) => (
                    <button key={s.sensor_id} onClick={() => setSelected(s.sensor_id)}
                      className={`text-xs px-3 py-2 rounded-lg border text-left ${s.sensor_id === sensorId ? "border-accent-cyan bg-accent-cyan/10" : "border-base-border"}`}>
                      <div className="font-semibold text-[#F8FAFC]">{s.label} ({s.unit})</div>
                      <div className="text-[#94A3B8]">
                        {s.learning?.state === "COLLECTING" ? `collecting ${s.learning.reading_number}/${s.learning.target}`
                          : s.learning?.state === "ANALYZING" ? "analysing…"
                          : s.learning?.quality?.score != null ? `${fmt(s.learning.quality.score, 1)}% ${s.learning.quality.status}`
                          : "no test yet"}
                      </div>
                    </button>
                  ))}
                  {!busyTest && check.valid && (
                    <button disabled={busy} className="text-xs px-3 py-2 rounded-lg border border-base-border text-accent-cyan disabled:opacity-40"
                      onClick={() => run(async () => {
                        for (const s of device.sensors) {
                          if (s.sensor_id === sensorId || s.learning?.state === "COLLECTING" || s.learning?.state === "ANALYZING") continue;
                          await startLearning(s.sensor_id, { sensor_id: s.sensor_id, target_valid_readings: check.target, interval_seconds: check.interval });
                        }
                        await startLearning(sensorId, buildStartBody(sensorId, form));
                      }, reloadStatus)}>
                      Start all measurements of this device
                    </button>
                  )}
                </div>
                <p className="text-[10px] text-[#64748B] mt-2">The calibration and filter settings below apply to the selected measurement; the others keep their stored settings.</p>
              </div>
            )}

            {/* Learning progress + configuration */}
            <div className="card p-5">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="font-semibold text-[#F8FAFC]">Learning Progress</h2>
                  <Pill tone={SESSION_TONE[sessionLabel]}>{sessionLabel}</Pill>
                </div>
                {collecting && (
                  <button disabled={busy} className="text-sm font-semibold px-3 py-1.5 rounded-lg border border-base-border text-[#F8FAFC] disabled:opacity-40"
                    onClick={() => run(() => cancelLearning(sensorId), reloadStatus)}>Cancel test</button>
                )}
              </div>

              <div className="text-xs text-[#94A3B8] mb-3" data-testid="selected-measurement">
                Selected sensor &amp; measurement: <b className="text-[#F8FAFC]">{sensorId}</b>
                {sensorInfo?.name ? ` — ${sensorInfo.name}` : ""} · {sensorInfo?.sensor_type || "—"} ({unit || sensorInfo?.unit || "—"})
              </div>

              {!collecting && (
                <div className="mb-5 p-4 rounded-lg border border-base-border bg-base-bg/40 space-y-4" data-testid="config-form">
                  <div className="text-[11px] text-[#94A3B8]">
                    Measurement: <b className="text-[#F8FAFC]">{sensorInfo?.sensor_type || "—"}</b> in <b className="text-[#F8FAFC]">{unit || "—"}</b> ({sensorId})
                  </div>
                  <div className="flex flex-wrap items-start gap-4">
                    <Field label="Number of Readings" error={check.errors.target}>
                      <select className="input w-36 py-1.5" value={form.preset} onChange={(e) => setField("preset", e.target.value)}>
                        {PRESETS.map((n) => <option key={n} value={String(n)}>{n} valid readings</option>)}
                        <option value="custom">Custom…</option>
                      </select>
                    </Field>
                    {form.preset === "custom" && (
                      <Field label={`Custom number (${MIN_READINGS_UI}–${MAX_READINGS})`}>
                        <input type="number" min={MIN_READINGS_UI} max={MAX_READINGS} step="1" className="input w-32 py-1.5" value={form.customTarget} onChange={(e) => setField("customTarget", e.target.value)} />
                      </Field>
                    )}
                    <Field label="Interval (seconds)" error={check.errors.interval}>
                      <input type="number" min="1" max="3600" className="input w-28 py-1.5" value={form.interval} onChange={(e) => setField("interval", e.target.value)} />
                    </Field>
                    <Field label="Calibration offset" error={check.errors.offset}>
                      <input type="number" step="any" className="input w-28 py-1.5" value={form.offset} onChange={(e) => setField("offset", e.target.value)} />
                    </Field>
                    <Field label="Calibration gain" error={check.errors.gain}>
                      <input type="number" step="any" className="input w-28 py-1.5" value={form.gain} onChange={(e) => setField("gain", e.target.value)} />
                    </Field>
                    <Field label="Filter method" error={check.errors.method}>
                      <select className="input w-52 py-1.5" value={form.method} onChange={(e) => setField("method", e.target.value)}>
                        {FILTER_METHODS.map(([m, label]) => <option key={m} value={m}>{label}</option>)}
                      </select>
                    </Field>
                    {(form.method === "MEDIAN" || form.method === "MOVING_AVERAGE") && (
                      <Field label="Filter window (readings)" error={check.errors.window}>
                        <input type="number" min="1" max="21" step="1" className="input w-28 py-1.5" value={form.window} onChange={(e) => setField("window", e.target.value)} />
                      </Field>
                    )}
                    {form.method === "EMA" && (
                      <Field label="Filter alpha (0–1]" error={check.errors.alpha}>
                        <input type="number" min="0" max="1" step="0.05" className="input w-28 py-1.5" value={form.alpha} onChange={(e) => setField("alpha", e.target.value)} />
                      </Field>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-4">
                    <button disabled={busy || !check.valid}
                      className="text-sm font-semibold px-4 py-2 rounded-lg bg-gradient-to-r from-accent-blue to-accent-purple text-white disabled:opacity-40"
                      onClick={() => run(() => startLearning(sensorId, buildStartBody(sensorId, form)), reloadStatus)}>
                      Start Learning Test
                    </button>
                    <p className="text-[11px] text-[#94A3B8]">
                      {check.valid
                        ? `Collects ${check.target} valid readings, about one every ${check.interval}s — roughly ${mmss(estimate)} if none are invalid. Invalid readings do not count; they are recorded separately. Calibration and filter settings are saved with the test and used by this sensor's pipeline.`
                        : "Fix the highlighted fields to start."}
                    </p>
                  </div>
                </div>
              )}

              {!prog ? (
                <p className="text-sm text-[#94A3B8]">No learning test yet for this sensor (NOT STARTED). Choose the settings above and press Start Learning Test.</p>
              ) : (
                <>
                  <div className="text-xs text-[#94A3B8] mb-1">Target: <span className="text-[#F8FAFC] font-semibold">{prog.target_valid_readings} valid readings</span></div>
                  <div className="flex items-baseline justify-between mb-1">
                    <span className="text-2xl font-bold text-[#F8FAFC]">{prog.valid_readings} / {prog.target_valid_readings} valid readings</span>
                    <span className="text-xs font-semibold text-[#94A3B8]">
                      {collecting ? "Collecting…" : analyzing ? "Analysing…" : prog.collection_status === "COMPLETE" ? "COMPLETED" : "CANCELLED"}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-base-hover overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-accent-blue to-accent-purple transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mt-4">
                    <KV label="Valid" value={prog.valid_readings} />
                    <KV label="Invalid" value={prog.invalid_readings} />
                    <KV label="Fault events" value={prog.fault_events} />
                    <KV label="Communication events" value={prog.communication_events} />
                    <KV label="Interval" value={`${fmt(prog.interval_seconds, 0)} sec`} />
                    <KV label="Elapsed" value={mmss(prog.elapsed_seconds)} />
                    <KV label="Remaining (estimate)" value={collecting ? mmss(prog.remaining_seconds_estimate) : "00:00"} />
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm mt-4 pt-4 border-t border-base-border" data-testid="current-readings">
                    <KV label="Current raw reading" value={lp ? `${fmt(lp.raw_value)} ${unit}` : "—"} sub={lp && lp.valid === false ? `invalid: ${lp.fault_category}` : null} />
                    <KV label="Current calibrated reading" value={lp ? `${fmt(lp.calibrated_value)} ${unit}` : "—"} />
                    <KV label="Current filtered reading" value={lp ? `${fmt(lp.filtered_value)} ${unit}` : "—"} />
                    <KV label="Current trusted value" value={trustedNow ? (trustedNow.trusted_value != null ? `${fmt(trustedNow.trusted_value)} ${unit}` : "UNAVAILABLE") : "—"} />
                    <KV label="Source" value={trustedNow ? <Pill tone={SRC_TONE[trustedNow.source === "RAW" ? "REAL" : trustedNow.source] || "grey"}>{trustedNow.source === "RAW" ? "REAL" : trustedNow.source}</Pill> : "—"} />
                  </div>
                  {used && (
                    <p className="text-[11px] text-[#94A3B8] mt-3">
                      Settings used by this test: calibration offset {fmt(used.calibration_offset, 3)}, gain {fmt(used.calibration_gain, 4)} · filter {used.filter_method}
                      {used.filter_method === "EMA" ? ` (alpha ${used.filter_alpha})` : used.filter_method === "NONE" ? "" : ` (window ${used.filter_window})`}
                    </p>
                  )}
                  {analyzing && <p className="text-[11px] text-status-recovering mt-3">The last test is being analysed; you can already start another one.</p>}
                  {prog.analysis_error && (
                    <div className="mt-4 text-sm text-status-faulty bg-status-faulty/10 border border-status-faulty/30 rounded-lg px-3 py-2">
                      The readings were collected and the baseline saved, but the full analysis failed: {prog.analysis_error}. Start a new test to try again.
                    </div>
                  )}
                  {prog.collection_status === "COMPLETE" && (
                    <div className="mt-4 text-sm font-semibold text-status-healthy bg-status-healthy/10 border border-status-healthy/30 rounded-lg px-3 py-2">
                      Status: COMPLETED · Final Quality Score: {prog.final_quality_score != null ? `${fmt(prog.final_quality_score, 1)}%` : "unavailable (not enough valid readings)"}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Final Learned Sensor Result (persisted; survives refresh) */}
            {result ? (
              <FinalResult r={result} unit={unit} liveTrust={live?.health?.trust_score ?? null} />
            ) : (
              <div className="card p-5">
                <h2 className="font-semibold text-[#F8FAFC] mb-2">Final Learned Sensor Result</h2>
                {status?.quality ? (
                  <p className="text-sm text-[#94A3B8]">
                    An earlier test finished with the older formula ({status.quality.formula_version || "quality-v1"}): {fmt(status.quality.score, 1)}% {status.quality.status}, {status.quality.samples} readings.
                    Run a new test to get the full learned result.
                  </p>
                ) : (
                  <p className="text-sm text-[#94A3B8]">No quality test completed yet.</p>
                )}
              </div>
            )}

            {/* Live signal chain */}
            <div className="card p-5">
              <h2 className="font-semibold text-[#F8FAFC] mb-4">Live Signal Chain</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <KV label="Raw" value={lp ? `${fmt(lp.raw_value)} ${unit}` : "—"} />
                <KV label="Calibrated" value={lp ? `${fmt(lp.calibrated_value)} ${unit}` : "—"} />
                <KV label="Filtered" value={lp ? `${fmt(lp.filtered_value)} ${unit}` : "—"} />
                <KV label="Trusted" value={live?.trusted?.trusted_value != null ? `${fmt(live.trusted.trusted_value)} ${unit}` : live?.trusted ? "UNAVAILABLE" : "—"} />
                <KV label="Source" value={live?.trusted ? <StatusBadge status={live.trusted.source === "RAW" ? "REAL" : live.trusted.source} /> : "—"} />
                <KV label="AI anomaly" value={live?.prediction ? <StatusBadge status={live.prediction.is_fault ? "FAULTY" : "HEALTHY"} /> : "—"} />
                <KV label="Last reading valid?" value={lp ? (lp.valid ? "Yes" : `No — ${lp.fault_category}`) : "—"} />
                <KV label="Baseline deviation (z)" value={live?.prediction?.baseline_z != null ? fmt(live.prediction.baseline_z) : "—"} />
              </div>
              <div className="grid md:grid-cols-2 gap-4 mt-4">
                <div>
                  <div className="text-[11px] text-[#94A3B8] mb-1">Dynamic Trust Score</div>
                  {live?.health ? <TrustBar score={live.health.trust_score} /> : <span className="text-xs text-[#94A3B8]">No trust data yet</span>}
                </div>
                <div className="text-xs text-[#94A3B8] self-end">
                  Communication reliability (last {Math.round((status?.communication?.window_seconds || 600) / 60)} min):{" "}
                  <span className="text-[#F8FAFC] font-semibold">{status?.communication?.reliability_pct != null ? `${fmt(status.communication.reliability_pct, 1)}%` : "—"}</span>{" "}
                  ({status?.communication?.readings_received ?? 0} received, {status?.communication?.delivery_failures ?? 0} lost)
                </div>
              </div>
              {live?.prediction?.fault_reasons?.length > 0 && <p className="text-xs text-[#94A3B8] mt-3">Fault evidence: {live.prediction.fault_reasons.join(" · ")}</p>}
            </div>

            {/* Baseline */}
            <div className="card p-5">
              <h2 className="font-semibold text-[#F8FAFC] mb-4">Baseline (normal sensor behaviour)</h2>
              {!base ? (
                <p className="text-sm text-[#94A3B8]">Not available until a learning test reaches its target of valid readings.</p>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <KV label="Mean" value={`${fmt(base.mean, 3)} ${unit}`} />
                  <KV label="Median" value={`${fmt(base.median, 3)} ${unit}`} />
                  <KV label="Min / Max" value={`${fmt(base.min)} / ${fmt(base.max)}`} />
                  <KV label="Std deviation" value={fmt(base.std, 4)} />
                  <KV label="Normal variation (MAD)" value={fmt(base.normal_variation, 4)} />
                  <KV label="Rate of change (mean)" value={`${fmt(base.rate_of_change_per_s_mean, 5)} /s`} />
                  <KV label="Rate of change (max)" value={`${fmt(base.rate_of_change_per_s_max, 5)} /s`} />
                  <KV label="Readings used" value={base.n} />
                </div>
              )}
            </div>

            {/* Tables */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <div className="card p-5 overflow-x-auto">
                <h2 className="font-semibold text-[#F8FAFC] mb-3">Valid Readings ({readings?.length ?? 0})</h2>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-[#94A3B8] border-b border-base-border">
                      {["#", "Time", "Raw", "Calibrated", "Filtered", "AI", "Trusted", "Source"].map((h) => <th key={h} className="py-2 pr-3 font-medium">{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {(readings || []).map((x) => (
                      <tr key={x.id} className="border-b border-base-border/50 last:border-0">
                        <td className="py-1.5 pr-3 text-[#F8FAFC] font-semibold">{x.reading_number}</td>
                        <td className="py-1.5 pr-3 text-[#94A3B8]">{new Date(x.timestamp).toLocaleTimeString()}</td>
                        <td className="py-1.5 pr-3 text-[#F8FAFC]">{fmt(x.raw_value)}</td>
                        <td className="py-1.5 pr-3 text-[#F8FAFC]">{fmt(x.calibrated_value)}</td>
                        <td className="py-1.5 pr-3 text-[#F8FAFC]">{fmt(x.filtered_value)}</td>
                        <td className="py-1.5 pr-3">{x.ai_is_fault == null ? <span className="text-[#64748B]">—</span> : x.ai_is_fault ? <span className="text-status-faulty">anomaly</span> : <span className="text-status-healthy">normal</span>}</td>
                        <td className="py-1.5 pr-3 text-[#F8FAFC]">{x.trusted_available === false ? <span className="text-status-faulty">unavailable</span> : fmt(x.trusted_value)}</td>
                        <td className="py-1.5 pr-3">{x.source ? <Pill tone={SRC_TONE[x.source] || "grey"}>{x.source}</Pill> : <span className="text-[#64748B]">—</span>}</td>
                      </tr>
                    ))}
                    {readings && readings.length === 0 && <tr><td colSpan={8} className="py-6 text-center text-[#94A3B8]">No valid readings collected yet.</td></tr>}
                  </tbody>
                </table>
              </div>

              <div className="card p-5 overflow-x-auto">
                <h2 className="font-semibold text-[#F8FAFC] mb-3">Fault / Anomaly Events ({invalid?.length ?? 0})</h2>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-[#94A3B8] border-b border-base-border">
                      {["Time", "Category", "Raw", "Validation", "Comms", "Reason"].map((h) => <th key={h} className="py-2 pr-3 font-medium">{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {(invalid || []).map((e) => (
                      <tr key={e.id} className="border-b border-base-border/50 last:border-0 align-top">
                        <td className="py-1.5 pr-3 text-[#94A3B8] whitespace-nowrap">{new Date(e.timestamp).toLocaleTimeString()}</td>
                        <td className="py-1.5 pr-3"><CategoryBadge category={e.fault_category} /></td>
                        <td className="py-1.5 pr-3 text-[#F8FAFC]">{fmt(e.raw_value)}</td>
                        <td className="py-1.5 pr-3 text-[#94A3B8]">{e.validation_status}</td>
                        <td className="py-1.5 pr-3 text-[#94A3B8]">{e.communication_status}</td>
                        <td className="py-1.5 pr-3 text-[#94A3B8] break-words">{e.reason}</td>
                      </tr>
                    ))}
                    {invalid && invalid.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-[#94A3B8]">No invalid events recorded.</td></tr>}
                  </tbody>
                </table>
                <p className="text-[11px] text-[#64748B] mt-3">
                  Red = evidence about the sensor itself (affects trust). Amber = delivery/communication evidence (lowers communication reliability, not sensor trust).
                </p>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
