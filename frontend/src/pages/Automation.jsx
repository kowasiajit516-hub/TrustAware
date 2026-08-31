import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import Topbar from "../components/Topbar.jsx";
import { usePolling } from "../hooks/usePolling.js";
import {
  listRules,
  deleteRule,
  createRule,
  listSensors,
  listActuators,
} from "../api/client.js";

const CONDITIONS = ["GREATER_THAN", "GREATER_THAN_OR_EQUAL", "LESS_THAN", "LESS_THAN_OR_EQUAL", "EQUAL"];
const ACTIONS = ["ON", "OFF"];

const EMPTY = {
  rule_id: "",
  name: "",
  sensor_id: "",
  actuator_id: "",
  condition: "GREATER_THAN_OR_EQUAL",
  threshold: 0,
  action: "ON",
  reset_threshold: "",
  reset_action: "",
  enabled: true,
};

export default function Automation() {
  const { data: rules, reload } = usePolling(() => listRules(), [], 6000);
  const [sensors, setSensors] = useState([]);
  const [actuators, setActuators] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    listSensors().then(setSensors).catch(() => setSensors([]));
    listActuators().then(setActuators).catch(() => setActuators([]));
  }, []);

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleCreate(e) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await createRule({
        ...form,
        threshold: Number(form.threshold),
        reset_threshold: form.reset_threshold === "" ? null : Number(form.reset_threshold),
        reset_action: form.reset_action === "" ? null : form.reset_action,
      });
      setForm(EMPTY);
      setShowForm(false);
      await reload();
    } catch (err) {
      setError(err.detail || err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(ruleId) {
    if (!confirm(`Delete rule ${ruleId}?`)) return;
    setBusy(ruleId);
    try {
      await deleteRule(ruleId);
      await reload();
    } catch (err) {
      setError(err.detail || err.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <Topbar
        title="Automation Rules"
        subtitle="Link a sensor to an actuator with a threshold. Evaluation engine ships in Phase 9 — rules are stored and validated now."
      />
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-500">
            {rules ? `${rules.length} rule${rules.length === 1 ? "" : "s"}` : "Loading…"}
          </p>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg bg-gradient-to-r from-accent-blue to-accent-purple text-white hover:opacity-90"
          >
            <Plus size={16} /> New Rule
          </button>
        </div>

        {error && (
          <div className="text-sm text-status-faulty bg-status-faulty/10 border border-status-faulty/30 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        {showForm && (
          <form onSubmit={handleCreate} className="card p-5 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Rule ID" required>
                <input className="input" value={form.rule_id} onChange={(e) => set("rule_id", e.target.value)} required />
              </Field>
              <Field label="Name" required>
                <input className="input" value={form.name} onChange={(e) => set("name", e.target.value)} required />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Sensor" required>
                <select className="input" value={form.sensor_id} onChange={(e) => set("sensor_id", e.target.value)} required>
                  <option value="">— Select —</option>
                  {sensors.map((s) => (
                    <option key={s.sensor_id} value={s.sensor_id}>
                      {s.sensor_id}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Actuator" required>
                <select className="input" value={form.actuator_id} onChange={(e) => set("actuator_id", e.target.value)} required>
                  <option value="">— Select —</option>
                  {actuators.map((a) => (
                    <option key={a.actuator_id} value={a.actuator_id}>
                      {a.actuator_id}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <Field label="Condition">
                <select className="input" value={form.condition} onChange={(e) => set("condition", e.target.value)}>
                  {CONDITIONS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Threshold" required>
                <input type="number" step="any" className="input" value={form.threshold} onChange={(e) => set("threshold", e.target.value)} required />
              </Field>
              <Field label="Action">
                <select className="input" value={form.action} onChange={(e) => set("action", e.target.value)}>
                  {ACTIONS.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Reset Threshold (optional)">
                <input type="number" step="any" className="input" value={form.reset_threshold} onChange={(e) => set("reset_threshold", e.target.value)} />
              </Field>
              <Field label="Reset Action (optional)">
                <select className="input" value={form.reset_action} onChange={(e) => set("reset_action", e.target.value)}>
                  <option value="">— None —</option>
                  {ACTIONS.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="flex items-center gap-3">
              <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg text-sm font-medium bg-gradient-to-r from-accent-blue to-accent-purple text-white hover:opacity-90 disabled:opacity-50">
                {saving ? "Saving…" : "Create Rule"}
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-slate-200">
                Cancel
              </button>
            </div>
          </form>
        )}

        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 text-xs border-b border-base-border bg-base-bg/40">
                <th className="py-3 px-4 font-medium">Rule ID</th>
                <th className="py-3 px-4 font-medium">Name</th>
                <th className="py-3 px-4 font-medium">Sensor</th>
                <th className="py-3 px-4 font-medium">Condition</th>
                <th className="py-3 px-4 font-medium">Actuator</th>
                <th className="py-3 px-4 font-medium">Action</th>
                <th className="py-3 px-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {!rules && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">
                    Loading rules…
                  </td>
                </tr>
              )}
              {rules && rules.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-slate-500">
                    No automation rules yet.
                  </td>
                </tr>
              )}
              {rules?.map((r) => (
                <tr key={r.rule_id} className="border-b border-base-border/60 last:border-0 hover:bg-base-hover/50">
                  <td className="py-3 px-4 font-semibold text-slate-100">{r.rule_id}</td>
                  <td className="py-3 px-4 text-slate-300">{r.name}</td>
                  <td className="py-3 px-4 text-slate-400">{r.sensor_id}</td>
                  <td className="py-3 px-4 text-slate-400">
                    {r.condition.replaceAll("_", " ").toLowerCase()} {r.threshold}
                  </td>
                  <td className="py-3 px-4 text-slate-400">{r.actuator_id}</td>
                  <td className="py-3 px-4 text-slate-400">{r.action}</td>
                  <td className="py-3 px-4 text-right">
                    <button
                      disabled={busy === r.rule_id}
                      onClick={() => handleDelete(r.rule_id)}
                      className="p-1.5 rounded-md hover:bg-base-hover text-slate-400 hover:text-status-faulty disabled:opacity-40"
                      title="Delete"
                    >
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Field({ label, required, children }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-slate-400 mb-1">
        {label} {required && <span className="text-status-faulty">*</span>}
      </span>
      {children}
    </label>
  );
}
