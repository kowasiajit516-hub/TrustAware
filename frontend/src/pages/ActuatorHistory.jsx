import { useEffect, useState } from "react";
import Topbar from "../components/Topbar.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import { usePolling } from "../hooks/usePolling.js";
import { listActuatorEvents, listActuators } from "../api/client.js";

export default function ActuatorHistory() {
  const [actuatorFilter, setActuatorFilter] = useState("");
  const [actuators, setActuators] = useState([]);
  const { data: events } = usePolling(
    () => listActuatorEvents({ actuator_id: actuatorFilter || undefined, limit: 200 }),
    [actuatorFilter],
    5000
  );

  useEffect(() => {
    listActuators().then(setActuators).catch(() => setActuators([]));
  }, []);

  return (
    <div>
      <Topbar
        title="Actuator Events"
        subtitle="Every recorded command and state change, most recent first"
      />
      <div className="p-6 space-y-4">
        <div className="flex items-center gap-3">
          <select
            className="input max-w-xs"
            value={actuatorFilter}
            onChange={(e) => setActuatorFilter(e.target.value)}
          >
            <option value="">All actuators</option>
            {actuators.map((a) => (
              <option key={a.actuator_id} value={a.actuator_id}>
                {a.actuator_id}
              </option>
            ))}
          </select>
          <span className="text-xs text-slate-500">
            {events ? `${events.length} event${events.length === 1 ? "" : "s"}` : "Loading…"}
          </span>
        </div>

        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 text-xs border-b border-base-border bg-base-bg/40">
                <th className="py-3 px-4 font-medium">Time</th>
                <th className="py-3 px-4 font-medium">Actuator</th>
                <th className="py-3 px-4 font-medium">Command</th>
                <th className="py-3 px-4 font-medium">Previous → New</th>
                <th className="py-3 px-4 font-medium">Mode</th>
                <th className="py-3 px-4 font-medium">Reason</th>
              </tr>
            </thead>
            <tbody>
              {!events && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    Loading…
                  </td>
                </tr>
              )}
              {events && events.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-500">
                    No actuator commands recorded yet.
                  </td>
                </tr>
              )}
              {events?.map((e) => (
                <tr key={e.id} className="border-b border-base-border/60 last:border-0 hover:bg-base-hover/50">
                  <td className="py-3 px-4 text-slate-400">{new Date(e.timestamp).toLocaleString()}</td>
                  <td className="py-3 px-4 font-semibold text-slate-100">{e.actuator_id}</td>
                  <td className="py-3 px-4">
                    <StatusBadge status={e.command} />
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <StatusBadge status={e.previous_state} />
                      <span className="text-slate-500">→</span>
                      <StatusBadge status={e.new_state} />
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <StatusBadge status={e.mode} />
                  </td>
                  <td className="py-3 px-4 text-slate-500">{e.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
