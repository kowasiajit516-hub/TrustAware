import { useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Pencil, Trash2, Power, PowerOff } from "lucide-react";
import Topbar from "../components/Topbar.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import TrustBar from "../components/TrustBar.jsx";
import { usePolling } from "../hooks/usePolling.js";
import { listSensors, deleteSensor, enableSensor, disableSensor } from "../api/client.js";

export default function Sensors() {
  const { data: sensors, reload } = usePolling(() => listSensors(), [], 5000);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  async function handleDelete(sensorId) {
    if (!confirm(`Delete sensor ${sensorId}? This cannot be undone.`)) return;
    setBusy(sensorId);
    try {
      await deleteSensor(sensorId);
      await reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  async function handleToggle(sensor) {
    setBusy(sensor.sensor_id);
    try {
      if (sensor.enabled) await disableSensor(sensor.sensor_id);
      else await enableSensor(sensor.sensor_id);
      await reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <Topbar title="Sensors" subtitle="All registered sensors, any type — no code changes required" />
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-500">
            {sensors ? `${sensors.length} sensor${sensors.length === 1 ? "" : "s"}` : "Loading…"}
          </p>
          <Link
            to="/sensors/new"
            className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg bg-gradient-to-r from-accent-blue to-accent-purple text-white hover:opacity-90"
          >
            <Plus size={16} /> Add Sensor
          </Link>
        </div>

        {error && (
          <div className="text-sm text-status-faulty bg-status-faulty/10 border border-status-faulty/30 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 text-xs border-b border-base-border bg-base-bg/40">
                <th className="py-3 px-4 font-medium">Sensor ID</th>
                <th className="py-3 px-4 font-medium">Name</th>
                <th className="py-3 px-4 font-medium">Type</th>
                <th className="py-3 px-4 font-medium">Location</th>
                <th className="py-3 px-4 font-medium">Status</th>
                <th className="py-3 px-4 font-medium w-40">Trust</th>
                <th className="py-3 px-4 font-medium">Enabled</th>
                <th className="py-3 px-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {!sensors && (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-500">
                    Loading sensors…
                  </td>
                </tr>
              )}
              {sensors && sensors.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-slate-500">
                    No sensors yet.{" "}
                    <Link to="/sensors/new" className="text-accent-cyan hover:underline">
                      Add your first sensor →
                    </Link>
                  </td>
                </tr>
              )}
              {sensors?.map((s) => (
                <tr key={s.sensor_id} className="border-b border-base-border/60 last:border-0 hover:bg-base-hover/50">
                  <td className="py-3 px-4 font-semibold text-slate-100">{s.sensor_id}</td>
                  <td className="py-3 px-4 text-slate-300">{s.name}</td>
                  <td className="py-3 px-4 text-slate-400">{s.sensor_type}</td>
                  <td className="py-3 px-4 text-slate-400">{s.location}</td>
                  <td className="py-3 px-4">
                    <StatusBadge status={s.status} />
                  </td>
                  <td className="py-3 px-4">
                    <TrustBar score={s.trust_score} />
                  </td>
                  <td className="py-3 px-4">
                    <button
                      disabled={busy === s.sensor_id}
                      onClick={() => handleToggle(s)}
                      className="text-slate-400 hover:text-slate-200 disabled:opacity-40"
                      title={s.enabled ? "Disable" : "Enable"}
                    >
                      {s.enabled ? <Power size={16} className="text-status-healthy" /> : <PowerOff size={16} />}
                    </button>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        to={`/sensors/${s.sensor_id}/edit`}
                        className="p-1.5 rounded-md hover:bg-base-hover text-slate-400 hover:text-accent-cyan"
                        title="Edit"
                      >
                        <Pencil size={15} />
                      </Link>
                      <button
                        disabled={busy === s.sensor_id}
                        onClick={() => handleDelete(s.sensor_id)}
                        className="p-1.5 rounded-md hover:bg-base-hover text-slate-400 hover:text-status-faulty disabled:opacity-40"
                        title="Delete"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
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
