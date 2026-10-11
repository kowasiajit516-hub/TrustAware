/**
 * TrustAwareMark
 * ----------------
 * Shared shield logo used on the auth pages (size="lg") and the
 * dashboard sidebar (size="sm"). Both variants render the exact same
 * two <path> shapes - a white/silver outer shield with a nested blue
 * inner shield - with "AI" written directly on it. Pure SVG, no
 * external image asset, no icon substitutes.
 */
export default function TrustAwareMark({ size = "lg" }) {
  if (size === "sm") {
    return (
      <div className="relative w-9 h-9 shrink-0 flex items-center justify-center">
        <ShieldSvg className="w-9 h-9 drop-shadow-[0_0_6px_rgba(37,99,235,0.55)]" aiFontSize={62} />
      </div>
    );
  }

  return (
    <div className="relative w-56 h-56 mx-auto flex flex-col items-center">
      <ShieldSvg className="w-full h-full drop-shadow-[0_0_22px_rgba(37,99,235,0.5)]" aiFontSize={62} />
      {/* soft blue glow beneath the shield tip, matching the reference */}
      <div className="w-32 h-3 -mt-3 rounded-full bg-auth-blue/60 blur-xl" />
    </div>
  );
}

function ShieldSvg({ className, aiFontSize }) {
  return (
    <svg viewBox="0 0 200 220" className={className}>
      <defs>
        <linearGradient id="shieldOuter" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#c8d3e0" />
        </linearGradient>
      </defs>
      {/* outer shield - white/silver */}
      <path
        d="M100 8 L182 40 V108 C182 162 148 196 100 214 C52 196 18 162 18 108 V40 Z"
        fill="#05070d"
        stroke="url(#shieldOuter)"
        strokeWidth="9"
        strokeLinejoin="round"
      />
      {/* inner shield - electric blue, nested inside the outer one */}
      <path
        d="M100 34 L158 58 V104 C158 146 134 172 100 188 C66 172 42 146 42 104 V58 Z"
        fill="#05070d"
        stroke="#2f6bff"
        strokeWidth="7"
        strokeLinejoin="round"
      />
      {/* AI, written directly on the shield */}
      <text
        x="100"
        y="128"
        textAnchor="middle"
        fontSize={aiFontSize}
        fontWeight="800"
        fill="#ffffff"
        fontFamily="Inter, ui-sans-serif, system-ui, sans-serif"
      >
        AI
      </text>
    </svg>
  );
}
