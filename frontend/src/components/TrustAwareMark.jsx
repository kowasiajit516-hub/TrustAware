/**
 * TrustAwareMark
 * ----------------
 * The TrustAware app icon as an SVG: a cyan shield with a heartbeat (pulse)
 * line. The shield outline is curved (smooth sides sweeping to a rounded tip,
 * rounded corners) and sits on a dark rounded tile. It is the SAME artwork as
 * the installed app / home-screen icon (public/icons/icon-512.png), so the logo
 * inside the app and the icon on the phone always match.
 *
 * Used on the auth pages (size="lg" and size="sm"), the dashboard sidebar
 * (size="sm") and the mobile header (size="sm"). Pure SVG, no image asset.
 *
 * Pass tile={false} to draw the shield alone, without the dark tile.
 */
export default function TrustAwareMark({ size = "lg", tile = true }) {
  if (size === "sm") {
    return (
      <div className="relative w-10 h-10 shrink-0 flex items-center justify-center">
        <AppIconSvg tile={tile} className="w-10 h-10 drop-shadow-[0_0_6px_rgba(0,210,255,0.25)]" />
      </div>
    );
  }

  return (
    <div className="relative w-48 h-48 mx-auto flex items-center justify-center">
      <AppIconSvg tile={tile} className="w-full h-full drop-shadow-[0_0_22px_rgba(0,210,255,0.3)]" />
    </div>
  );
}

function AppIconSvg({ className, tile }) {
  return (
    <svg viewBox="0 0 512 512" className={className} role="img" aria-label="TrustAware">
      {/* dark rounded tile with thin border */}
      {tile && (
        <rect x="32.7" y="32.7" width="446.6" height="446.6" rx="110.6" fill="#0b1320" stroke="#1e293b" strokeWidth="4" />
      )}
      {/* curved shield outline: round joins give the rounded apex and shoulders */}
      <path
        d="M256 69.7 L400.1 127.3 L400.1 239.1 C400.1 335.3 331.4 405.1 256 442.3 C180.6 405.1 111.9 335.3 111.9 239.1 L111.9 127.3 Z"
        fill="none"
        stroke="#00d2ff"
        strokeWidth="25.8"
        strokeLinejoin="round"
      />
      {/* heartbeat line */}
      <path
        d="M162.8 256 L220.3 256 L246.1 184.8 L283.5 327.8 L309.4 256 L349.4 256"
        fill="none"
        stroke="#00d2ff"
        strokeWidth="25.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
