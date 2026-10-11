import { useEffect, useMemo, useState } from "react";
import Topbar from "../components/Topbar.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import { usePolling } from "../hooks/usePolling.js";
import { listFaultEvents, listSensors } from "../api/client.js";

const FAULT_TYPE_LABELS = {
  SUDDEN_OFFSET: "Sudden Offset",
  STUCK: "Stuck",
  DRIFT: "Drift",
  OUT_OF_RANGE: "Out of Range",
  ANOMALY: "Anomaly",
  RECOVERY: "Recovery",
};
function formatFaultType(type) {
  return FAULT_TYPE_LABELS[type] || type || "—";
}

function SeverityBadge({ severity }) {
  const styles = {
    HIGH: "text-status-faulty bg-status-faulty/10 border-status-faulty/30",
    MEDIUM: "text-status-recovering bg-status-recovering/10 border-status-recovering/30",
    LOW: "text-status-healthy bg-status-healthy/10 border-status-healthy/30",
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[11px] font-semibold ${
        styles[severity] || styles.LOW
      }`}
    >
      {severity || "LOW"}
    </span>
  );
}

function formatDuration(startIso, endIso) {
  if (!endIso) return "Ongoing";
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  const mins = Math.round(ms / 60000);
  if (mins < 1) return "<1m";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  return `${hours}h ${rem}m`;
}

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

  // Derived End Time: your fault_events model has no explicit "ended
  // at" field, so this is computed from real consecutive events - the
  // timestamp of the NEXT transition for the same sensor. If there is
  // no later event yet, the "episode" is still ongoing. This is a
  // genuine derived value from real data, not a fabricated field.
  const enrichedEvents = useMemo(() => {
    if (!events) return null;
    const bySensor = {};
    events.forEach((e) => {
      (bySensor[e.sensor_id] ||= []).push(e);
    });
    Object.values(bySensor).forEach((arr) =>
      arr.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
    );
    const endTimeById = {};
    Object.values(bySensor).forEach((arr) => {
      arr.forEach((e, i) => {
        endTimeById[e.id] = i + 1 < arr.length ? arr[i + 1].timestamp : null;
      });
    });
    return events.map((e) => ({ ...e, _endTime: endTimeById[e.id] }));
  }, [events]);

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
          <span className="text-xs text-[#94A3B8]">
            {enrichedEvents ? `${enrichedEvents.length} transition${enrichedEvents.length === 1 ? "" : "s"}` : "Loading…"}
          </span>
        </div>

        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[#94A3B8] text-xs border-b border-base-border bg-base-bg/40">
                <th className="py-2 px-4 font-medium">Start Time</th>
                <th className="py-2 px-4 font-medium">End Time</th>
                <th className="py-2 px-4 font-medium">Duration</th>
                <th className="py-2 px-4 font-medium">Sensor</th>
                <th className="py-2 px-4 font-medium">Fault Type</th>
                <th className="py-2 px-4 font-medium">Severity</th>
                <th className="py-2 px-4 font-medium">Transition</th>
                <th className="py-2 px-4 font-medium">Trust Score</th>
                <th className="py-2 px-4 font-medium">Trigger Reading</th>
              </tr>
            </thead>
            <tbody>
              {!enrichedEvents && (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-[#94A3B8]">
                    Loading…
                  </td>
                </tr>
              )}
              {enrichedEvents && enrichedEvents.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-10 text-center text-[#94A3B8]">
                    No status transitions recorded yet.
                  </td>
                </tr>
              )}
              {enrichedEvents?.map((e) => (
                <tr key={e.id} className="border-b border-base-border/60 last:border-0 hover:bg-base-hover/50">
                  <td className="py-2 px-4 text-[#94A3B8]">{new Date(e.timestamp).toLocaleString()}</td>
                  <td className="py-2 px-4 text-[#94A3B8]">
                    {e._endTime ? new Date(e._endTime).toLocaleString() : (
                      <span className="text-accent-cyan">Ongoing</span>
                    )}
                  </td>
                  <td className="py-2 px-4 text-[#F8FAFC]">{formatDuration(e.timestamp, e._endTime)}</td>
                  <td className="py-2 px-4 font-semibold text-[#F8FAFC]">{e.sensor_id}</td>
                  <td className="py-2 px-4 text-[#94A3B8]">{formatFaultType(e.fault_type)}</td>
                  <td className="py-2 px-4">
                    <SeverityBadge severity={e.severity} />
                  </td>
                  <td className="py-2 px-4">
                    <div className="flex items-center gap-2">
                      <StatusBadge status={e.previous_status} />
                      <span className="text-[#94A3B8]">→</span>
                      <StatusBadge status={e.new_status} />
                    </div>
                  </td>
                  <td className="py-2 px-4 text-[#F8FAFC]">{e.trust_score.toFixed(1)}%</td>
                  <td className="py-2 px-4 text-[#94A3B8] font-mono text-xs">
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
