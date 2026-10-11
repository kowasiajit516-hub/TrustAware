/**
 * TrustRing
 * -----------
 * Circular trust/health gauge used only in Overview.jsx's "Live Sensor
 * Overview" section. Uses the exact same color thresholds as
 * TrustBar.jsx (>=70 green, >=40 amber, else red) - no new color
 * system introduced, just a different shape for the same status logic.
 *
 * Compact SVG ring (48px), percentage centered, smooth transition on
 * the progress arc when the score changes (real trust score updates
 * from polling, not a decorative animation loop).
 */
function colorFor(score) {
  if (score >= 70) return "#22C55E";
  if (score >= 40) return "#F59E0B";
  return "#EF4444";
}

const SIZE = 48;
const STROKE = 4;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export default function TrustRing({ score = 0 }) {
  const clamped = Math.max(0, Math.min(100, score ?? 0));
  const offset = CIRCUMFERENCE * (1 - clamped / 100);
  const color = colorFor(clamped);

  return (
    <div className="flex flex-col items-center shrink-0" style={{ width: SIZE }}>
      <div className="relative" style={{ width: SIZE, height: SIZE }}>
        <svg width={SIZE} height={SIZE} className="-rotate-90">
          {/* background track */}
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke="#243244"
            strokeWidth={STROKE}
          />
          {/* progress arc */}
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke={color}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 0.6s ease, stroke 0.3s ease" }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-[11px] font-bold text-[#F8FAFC]">{Math.round(clamped)}%</span>
        </div>
      </div>
      <span className="text-[9px] text-[#94A3B8] mt-1 tracking-wide uppercase">Trust</span>
    </div>
  );
}
