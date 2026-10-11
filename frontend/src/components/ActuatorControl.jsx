/**
 * ActuatorControl
 * ----------------
 * Large segmented OFF | ON | AUTO control for one actuator.
 *
 * Maps 1:1 onto the real backend commands (POST /actuators/{id}/command
 * accepts ON, OFF, AUTO). Highlight logic mirrors what the backend does:
 *   - AUTO command  -> mode AUTO (state left to the automation engine)
 *   - ON / OFF      -> mode MANUAL, state = command
 * Nothing is sent until a segment is explicitly tapped - rendering or
 * opening a card never issues a command.
 */
const SEGMENTS = [
  { command: "OFF", active: "bg-white/10 text-[#F8FAFC] border-white/30" },
  { command: "ON", active: "bg-status-healthy/20 text-status-healthy border-status-healthy/50" },
  { command: "AUTO", active: "bg-accent-cyan/15 text-accent-cyan border-accent-cyan/50" },
];

export default function ActuatorControl({ actuator, busyCommand, onCommand }) {
  const current = actuator.mode === "AUTO" ? "AUTO" : actuator.state;

  return (
    <div role="group" aria-label={`Control ${actuator.actuator_id}`} className="grid grid-cols-3 gap-2">
      {SEGMENTS.map(({ command, active }) => {
        const isActive = current === command;
        return (
          <button
            key={command}
            type="button"
            aria-pressed={isActive}
            disabled={Boolean(busyCommand)}
            onClick={() => onCommand(actuator.actuator_id, command)}
            className={`ta-compact min-h-[44px] rounded-lg border text-sm font-semibold transition-colors disabled:opacity-50 ${
              isActive ? active : "border-base-border text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-white/5"
            }`}
          >
            {busyCommand === command ? "…" : command}
          </button>
        );
      })}
    </div>
  );
}
