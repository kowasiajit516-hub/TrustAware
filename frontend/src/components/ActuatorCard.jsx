import { Link } from "react-router-dom";
import { Pencil, Trash2 } from "lucide-react";
import ActuatorIcon from "./ActuatorIcon.jsx";
import StatusBadge from "./StatusBadge.jsx";
import Toggle from "./Toggle.jsx";
import ActuatorControl from "./ActuatorControl.jsx";
import { timeAgo } from "../utils/format.js";

/**
 * ActuatorCard - mobile card for one actuator.
 * `rules` = automation rules whose actuator_id targets this actuator
 * (real data from GET /automation-rules), shown as "Controlled by".
 * `busyCommand` = the command currently in flight for THIS actuator, if any.
 */
export default function ActuatorCard({
  actuator,
  rules = [],
  busyCommand,
  busy,
  onCommand,
  onToggleEnabled,
  onDelete,
}) {
  const a = actuator;
  const activeRules = rules.filter((r) => r.enabled);
  return (
    <div className="card p-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-accent-purple/10 text-accent-purple flex items-center justify-center shrink-0">
          <ActuatorIcon type={a.actuator_type} size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-[#F8FAFC] truncate">{a.name}</div>
          <div className="text-[11px] text-[#94A3B8] truncate">
            {a.actuator_id} · {a.actuator_type}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <StatusBadge status={a.state} />
          <StatusBadge status={a.mode} />
        </div>
      </div>

      <div className="mt-3 text-[11px] text-[#94A3B8] flex flex-wrap gap-x-3 gap-y-0.5">
        <span>Node: {a.node_id || "—"}</span>
        <span>Location: {a.location}</span>
        {!a.enabled && <span className="text-status-recovering font-semibold">Disabled</span>}
      </div>

      <div className="mt-3">
        <ActuatorControl actuator={a} busyCommand={busyCommand} onCommand={onCommand} />
      </div>

      <div className="mt-3 pt-3 border-t border-base-border text-[11px] text-[#94A3B8] space-y-0.5">
        <div>
          Last action:{" "}
          <span className="text-[#F8FAFC] font-medium">{a.last_command || "none"}</span>
          {a.last_command && <> · {timeAgo(a.updated_at)}</>}
        </div>
        <div className="break-words">
          Controlled by:{" "}
          <span className="text-[#F8FAFC] font-medium">
            {activeRules.length
              ? activeRules.map((r) => r.name).join(", ")
              : a.controlling_sensor
              ? `sensor ${a.controlling_sensor}`
              : "no automation rule"}
          </span>
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2 border-t border-base-border pt-1">
        <Toggle
          checked={a.enabled}
          disabled={busy}
          onChange={() => onToggleEnabled(a)}
          label={a.enabled ? "Enabled" : "Disabled"}
        />
        <div className="flex items-center gap-1">
          <Link
            to={`/actuators/${a.actuator_id}/edit`}
            aria-label={`Edit ${a.actuator_id}`}
            className="inline-flex items-center justify-center w-11 h-11 rounded-lg text-[#94A3B8] hover:text-accent-cyan hover:bg-white/5"
          >
            <Pencil size={16} />
          </Link>
          <button
            type="button"
            disabled={busy}
            onClick={() => onDelete(a.actuator_id)}
            aria-label={`Delete ${a.actuator_id}`}
            className="ta-compact inline-flex items-center justify-center w-11 h-11 rounded-lg text-[#94A3B8] hover:text-status-faulty hover:bg-white/5 disabled:opacity-40"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
