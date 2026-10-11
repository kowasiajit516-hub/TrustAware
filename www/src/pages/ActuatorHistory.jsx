import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Topbar from "../components/Topbar.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import { usePolling } from "../hooks/usePolling.js";
import { listActuatorEvents, listActuators } from "../api/client.js";

const PAGE_SIZE = 20;

export default function ActuatorHistory() {
  const [actuatorFilter, setActuatorFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [actuators, setActuators] = useState([]);
  const { data: events } = usePolling(
    () => listActuatorEvents({ actuator_id: actuatorFilter || undefined, limit: 200 }),
    [actuatorFilter],
    5000
  );

  useEffect(() => {
    listActuators().then(setActuators).catch(() => setActuators([]));
  }, []);

  // Reset to page 1 whenever a filter changes, so you never land on an
  // empty page after narrowing the results.
  useEffect(() => {
    setPage(1);
  }, [actuatorFilter, dateFrom, dateTo]);

  const filtered = useMemo(() => {
    if (!events) return null;
    const fromTime = dateFrom ? new Date(dateFrom).getTime() : null;
    const toTime = dateTo ? new Date(dateTo).getTime() : null;
    return events.filter((e) => {
      const t = new Date(e.timestamp).getTime();
      if (fromTime !== null && t < fromTime) return false;
      if (toTime !== null && t > toTime) return false;
      return true;
    });
  }, [events, dateFrom, dateTo]);

  const totalPages = filtered ? Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)) : 1;
  const pageEvents = filtered ? filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE) : null;

  return (
    <div>
      <Topbar
        title="Actuator Events"
        subtitle="Every recorded command and state change, most recent first"
      />
      <div className="p-6 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
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
          <label className="flex items-center gap-2 text-xs text-[#94A3B8]">
            From
            <input
              type="datetime-local"
              className="input max-w-[190px]"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </label>
          <label className="flex items-center gap-2 text-xs text-[#94A3B8]">
            To
            <input
              type="datetime-local"
              className="input max-w-[190px]"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </label>
          <span className="text-xs text-[#94A3B8]">
            {filtered ? `${filtered.length} event${filtered.length === 1 ? "" : "s"}` : "Loading…"}
          </span>
        </div>

        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[#94A3B8] text-xs border-b border-base-border bg-base-bg/40">
                <th className="py-2 px-4 font-medium">Time</th>
                <th className="py-2 px-4 font-medium">Actuator</th>
                <th className="py-2 px-4 font-medium">Command</th>
                <th className="py-2 px-4 font-medium">Previous → New</th>
                <th className="py-2 px-4 font-medium">Mode</th>
                <th className="py-2 px-4 font-medium">Reason</th>
              </tr>
            </thead>
            <tbody>
              {!pageEvents && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-[#94A3B8]">
                    Loading…
                  </td>
                </tr>
              )}
              {pageEvents && pageEvents.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-[#94A3B8]">
                    No actuator commands match these filters.
                  </td>
                </tr>
              )}
              {pageEvents?.map((e) => (
                <tr key={e.id} className="border-b border-base-border/60 last:border-0 hover:bg-base-hover/50">
                  <td className="py-2 px-4 text-[#94A3B8]">{new Date(e.timestamp).toLocaleString()}</td>
                  <td className="py-2 px-4 font-semibold text-[#F8FAFC]">{e.actuator_id}</td>
                  <td className="py-2 px-4">
                    <StatusBadge status={e.command} />
                  </td>
                  <td className="py-2 px-4">
                    <div className="flex items-center gap-2">
                      <StatusBadge status={e.previous_state} />
                      <span className="text-[#94A3B8]">→</span>
                      <StatusBadge status={e.new_state} />
                    </div>
                  </td>
                  <td className="py-2 px-4">
                    <StatusBadge status={e.mode} />
                  </td>
                  <td className="py-2 px-4 text-[#94A3B8]">{e.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filtered && filtered.length > PAGE_SIZE && (
          <div className="flex items-center justify-between text-xs text-[#94A3B8]">
            <span>
              Page {page} of {totalPages}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-1.5 rounded-md border border-base-border hover:bg-base-hover disabled:opacity-40"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-1.5 rounded-md border border-base-border hover:bg-base-hover disabled:opacity-40"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
