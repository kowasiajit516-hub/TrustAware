import { useEffect, useState } from "react";
import { Info } from "lucide-react";
import Topbar from "../components/Topbar.jsx";
import { getSettings, updateSettings } from "../api/client.js";

const FIELDS = [
  {
    key: "fault_penalty",
    label: "Trust Fault Decrement",
    help: "Trust points subtracted from a sensor's score each time a reading is flagged is_fault=True.",
  },
  {
    key: "recovery_gain",
    label: "Trust Recovery Increment",
    help: "Trust points added back each time a reading is flagged is_fault=False.",
  },
  {
    key: "faulty_threshold",
    label: "Fault Trust Threshold",
    help: "trust_score below this value marks the sensor FAULTY.",
  },
  {
    key: "healthy_threshold",
    label: "Healthy Trust Threshold",
    help: "trust_score at or above this value marks the sensor HEALTHY. Between the two thresholds is RECOVERING.",
  },
  {
    key: "trust_max",
    label: "Trust Max / Initial Value",
    help: "Ceiling for trust_score, and the starting value for a brand-new sensor's first reading.",
  },
  {
    key: "trust_min",
    label: "Trust Min",
    help: "Floor for trust_score - it will never drop below this.",
  },
];

export default function Settings() {
  const [values, setValues] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getSettings()
      .then(setValues)
      .catch((err) => setError(err.detail || err.message));
  }, []);

  function set(key, v) {
    setValues((cur) => ({ ...cur, [key]: v }));
    setSaved(false);
  }

  async function handleSave(e) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const payload = {};
      FIELDS.forEach((f) => {
        payload[f.key] = values[f.key] === "" ? null : Number(values[f.key]);
      });
      const updated = await updateSettings(payload);
      setValues(updated);
      setSaved(true);
    } catch (err) {
      setError(err.detail || err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <Topbar
        title="Settings"
        subtitle="Real, live-adjustable trust-engine parameters — changes take effect on the next reading, no restart needed"
      />
      <div className="p-6 max-w-2xl space-y-4">
        <div className="flex items-start gap-2 rounded-lg border border-accent-cyan/30 bg-accent-cyan/5 px-3 py-2.5">
          <Info size={14} className="text-accent-cyan shrink-0 mt-0.5" />
          <p className="text-xs text-[#94A3B8] leading-relaxed">
            Only parameters that genuinely control something today are listed here. The
            Isolation Forest's fault-detection boundary is baked into the trained model file
            (not runtime-adjustable), and automation/actuator thresholds don't exist yet
            (Phase 9) — so neither is faked as a working setting.
          </p>
        </div>

        {error && (
          <div className="text-sm text-status-faulty bg-status-faulty/10 border border-status-faulty/30 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        {!values ? (
          <p className="text-sm text-[#94A3B8]">Loading…</p>
        ) : (
          <form onSubmit={handleSave} className="card p-6 space-y-5">
            {FIELDS.map((f) => (
              <label key={f.key} className="block">
                <span className="block text-sm font-semibold text-[#F8FAFC] mb-1">{f.label}</span>
                <span className="block text-[11px] text-[#94A3B8] mb-1.5">{f.help}</span>
                <input
                  type="number"
                  step="any"
                  min={0}
                  max={100}
                  className="input max-w-[160px]"
                  value={values[f.key]}
                  onChange={(e) => set(f.key, e.target.value)}
                />
              </label>
            ))}

            <div className="flex items-center gap-3 pt-2">
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-gradient-to-r from-accent-blue to-accent-purple text-white hover:opacity-90 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save Settings"}
              </button>
              {saved && <span className="text-xs text-status-healthy">Saved — now live.</span>}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
