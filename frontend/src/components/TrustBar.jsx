function colorFor(score) {
  if (score >= 70) return "#22C55E";
  if (score >= 40) return "#F59E0B";
  return "#EF4444";
}

export default function TrustBar({ score = 0 }) {
  const clamped = Math.max(0, Math.min(100, score));
  return (
    <div>
      <div className="flex items-center justify-between text-xs text-[#94A3B8] mb-1">
        <span>Trust</span>
        <span className="font-semibold text-[#F8FAFC]">{clamped.toFixed(0)}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-base-border overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${clamped}%`, backgroundColor: colorFor(clamped) }}
        />
      </div>
    </div>
  );
}
