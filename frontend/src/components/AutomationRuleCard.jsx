import { Pencil, Trash2 } from "lucide-react";
import Toggle from "./Toggle.jsx";
import StatusBadge from "./StatusBadge.jsx";
import { conditionSymbol } from "../utils/format.js";

/**
 * AutomationRuleCard - mobile card for one automation rule, rendered as
 * plain IF / THEN text built from the rule's real fields. The optional
 * reset pair (reset_threshold / reset_action = the rule's hysteresis) is
 * shown when present. No "last triggered" is shown because the backend
 * does not record it.
 */
export default function AutomationRuleCard({ rule, sensor, busy, onToggle, onEdit, onDelete }) {
  const r = rule;
  const unit = sensor?.unit || "";
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-[#F8FAFC] break-words">{r.name}</div>
          <div className="text-[11px] text-[#94A3B8] truncate">{r.rule_id}</div>
        </div>
        <span
          className={`shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-md border ${
            r.enabled
              ? "text-status-healthy bg-status-healthy/10 border-status-healthy/30"
              : "text-[#94A3B8] bg-[#94A3B8]/10 border-[#94A3B8]/30"
          }`}
        >
          {r.enabled ? "ENABLED" : "DISABLED"}
        </span>
      </div>

      <div className="mt-3 rounded-lg bg-base-bg/60 border border-base-border p-3 text-xs space-y-1.5 font-mono">
        <div className="flex flex-wrap items-center gap-x-1.5">
          <span className="text-accent-cyan font-semibold">IF</span>
          <span className="text-[#F8FAFC] break-all">{r.sensor_id}</span>
          <span className="text-accent-cyan font-semibold">{conditionSymbol(r.condition)}</span>
          <span className="text-[#F8FAFC]">
            {r.threshold}
            {unit}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-1.5">
          <span className="text-accent-purple font-semibold">THEN</span>
          <span className="text-[#F8FAFC] break-all">{r.actuator_id}</span>
          <span className="text-[#94A3B8]">=</span>
          <StatusBadge status={r.action} />
        </div>
        {r.reset_threshold !== null && r.reset_threshold !== undefined && r.reset_action && (
          <div className="flex flex-wrap items-center gap-x-1.5 pt-1.5 border-t border-base-border/60">
            <span className="text-[#94A3B8] font-semibold">RESET</span>
            <span className="text-[#F8FAFC]">
              at {r.reset_threshold}
              {unit}
            </span>
            <span className="text-[#94A3B8]">→</span>
            <StatusBadge status={r.reset_action} />
          </div>
        )}
      </div>

      <div className="mt-2 flex items-center justify-between gap-2 border-t border-base-border pt-1">
        <Toggle
          checked={r.enabled}
          disabled={busy}
          onChange={() => onToggle(r)}
          label={r.enabled ? "Enabled" : "Disabled"}
        />
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onEdit(r)}
            aria-label={`Edit ${r.rule_id}`}
            className="ta-compact inline-flex items-center justify-center w-11 h-11 rounded-lg text-[#94A3B8] hover:text-accent-cyan hover:bg-white/5"
          >
            <Pencil size={16} />
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onDelete(r.rule_id)}
            aria-label={`Delete ${r.rule_id}`}
            className="ta-compact inline-flex items-center justify-center w-11 h-11 rounded-lg text-[#94A3B8] hover:text-status-faulty hover:bg-white/5 disabled:opacity-40"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
