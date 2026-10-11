import { ShieldCheck, RefreshCw, BrainCircuit, Activity } from "lucide-react";
import TrustAwareMark from "./TrustAwareMark.jsx";
import Galaxy from "./Galaxy.jsx";

const FEATURES = [
  { label: "Reliable", icon: ShieldCheck },
  { label: "Adaptive", icon: RefreshCw },
  { label: "Intelligent", icon: BrainCircuit },
  { label: "Resilient", icon: Activity },
];

/**
 * AuthLayout
 * -----------
 * Full-bleed 100vw x 100vh auth shell: 50% dark illustration panel +
 * 50% white form panel on desktop, no outer card/margin/max-width.
 * On mobile the illustration panel collapses to a compact branded
 * header (logo + wordmark) above the form instead of disappearing
 * entirely, so the page still stacks vertically with no horizontal
 * scroll and no dead space.
 */
export default function AuthLayout({ children }) {
  return (
    <div className="w-screen h-screen min-h-screen overflow-y-auto md:overflow-hidden flex flex-col md:flex-row bg-white">
      {/* Illustration panel - dark navy / electric blue - full half on desktop */}
      <div className="relative hidden md:flex md:w-1/2 h-screen flex-col items-center justify-center px-10 lg:px-16 py-12 bg-gradient-to-b from-auth-bg via-auth-panel to-auth-panel2 overflow-hidden">
        {/* dynamic animated starfield */}
        <div className="absolute inset-0">
          <Galaxy
            density={0.9}
            glowIntensity={0.35}
            saturation={0.35}
            hueShift={220}
            twinkleIntensity={0.4}
            rotationSpeed={0.04}
            starSpeed={0.35}
            speed={0.6}
            mouseInteraction
            mouseRepulsion
            repulsionStrength={1.5}
            transparent
          />
        </div>
        <div
          className="absolute inset-0 opacity-40 pointer-events-none"
          style={{
            backgroundImage:
              "radial-gradient(circle at 30% 15%, rgba(37,99,235,0.25), transparent 45%), radial-gradient(circle at 75% 80%, rgba(37,99,235,0.18), transparent 50%)",
          }}
        />
        {/* subtle circuit-line pattern */}
        <svg className="absolute inset-0 w-full h-full opacity-[0.08] pointer-events-none" preserveAspectRatio="none">
          <defs>
            <pattern id="circuit" width="80" height="80" patternUnits="userSpaceOnUse">
              <path d="M0 40 H30 M50 40 H80 M40 0 V30 M40 50 V80" stroke="#60a5fa" strokeWidth="1" fill="none" />
              <circle cx="40" cy="40" r="2.5" fill="#60a5fa" />
              <circle cx="30" cy="40" r="1.5" fill="#60a5fa" />
              <circle cx="50" cy="40" r="1.5" fill="#60a5fa" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#circuit)" />
        </svg>

        <div className="relative z-10 text-center">
          <TrustAwareMark size="lg" />

          <h1 className="mt-6 text-4xl lg:text-5xl font-extrabold tracking-tight">
            <span className="text-white">Trust</span>
            <span className="text-auth-blueLight">Aware</span>
          </h1>
          <p className="mt-2 text-sm font-semibold tracking-[0.25em] text-slate-200">
            SELF-HEALING <span className="text-auth-blueLight">AIoT</span>
          </p>
          <p className="text-xs tracking-[0.3em] text-slate-400">SENSOR NETWORK</p>

          <div className="mt-9 grid grid-cols-4 gap-3 lg:gap-5">
            {FEATURES.map((f) => (
              <div key={f.label} className="flex flex-col items-center gap-2">
                <div className="w-11 h-11 rounded-full bg-auth-panel2 border border-auth-blue/50 flex items-center justify-center shadow-[0_0_10px_rgba(37,99,235,0.4)]">
                  <f.icon size={16} className="text-auth-blueLight" />
                </div>
                <span className="text-[10px] text-slate-300">{f.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Compact branded header - mobile only, replaces the illustration panel */}
      <div className="md:hidden flex items-center gap-3 px-6 py-5 bg-auth-panel">
        <TrustAwareMark size="sm" />
        <div>
          <div className="font-extrabold text-lg leading-tight">
            <span className="text-white">Trust</span>
            <span className="text-auth-blueLight">Aware</span>
          </div>
          <div className="text-[10px] tracking-[0.15em] text-slate-400">SELF-HEALING AIoT SENSOR NETWORK</div>
        </div>
      </div>

      {/* Form panel - white - full half on desktop, full width on mobile */}
      <div className="w-full md:w-1/2 min-h-[calc(100vh-76px)] md:h-screen bg-white flex flex-col justify-center px-6 py-10 sm:px-12 md:px-16 lg:px-24 overflow-y-auto">
        <div className="w-full max-w-md mx-auto">{children}</div>
      </div>
    </div>
  );
}
