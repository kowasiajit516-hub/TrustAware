/**
 * Toggle
 * -------
 * Touch-friendly on/off switch (44px hit area) used by the mobile cards
 * for the real enable/disable endpoints. Purely presentational: the parent
 * decides what "on" means and performs the API call.
 */
export default function Toggle({ checked, onChange, disabled = false, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange?.(!checked)}
      className="ta-compact inline-flex items-center gap-2 min-h-[44px] pr-1 disabled:opacity-40"
    >
      <span
        className={`relative inline-block w-11 h-6 rounded-full border transition-colors ${
          checked
            ? "bg-status-healthy/25 border-status-healthy/50"
            : "bg-white/5 border-base-border"
        }`}
      >
        <span
          className={`absolute top-0.5 w-5 h-5 rounded-full transition-all ${
            checked ? "left-[22px] bg-status-healthy" : "left-0.5 bg-[#94A3B8]"
          }`}
        />
      </span>
      {label && <span className="text-xs font-medium text-[#94A3B8]">{label}</span>}
    </button>
  );
}
