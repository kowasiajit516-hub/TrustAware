import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Topbar from "../components/Topbar.jsx";
import { getActuator, createActuator, updateActuator, listNodes } from "../api/client.js";

const ACTUATOR_TYPES = [
  "FAN",
  "LED",
  "BUZZER",
  "PUMP",
  "RELAY",
  "MOTOR",
  "LIGHT",
  "VALVE",
  "SERVO",
  "CUSTOM",
];

const EMPTY = {
  actuator_id: "",
  name: "",
  actuator_type: "FAN",
  location: "",
  node_id: "",
  mode: "AUTO",
  enabled: true,
};

export default function ActuatorManagement() {
  const { actuatorId } = useParams();
  const isEdit = Boolean(actuatorId);
  const navigate = useNavigate();

  const [form, setForm] = useState(EMPTY);
  const [nodes, setNodes] = useState([]);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    listNodes().then(setNodes).catch(() => setNodes([]));
  }, []);

  useEffect(() => {
    if (!isEdit) return;
    getActuator(actuatorId)
      .then((a) =>
        setForm({
          actuator_id: a.actuator_id,
          name: a.name,
          actuator_type: a.actuator_type,
          location: a.location,
          node_id: a.node_id || "",
          mode: a.mode,
          enabled: a.enabled,
        })
      )
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [isEdit, actuatorId]);

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      if (isEdit) {
        const { actuator_id, ...updatable } = form;
        await updateActuator(actuatorId, { ...updatable, node_id: updatable.node_id || null });
      } else {
        await createActuator({ ...form, node_id: form.node_id || null });
      }
      navigate("/actuators");
    } catch (err) {
      setError(err.detail || err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <Topbar
        title={isEdit ? `Edit Actuator · ${actuatorId}` : "Add Actuator"}
        subtitle="Any actuator type — generic architecture, no per-type backend logic"
      />
      <div className="p-6 max-w-5xl grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {loading ? (
          <p className="text-sm text-[#94A3B8]">Loading…</p>
        ) : (
          <form onSubmit={handleSubmit} className="card p-6 space-y-4 lg:col-span-2">
            {error && (
              <div className="text-sm text-status-faulty bg-status-faulty/10 border border-status-faulty/30 rounded-lg px-3 py-2">
                {error}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Actuator ID" required>
                <input
                  className="input"
                  value={form.actuator_id}
                  disabled={isEdit}
                  onChange={(e) => set("actuator_id", e.target.value)}
                  placeholder="FAN_01"
                  required
                />
              </Field>
              <Field label="Name" required>
                <input
                  className="input"
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="Cooling Fan"
                  required
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Actuator Type" required>
                <select
                  className="input"
                  value={form.actuator_type}
                  onChange={(e) => set("actuator_type", e.target.value)}
                >
                  {ACTUATOR_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Location" required>
                <input
                  className="input"
                  value={form.location}
                  onChange={(e) => set("location", e.target.value)}
                  placeholder="Lab 1"
                  required
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Node (optional)">
                <select
                  className="input"
                  value={form.node_id}
                  onChange={(e) => set("node_id", e.target.value)}
                >
                  <option value="">— None —</option>
                  {nodes.map((n) => (
                    <option key={n.node_id} value={n.node_id}>
                      {n.node_id} ({n.name})
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Mode">
                <select className="input" value={form.mode} onChange={(e) => set("mode", e.target.value)}>
                  <option value="AUTO">AUTO</option>
                  <option value="MANUAL">MANUAL</option>
                </select>
              </Field>
            </div>

            <label className="flex items-center gap-2 text-sm text-[#F8FAFC]">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(e) => set("enabled", e.target.checked)}
                className="accent-accent-cyan"
              />
              Enabled
            </label>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-gradient-to-r from-accent-blue to-accent-purple text-white hover:opacity-90 disabled:opacity-50"
              >
                {saving ? "Saving…" : isEdit ? "Save Changes" : "Add Actuator"}
              </button>
              <button
                type="button"
                onClick={() => navigate("/actuators")}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-[#94A3B8] hover:text-[#F8FAFC]"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {!loading && (
          <div className="card p-5 space-y-3">
            <h3 className="text-sm font-semibold text-[#F8FAFC]">Common Actuator Types</h3>
            <p className="text-[11px] text-[#94A3B8] -mt-2">
              You can add any actuator type. No code changes required — this list is just a guide.
            </p>
            <div className="space-y-2.5">
              {ACTUATOR_TYPES.filter((t) => t !== "CUSTOM").map((t) => (
                <div key={t} className="border-b border-base-border/60 pb-2.5 last:border-0">
                  <div className="text-xs font-semibold text-[#F8FAFC]">{t}</div>
                  <div className="text-[11px] text-[#94A3B8]">{ACTUATOR_TYPE_INFO[t]}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Typical purpose per actuator type - purely a reference guide shown
// next to the form. Doesn't restrict what you can actually enter; the
// backend accepts any type generically.
const ACTUATOR_TYPE_INFO = {
  FAN: "Cooling / ventilation",
  LED: "Lighting / indication",
  BUZZER: "Alerts / alarms",
  PUMP: "Fluid control",
  RELAY: "Switch control",
  MOTOR: "Motion control",
  LIGHT: "Room / area lighting",
  VALVE: "Flow control",
  SERVO: "Position control",
};

function Field({ label, required, children }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-[#94A3B8] mb-1">
        {label} {required && <span className="text-status-faulty">*</span>}
      </span>
      {children}
    </label>
  );
}
