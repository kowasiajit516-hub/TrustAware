import { useEffect, useState } from "react";
import Topbar from "../components/Topbar.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import { usePolling } from "../hooks/usePolling.js";
import { listFaultEvents, listSensors } from "../api/client.js";

export default function FaultHistory() {
  const [sensorFilter, setSensorFilter] = useState("");
  const [sensors, setSensors] = useState([]);
  const { data: events } = usePolling(
    () => listFaultEvents({ sensor_id: sensorFilter || undefined, limit: 200 }),
    [sensorFilter],
    5000
  );

  useEffect(() => {
    listSensors().then(setSensors).catch(() => setSensors([]));
  }, []);

  return (
    <div>
      <Topbar
        title="Fault History"
        subtitle="Every recorded status transition (HEALTHY → RECOVERING → FAULTY → RECOVERING → HEALTHY), most recent first"
      />
      <div className="p-6 space-y-4">
        <div className="flex items-center gap-3">
          <select
            className="input max-w-xs"
            value={sensorFilter}
            onChange={(e) => setSensorFilter(e.target.value)}
          >
            <option value="">All sensors</option>
            {sensors.map((s) => (
              <option key={s.sensor_id} value={s.sensor_id}>
                {s.sensor_id}
              </option>
            ))}
          </select>
          <span className="text-xs text-slate-500">
            {events ? `${events.length} transition${events.length === 1 ? "" : "s"}` : "Loading…"}
          </span>
        </div>

        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 text-xs border-b border-base-border bg-base-bg/40">
                <th className="py-3 px-4 font-medium">Time</th>
                <th className="py-3 px-4 font-medium">Sensor</th>
                <th className="py-3 px-4 font-medium">Transition</th>
                <th className="py-3 px-4 font-medium">Trust Score</th>
                <th className="py-3 px-4 font-medium">Trigger Reading</th>
              </tr>
            </thead>
            <tbody>
              {!events && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-500">
                    Loading…
                  </td>
                </tr>
              )}
              {events && events.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-slate-500">
                    No status transitions recorded yet.
                  </td>
                </tr>
              )}
              {events?.map((e) => (
                <tr key={e.id} className="border-b border-base-border/60 last:border-0 hover:bg-base-hover/50">
                  <td className="py-3 px-4 text-slate-400">{new Date(e.timestamp).toLocaleString()}</td>
                  <td className="py-3 px-4 font-semibold text-slate-100">{e.sensor_id}</td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <StatusBadge status={e.previous_status} />
                      <span className="text-slate-500">→</span>
                      <StatusBadge status={e.new_status} />
                    </div>
                  </td>
                  <td className="py-3 px-4 text-slate-300">{e.trust_score.toFixed(1)}%</td>
                  <td className="py-3 px-4 text-slate-500 font-mono text-xs">
                    {e.trigger_reading_id || "—"}
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
