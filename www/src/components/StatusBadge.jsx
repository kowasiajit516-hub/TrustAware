/**
 * StatusBadge
 * -------------
 * Consistent status system across the whole dashboard:
 *   HEALTHY / REAL      -> green  (#22C55E)
 *   RECOVERING / VIRTUAL -> amber (#F59E0B)
 *   FAULTY               -> red   (#EF4444)
 * Every badge in this group gets a small colored dot + label, so the
 * same visual language (dot + text) appears everywhere: sensor status,
 * source (real vs virtual), fault history, etc.
 *
 * Control-state badges (ON/OFF/AUTO/MANUAL) are a different kind of
 * information (actuator mode/state, not health/trust) and intentionally
 * render without a dot to avoid implying they're part of the 3-color
 * health system.
 */
const STYLES = {
  HEALTHY: "text-status-healthy bg-status-healthy/10 border-status-healthy/30",
  REAL: "text-status-healthy bg-status-healthy/10 border-status-healthy/30",
  FAULTY: "text-status-faulty bg-status-faulty/10 border-status-faulty/30",
  FAULT: "text-status-faulty bg-status-faulty/10 border-status-faulty/30",
  RECOVERING: "text-status-recovering bg-status-recovering/10 border-status-recovering/30",
  VIRTUAL: "text-status-recovering bg-status-recovering/10 border-status-recovering/30",
  OFFLINE: "text-status-offline bg-status-offline/10 border-status-offline/30",
  ONLINE: "text-status-healthy bg-status-healthy/10 border-status-healthy/30",
  UNKNOWN: "text-status-offline bg-status-offline/10 border-status-offline/30",
  ON: "text-status-healthy bg-status-healthy/10 border-status-healthy/30",
  OFF: "text-[#94A3B8] bg-[#94A3B8]/10 border-[#94A3B8]/30",
  AUTO: "text-accent-cyan bg-accent-cyan/10 border-accent-cyan/30",
  MANUAL: "text-accent-purple bg-accent-purple/10 border-accent-purple/30",
};

// Which statuses get a leading colored dot (the health/trust group only).
const DOT_COLORS = {
  HEALTHY: "bg-status-healthy",
  REAL: "bg-status-healthy",
  ONLINE: "bg-status-healthy",
  RECOVERING: "bg-status-recovering",
  VIRTUAL: "bg-status-recovering",
  FAULTY: "bg-status-faulty",
  FAULT: "bg-status-faulty",
  OFFLINE: "bg-status-offline",
  UNKNOWN: "bg-status-offline",
};

export default function StatusBadge({ status, className = "" }) {
  const style = STYLES[status] || STYLES.UNKNOWN;
  const dotColor = DOT_COLORS[status];

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-[11px] font-semibold tracking-wide ${style} ${className}`}
    >
      {dotColor && <span className={`w-1.5 h-1.5 rounded-full ${dotColor} shrink-0`} />}
      {status}
    </span>
  );
}
