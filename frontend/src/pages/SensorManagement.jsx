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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
                {saving ? "Saving…" : isEdit ? "Save Changes" : "Add Sensor"}
              </button>
              <button
                type="button"
                onClick={() => navigate("/sensors")}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-[#94A3B8] hover:text-[#F8FAFC]"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {!loading && (
          <div className="card p-5 space-y-3">
            <h3 className="text-sm font-semibold text-[#F8FAFC]">Sensor Type Reference</h3>
            <p className="text-[11px] text-[#94A3B8] -mt-2">
              You can add any sensor type. No code changes required — this list is just a guide.
            </p>
            <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
              {SENSOR_TYPES.filter((t) => t !== "CUSTOM").map((t) => {
                const info = SENSOR_TYPE_INFO[t];
                return (
                  <div key={t} className="border-b border-base-border/60 pb-2.5 last:border-0">
                    <div className="text-xs font-semibold text-[#F8FAFC]">{t}</div>
                    <div className="text-[11px] text-[#94A3B8]">
                      {info.unit} · {info.examples}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Typical unit and example use-cases per sensor type - purely a
// reference guide shown next to the form. It doesn't restrict what
// you can actually enter for Unit/Type; the backend accepts any type.
const SENSOR_TYPE_INFO = {
  TEMPERATURE: { unit: "°C", examples: "Room, equipment" },
  HUMIDITY: { unit: "%", examples: "Environment" },
  LIGHT: { unit: "lux", examples: "Indoor / outdoor" },
  GAS: { unit: "ppm", examples: "Air quality" },
  SMOKE: { unit: "ppm / boolean", examples: "Fire safety" },
  PRESSURE: { unit: "kPa / bar", examples: "HVAC, pipelines" },
  AIR_QUALITY: { unit: "AQI / ppm", examples: "Indoor air monitoring" },
  SOIL_MOISTURE: { unit: "%", examples: "Agriculture, irrigation" },
  VIBRATION: { unit: "mm/s / g", examples: "Machinery health" },
  WATER_LEVEL: { unit: "cm / %", examples: "Tanks, flood detection" },
  MOTION: { unit: "boolean", examples: "Security" },
  CURRENT: { unit: "A", examples: "Power monitoring" },
  VOLTAGE: { unit: "V", examples: "Power monitoring" },
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
