import { Check } from "lucide-react";

/**
 * PipelineStepper
 * ----------------
 * Visualises the project's self-healing loop for ONE sensor:
 *   Normal -> Fault detected -> Trust reduced -> Virtual sensor activated
 *   -> Trusted value generated -> Sensor recovery -> Trust restored
 *
 * The stage is DERIVED (presentation only) from real backend data:
 *   status  - sensor_health / sensor status (HEALTHY|RECOVERING|FAULTY|OFFLINE)
 *   source  - latest trusted-reading source (RAW|VIRTUAL)
 *   lastEvent - latest fault_events transition ({previous_status,new_status})
 * It does not call the backend and does not alter any trust logic.
 */
export const STAGES = [
  "Sensor normal",
  "Fault detected",
  "Trust reduced",
  "Virtual sensor activated",
  "Trusted value generated",
  "Sensor recovery",
  "Trust restored",
];

export function deriveStage({ status, source, lastEvent }) {
  const virtual = source === "VIRTUAL";
  if (!status || status === "OFFLINE") return { current: -1, done: 0, note: "No recent readings" };

  if (status === "HEALTHY") {
    const recovered =
      lastEvent &&
      lastEvent.new_status === "HEALTHY" &&
      (lastEvent.previous_status === "RECOVERING" || lastEvent.previous_status === "FAULTY");
    return recovered
      ? { current: 6, done: 7, note: "Recovered — real sensor value restored" }
      : { current: 0, done: 1, note: "Operating normally — raw value trusted" };
  }
  if (status === "FAULTY") {
    return virtual
      ? { current: 4, done: 5, note: "Fault active — virtual sensor sustaining a trusted value" }
      : { current: 2, done: 3, note: "Fault detected — waiting for virtual failover" };
  }
  // RECOVERING
  if (lastEvent && lastEvent.previous_status === "FAULTY") {
    return { current: 5, done: 6, note: "Sensor recovering — trust increasing" };
  }
  return virtual
    ? { current: 3, done: 4, note: "Virtual sensor engaged — trust recovering" }
    : { current: 2, done: 3, note: "Trust reduced — monitoring" };
}

export default function PipelineStepper({ status, source, lastEvent }) {
  const { current, done, note } = deriveStage({ status, source, lastEvent });
  return (
    <div>
      <ol className="space-y-0">
        {STAGES.map((label, i) => {
          const isDone = i < done && i !== current;
          const isCurrent = i === current;
          return (
            <li key={label} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span
                  className={`w-6 h-6 rounded-full border flex items-center justify-center text-[10px] font-bold shrink-0 ${
                    isCurrent
                      ? "border-accent-cyan text-accent-cyan bg-accent-cyan/15 shadow-[0_0_10px_rgba(0,210,255,0.35)]"
                      : isDone
                      ? "border-status-healthy/60 text-status-healthy bg-status-healthy/10"
                      : "border-base-border text-[#64748B]"
                  }`}
                >
                  {isDone ? <Check size={12} aria-hidden="true" /> : i + 1}
                </span>
                {i < STAGES.length - 1 && (
                  <span className={`w-px flex-1 min-h-[14px] ${isDone ? "bg-status-healthy/40" : "bg-base-border"}`} />
                )}
              </div>
              <div
                className={`pb-3 text-sm ${
                  isCurrent ? "text-accent-cyan font-semibold" : isDone ? "text-[#F8FAFC]" : "text-[#64748B]"
                }`}
              >
                {label}
                {isCurrent && <span className="ml-2 text-[10px] uppercase tracking-wider">now</span>}
              </div>
            </li>
          );
        })}
      </ol>
      <p className="text-[11px] text-[#94A3B8] mt-1">{note}</p>
    </div>
  );
}
