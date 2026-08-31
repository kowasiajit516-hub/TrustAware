import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Topbar from "../components/Topbar.jsx";
import { getSensor, createSensor, updateSensor, listNodes } from "../api/client.js";

const SENSOR_TYPES = [
  "TEMPERATURE",
  "HUMIDITY",
  "LIGHT",
  "GAS",
  "SMOKE",
  "PRESSURE",
  "AIR_QUALITY",
  "SOIL_MOISTURE",
  "VIBRATION",
  "WATER_LEVEL",
  "MOTION",
  "CURRENT",
  "VOLTAGE",
  "CUSTOM",
];

const EMPTY = {
  sensor_id: "",
  name: "",
  sensor_type: "TEMPERATURE",
  unit: "",
  location: "",
  node_id: "",
  normal_min: 0,
  normal_max: 100,
  sampling_interval_seconds: 5,
  enabled: true,
};

export default function SensorManagement() {
  const { sensorId } = useParams();
  const isEdit = Boolean(sensorId);
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
    getSensor(sensorId)
      .then((s) =>
        setForm({
          sensor_id: s.sensor_id,
          name: s.name,
          sensor_type: s.sensor_type,
          unit: s.unit,
          location: s.location,
          node_id: s.node_id || "",
          normal_min: s.normal_min,
          normal_max: s.normal_max,
          sampling_interval_seconds: s.sampling_interval_seconds,
          enabled: s.enabled,
        })
      )
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [isEdit, sensorId]);

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      if (isEdit) {
        const { sensor_id, ...updatable } = form;
        await updateSensor(sensorId, {
          ...updatable,
          node_id: updatable.node_id || null,
          normal_min: Number(updatable.normal_min),
          normal_max: Number(updatable.normal_max),
          sampling_interval_seconds: Number(updatable.sampling_interval_seconds),
        });
      } else {
        await createSensor({
          ...form,
          node_id: form.node_id || null,
          normal_min: Number(form.normal_min),
          normal_max: Number(form.normal_max),
          sampling_interval_seconds: Number(form.sampling_interval_seconds),
        });
      }
      navigate("/sensors");
    } catch (err) {
      setError(err.detail || err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <Topbar
        title={isEdit ? `Edit Sensor · ${sensorId}` : "Add Sensor"}
        subtitle="Any sensor type — the backend never hardcodes per-type logic"
      />
      <div className="p-6 max-w-2xl">
        {loading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : (
          <form onSubmit={handleSubmit} className="card p-6 space-y-4">
            {error && (
              <div className="text-sm text-status-faulty bg-status-faulty/10 border border-status-faulty/30 rounded-lg px-3 py-2">
                {error}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <Field label="Sensor ID" required>
                <input
                  className="input"
                  value={form.sensor_id}
                  disabled={isEdit}
                  onChange={(e) => set("sensor_id", e.target.value)}
                  placeholder="TEMP_01"
                  required
                />
              </Field>
              <Field label="Name" required>
                <input
                  className="input"
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="Room Temperature"
                  required
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Sensor Type" required>
                <select
                  className="input"
                  value={form.sensor_type}
                  onChange={(e) => set("sensor_type", e.target.value)}
                >
                  {SENSOR_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Unit" required>
                <input
                  className="input"
                  value={form.unit}
                  onChange={(e) => set("unit", e.target.value)}
                  placeholder="°C"
                  required
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Location" required>
                <input
                  className="input"
                  value={form.location}
                  onChange={(e) => set("location", e.target.value)}
                  placeholder="Lab 1"
                  required
                />
              </Field>
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
            </div>

            <div className="grid grid-cols-3 gap-4">
              <Field label="Normal Min" required>
                <input
                  type="number"
                  step="any"
                  className="input"
                  value={form.normal_min}
                  onChange={(e) => set("normal_min", e.target.value)}
                  required
                />
              </Field>
              <Field label="Normal Max" required>
                <input
                  type="number"
                  step="any"
                  className="input"
                  value={form.normal_max}
                  onChange={(e) => set("normal_max", e.target.value)}
                  required
                />
              </Field>
              <Field label="Sampling Interval (s)">
                <input
                  type="number"
                  min={1}
                  max={3600}
                  className="input"
                  value={form.sampling_interval_seconds}
                  onChange={(e) => set("sampling_interval_seconds", e.target.value)}
                />
              </Field>
            </div>

            <label className="flex items-center gap-2 text-sm text-slate-300">
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
                className="px-4 py-2 rounded-lg text-sm font-medium bg-gradient-to-r from-accent-blue to-accent-purple text-white hover:opacity-90 disabled:opacity-50"
              >
                {saving ? "Saving…" : isEdit ? "Save Changes" : "Add Sensor"}
              </button>
              <button
                type="button"
                onClick={() => navigate("/sensors")}
                className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-slate-200"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
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
