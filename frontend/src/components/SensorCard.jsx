import { Link } from "react-router-dom";
import { Pencil, Trash2, ChevronRight } from "lucide-react";
import SensorIcon from "./SensorIcon.jsx";
import StatusBadge from "./StatusBadge.jsx";
import TrustRing from "./TrustRing.jsx";
import Toggle from "./Toggle.jsx";
import { formatValue, timeAgo } from "../utils/format.js";

/**
 * SensorCard - mobile card for one sensor (used instead of a table row
 * below the `lg` breakpoint). `trusted` is the latest real trusted-reading
 * for this sensor (raw_value / trusted_value / source) or null if none yet.
 */
export default function SensorCard({ sensor, trusted, busy, onToggle, onDelete }) {
  const s = sensor;
  const unit = s.unit || "";
  return (
    <div className="card p-4">
      <Link to={`/sensors/${s.sensor_id}`} className="flex items-start gap-3 group" aria-label={`Open ${s.name}`}>
        <TrustRing score={s.trust_score} />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-start gap-1.5 min-w-0">
                <SensorIcon type={s.sensor_type} size={14} className="text-[#94A3B8] shrink-0 mt-0.5" />
                <span className="text-sm font-semibold text-[#F8FAFC] line-clamp-2 break-words">{s.name}</span>
              </div>
              <div className="text-[11px] text-[#94A3B8] truncate">
                {s.sensor_id} · {s.sensor_type}
              </div>
            </div>
            <StatusBadge status={s.status} className="shrink-0" />
          </div>
        </div>
        <ChevronRight size={16} className="text-[#94A3B8] mt-1 shrink-0" aria-hidden="true" />
      </Link>

      <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-base-border text-[11px]">
        <div className="min-w-0">
          <div className="text-[#94A3B8]">Physical</div>
          <div className="text-[#F8FAFC] font-semibold truncate">
            {trusted ? `${formatValue(trusted.raw_value)} ${unit}` : "—"}
          </div>
        </div>
        <div className="min-w-0">
          <div className="text-[#94A3B8]">Trusted</div>
          <div className="text-[#F8FAFC] font-semibold truncate">
            {trusted ? `${formatValue(trusted.trusted_value)} ${unit}` : "—"}
          </div>
        </div>
        <div className="min-w-0">
          <div className="text-[#94A3B8]">Source</div>
          {trusted ? <StatusBadge status={trusted.source} /> : <span className="text-[#94A3B8]">—</span>}
        </div>
      </div>

      <div className="mt-3 text-[11px] text-[#94A3B8] flex flex-wrap gap-x-3 gap-y-0.5">
        <span>Node: {s.node_id || "—"}</span>
        <span>Location: {s.location}</span>
        <span>Updated: {trusted ? timeAgo(trusted.timestamp) : "never"}</span>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2 border-t border-base-border pt-1">
        <Toggle
          checked={s.enabled}
          disabled={busy}
          onChange={() => onToggle(s)}
          label={s.enabled ? "Enabled" : "Disabled"}
        />
        <div className="flex items-center gap-1">
          <Link
            to={`/sensors/${s.sensor_id}/edit`}
            aria-label={`Edit ${s.sensor_id}`}
            className="inline-flex items-center justify-center w-11 h-11 rounded-lg text-[#94A3B8] hover:text-accent-cyan hover:bg-white/5"
          >
            <Pencil size={16} />
          </Link>
          <button
            type="button"
            disabled={busy}
            onClick={() => onDelete(s.sensor_id)}
            aria-label={`Delete ${s.sensor_id}`}
            className="ta-compact inline-flex items-center justify-center w-11 h-11 rounded-lg text-[#94A3B8] hover:text-status-faulty hover:bg-white/5 disabled:opacity-40"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
