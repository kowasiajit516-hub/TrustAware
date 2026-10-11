import { useState } from "react";
import { Zap } from "lucide-react";
import { injectFault } from "../api/client.js";

const FAULT_TYPES = [
  { value: "SPIKE", label: "Spike", description: "Sudden high or low value" },
  { value: "SUDDEN_OFFSET", label: "Sudden Offset", description: "Constant offset from normal" },
  { value: "FROZEN", label: "Frozen", description: "Value stops changing" },
  { value: "STUCK", label: "Stuck", description: "Value stops changing (same as Frozen)" },
  { value: "DRIFT", label: "Drift", description: "Gradual increase or decrease" },
  { value: "MISSING", label: "Missing", description: "No data / sensor dropout" },
  { value: "COMMUNICATION", label: "Communication", description: "Communication error / invalid data" },
];

// hideSensorSelect: when a parent page already chose the sensor (Fault
// Injection page / Sensor Details), hide the redundant dropdown.
// onInjected: optional callback fired after a successful injection so the
// parent can refresh its live view immediately.
export default function FaultInjectionPanel({ sensors, hideSensorSelect = false, onInjected }) {
  const [sensorId, setSensorId] = useState("");
  const [faultType, setFaultType] = useState("SPIKE");
  const [offset, setOffset] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const effectiveSensorId = sensorId || sensors?.[0]?.sensor_id || "";
  const selectedType = FAULT_TYPES.find((t) => t.value === faultType);

  async function handleInject() {
    if (!effectiveSensorId) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await injectFault(
        effectiveSensorId,
        faultType,
        offset === "" ? undefined : Number(offset)
      );
      setResult(res);
      onInjected?.(res);
    } catch (err) {
      setError(err.detail || err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-4">
        <Zap size={16} className="text-status-recovering" />
        <h2 className="font-semibold text-[#F8FAFC]">Fault Injection</h2>
      </div>
      <p className="text-[11px] text-[#94A3B8] mb-4">
        Sends a corrupted value through the real ingestion pipeline (same
        validation, AI detection, trust scoring, and virtual sensing as a
        real reading) so you can watch the self-healing loop react live.
      </p>

      <div className="space-y-3">
        {!hideSensorSelect && (
          <label className="block">
            <span className="block text-xs font-medium text-[#94A3B8] mb-1">Select Sensor</span>
            <select
              className="input"
              value={effectiveSensorId}
              onChange={(e) => setSensorId(e.target.value)}
            >
              {(sensors || []).map((s) => (
                <option key={s.sensor_id} value={s.sensor_id}>
                  {s.sensor_id} — {s.sensor_type}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="block">
          <span className="block text-xs font-medium text-[#94A3B8] mb-1">Fault Type</span>
          <select className="input" value={faultType} onChange={(e) => setFaultType(e.target.value)}>
            {FAULT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          {selectedType && (
            <span className="block text-[10px] text-[#94A3B8] mt-1">{selectedType.description}</span>
          )}
        </label>

        <label className="block">
          <span className="block text-xs font-medium text-[#94A3B8] mb-1">
            Offset (optional — random if blank, ignored for Missing)
          </span>
          <input
            type="number"
            step="any"
            className="input"
            placeholder="e.g. 15"
            value={offset}
            onChange={(e) => setOffset(e.target.value)}
            disabled={faultType === "MISSING"}
          />
        </label>

        <button
          onClick={handleInject}
          disabled={busy || !effectiveSensorId}
          className="w-full py-2 rounded-lg text-sm font-semibold bg-status-faulty/90 text-white hover:bg-status-faulty disabled:opacity-50"
        >
          {busy ? "Injecting…" : "Inject Fault"}
        </button>

        {error && (
          <div className="text-xs text-status-faulty bg-status-faulty/10 border border-status-faulty/30 rounded-lg px-3 py-2">
            {error}
          </div>
        )}
        {result && result.fault_type === "MISSING" && (
          <div className="text-xs text-status-recovering bg-status-recovering/10 border border-status-recovering/30 rounded-lg px-3 py-2">
            {result.note}
          </div>
        )}
        {result && result.fault_type !== "MISSING" && (
          <div className="text-xs text-[#F8FAFC] bg-base-bg border border-base-border rounded-lg px-3 py-2">
            Injected <span className="font-semibold">{result.fault_type}</span> on{" "}
            <span className="font-semibold">{result.sensor_id}</span>: value ={" "}
            <span className="font-mono">{result.injected_value}</span>
          </div>
        )}
      </div>
    </div>
  );
}
