const STYLES = {
  HEALTHY: "text-status-healthy bg-status-healthy/10 border-status-healthy/30",
  FAULTY: "text-status-faulty bg-status-faulty/10 border-status-faulty/30",
  RECOVERING: "text-status-recovering bg-status-recovering/10 border-status-recovering/30",
  OFFLINE: "text-status-offline bg-status-offline/10 border-status-offline/30",
  ONLINE: "text-status-healthy bg-status-healthy/10 border-status-healthy/30",
  UNKNOWN: "text-status-offline bg-status-offline/10 border-status-offline/30",
  ON: "text-status-healthy bg-status-healthy/10 border-status-healthy/30",
  OFF: "text-slate-400 bg-slate-500/10 border-slate-500/30",
  AUTO: "text-accent-cyan bg-accent-cyan/10 border-accent-cyan/30",
  MANUAL: "text-accent-purple bg-accent-purple/10 border-accent-purple/30",
};

export default function StatusBadge({ status, className = "" }) {
  const style = STYLES[status] || STYLES.UNKNOWN;
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[11px] font-semibold tracking-wide ${style} ${className}`}
    >
      {status}
    </span>
  );
}
