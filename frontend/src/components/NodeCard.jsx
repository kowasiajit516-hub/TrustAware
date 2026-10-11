import { Link } from "react-router-dom";
import { Pencil, Trash2, ChevronRight, Server } from "lucide-react";
import StatusBadge from "./StatusBadge.jsx";
import { timeAgo } from "../utils/format.js";

/**
 * NodeCard - mobile card for one ESP32 node.
 * Only shows what GET /nodes really returns (status, ip_address,
 * last_seen, location, enabled) plus sensor/actuator counts derived from
 * the real sensors/actuators lists (their node_id).
 */
export default function NodeCard({ node, sensorCount, actuatorCount, busy, onEdit, onDelete }) {
  const n = node;
  return (
    <div className="card p-4">
      <Link to={`/nodes/${n.node_id}`} className="flex items-start gap-3 min-h-[44px]" aria-label={`Open ${n.name}`}>
        <div className="w-10 h-10 rounded-lg bg-accent-cyan/10 text-accent-cyan flex items-center justify-center shrink-0">
          <Server size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-[#F8FAFC] truncate">{n.name}</div>
          <div className="text-[11px] text-[#94A3B8] truncate">{n.node_id}</div>
        </div>
        <StatusBadge status={n.status} className="shrink-0" />
        <ChevronRight size={16} className="text-[#94A3B8] mt-1 shrink-0" aria-hidden="true" />
      </Link>

      <div className="grid grid-cols-2 gap-x-3 gap-y-2 mt-3 pt-3 border-t border-base-border text-[11px]">
        <div className="min-w-0">
          <div className="text-[#94A3B8]">IP address</div>
          <div className="text-[#F8FAFC] font-semibold font-mono truncate">{n.ip_address || "—"}</div>
        </div>
        <div className="min-w-0">
          <div className="text-[#94A3B8]">Last seen</div>
          <div className="text-[#F8FAFC] font-semibold truncate">{n.last_seen ? timeAgo(n.last_seen) : "never"}</div>
        </div>
        <div className="min-w-0">
          <div className="text-[#94A3B8]">Sensors</div>
          <div className="text-[#F8FAFC] font-semibold">{sensorCount ?? "—"}</div>
        </div>
        <div className="min-w-0">
          <div className="text-[#94A3B8]">Actuators</div>
          <div className="text-[#F8FAFC] font-semibold">{actuatorCount ?? "—"}</div>
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2 border-t border-base-border pt-1">
        <span className="text-[11px] text-[#94A3B8] truncate">
          {n.location}
          {!n.enabled && <span className="text-status-recovering font-semibold"> · Disabled</span>}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => onEdit(n)}
            aria-label={`Edit ${n.node_id}`}
            className="ta-compact inline-flex items-center justify-center w-11 h-11 rounded-lg text-[#94A3B8] hover:text-accent-cyan hover:bg-white/5"
          >
            <Pencil size={16} />
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onDelete(n.node_id)}
            aria-label={`Delete ${n.node_id}`}
            className="ta-compact inline-flex items-center justify-center w-11 h-11 rounded-lg text-[#94A3B8] hover:text-status-faulty hover:bg-white/5 disabled:opacity-40"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
