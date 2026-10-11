import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Pencil, Trash2, Power, PowerOff, Search, Radio, ShieldCheck, AlertTriangle, RotateCw } from "lucide-react";
import Topbar from "../components/Topbar.jsx";
import StatCard from "../components/StatCard.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import TrustBar from "../components/TrustBar.jsx";
import { usePolling } from "../hooks/usePolling.js";
import { listSensors, deleteSensor, enableSensor, disableSensor } from "../api/client.js";

export default function Sensors() {
  const { data: sensors, reload } = usePolling(() => listSensors(), [], 5000);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const summary = useMemo(() => {
    if (!sensors) return null;
    return {
      total: sensors.length,
      healthy: sensors.filter((s) => s.status === "HEALTHY").length,
      faulty: sensors.filter((s) => s.status === "FAULTY").length,
      recovering: sensors.filter((s) => s.status === "RECOVERING").length,
    };
  }, [sensors]);

  const availableTypes = useMemo(() => {
    if (!sensors) return [];
    return [...new Set(sensors.map((s) => s.sensor_type))].sort();
  }, [sensors]);

  const filteredSensors = useMemo(() => {
    if (!sensors) return null;
    const q = search.trim().toLowerCase();
    return sensors.filter((s) => {
      if (q && !s.sensor_id.toLowerCase().includes(q) && !s.name.toLowerCase().includes(q)) return false;
      if (typeFilter && s.sensor_type !== typeFilter) return false;
      if (statusFilter && s.status !== statusFilter) return false;
      return true;
    });
  }, [sensors, search, typeFilter, statusFilter]);

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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard icon={Radio} label="Total Sensors" value={summary?.total ?? "—"} tone="cyan" />
          <StatCard icon={ShieldCheck} label="Healthy" value={summary?.healthy ?? "—"} tone="healthy" />
          <StatCard icon={AlertTriangle} label="Faulty" value={summary?.faulty ?? "—"} tone="faulty" />
          <StatCard icon={RotateCw} label="Recovering" value={summary?.recovering ?? "—"} tone="recovering" />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
            <input
              className="input pl-9"
              placeholder="Search sensors…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select className="input max-w-[160px]" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="">All Types</option>
            {availableTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <select className="input max-w-[160px]" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All Status</option>
            <option value="HEALTHY">Healthy</option>
            <option value="RECOVERING">Recovering</option>
            <option value="FAULTY">Faulty</option>
            <option value="OFFLINE">Offline</option>
          </select>
          <Link
            to="/sensors/new"
            className="ml-auto inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-2 rounded-lg bg-gradient-to-r from-accent-blue to-accent-purple text-white hover:opacity-90"
          >
            <Plus size={16} /> Add Sensor
          </Link>
        </div>

        <p className="text-xs text-[#94A3B8]">
          {filteredSensors
            ? `${filteredSensors.length} of ${sensors.length} sensor${sensors.length === 1 ? "" : "s"}`
            : "Loading…"}
        </p>

        {error && (
          <div className="text-sm text-status-faulty bg-status-faulty/10 border border-status-faulty/30 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[#94A3B8] text-xs border-b border-base-border bg-base-bg/40">
                <th className="py-2 px-4 font-medium">Sensor ID</th>
                <th className="py-2 px-4 font-medium">Name</th>
                <th className="py-2 px-4 font-medium">Type</th>
                <th className="py-2 px-4 font-medium">Location</th>
                <th className="py-2 px-4 font-medium">Status</th>
                <th className="py-2 px-4 font-medium w-40">Trust</th>
                <th className="py-2 px-4 font-medium">Enabled</th>
                <th className="py-2 px-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {!filteredSensors && (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-[#94A3B8]">
                    Loading sensors…
                  </td>
                </tr>
              )}
              {filteredSensors && filteredSensors.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-[#94A3B8]">
                    {sensors.length === 0 ? (
                      <>
                        No sensors yet.{" "}
                        <Link to="/sensors/new" className="text-accent-cyan hover:underline">
                          Add your first sensor →
                        </Link>
                      </>
                    ) : (
                      "No sensors match these filters."
                    )}
                  </td>
                </tr>
              )}
              {filteredSensors?.map((s) => (
                <tr key={s.sensor_id} className="border-b border-base-border/60 last:border-0 hover:bg-base-hover/50">
                  <td className="py-2 px-4 font-semibold text-[#F8FAFC]">{s.sensor_id}</td>
                  <td className="py-2 px-4 text-[#F8FAFC]">{s.name}</td>
                  <td className="py-2 px-4 text-[#94A3B8]">{s.sensor_type}</td>
                  <td className="py-2 px-4 text-[#94A3B8]">{s.location}</td>
                  <td className="py-2 px-4">
                    <StatusBadge status={s.status} />
                  </td>
                  <td className="py-2 px-4">
                    <TrustBar score={s.trust_score} />
                  </td>
                  <td className="py-2 px-4">
                    <button
                      disabled={busy === s.sensor_id}
                      onClick={() => handleToggle(s)}
                      className="text-[#94A3B8] hover:text-[#F8FAFC] disabled:opacity-40"
                      title={s.enabled ? "Disable" : "Enable"}
                    >
                      {s.enabled ? <Power size={16} className="text-status-healthy" /> : <PowerOff size={16} />}
                    </button>
                  </td>
                  <td className="py-2 px-4">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        to={`/sensors/${s.sensor_id}/edit`}
                        className="p-1.5 rounded-md hover:bg-base-hover text-[#94A3B8] hover:text-accent-cyan"
                        title="Edit"
                      >
                        <Pencil size={15} />
                      </Link>
                      <button
                        disabled={busy === s.sensor_id}
                        onClick={() => handleDelete(s.sensor_id)}
                        className="p-1.5 rounded-md hover:bg-base-hover text-[#94A3B8] hover:text-status-faulty disabled:opacity-40"
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
