import { useEffect, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Activity,
  Power,
  HeartPulse,
  Workflow,
  MoreHorizontal,
  Cpu,
  AlertTriangle,
  History,
  LineChart,
  Settings as SettingsIcon,
  Zap,
  LogOut,
  X,
} from "lucide-react";
import { useAuth } from "../auth/AuthContext.jsx";

/*
 * Mobile bottom navigation (shown at <= 768px only; hidden by CSS on desktop,
 * where the existing <Sidebar /> is used instead).
 *
 * Uses the EXISTING react-router routes from App.jsx - nothing new is routed.
 *
 * `match` lists every path prefix that should light up the tab, so nested
 * routes (/sensors/new, /sensors/:id/edit, ...) and the /sensor-health alias
 * keep the correct tab highlighted.
 */
const TABS = [
  { to: "/", label: "Overview", icon: LayoutDashboard, match: ["/"], exact: true },
  { to: "/sensors", label: "Sensors", icon: Activity, match: ["/sensors"] },
  { to: "/actuators", label: "Actuators", icon: Power, match: ["/actuators"] },
  {
    to: "/self-healing",
    label: "Self-Healing",
    icon: HeartPulse,
    match: ["/self-healing", "/sensor-health"],
  },
  { to: "/automation", label: "Automation", icon: Workflow, match: ["/automation"] },
];

/* Items inside the "More" sheet (all are real routes declared in App.jsx). */
const MORE_ITEMS = [
  { to: "/nodes", label: "ESP32 Nodes", hint: "Devices & connectivity", icon: Cpu },
  { to: "/fault-injection", label: "Fault Injection", hint: "Demo the self-healing loop", icon: Zap },
  { to: "/fault-history", label: "Fault History", hint: "Detected faults", icon: AlertTriangle },
  { to: "/actuator-history", label: "Actuator History", hint: "Commands & events", icon: History },
  { to: "/charts", label: "Charts", hint: "Graphs & analysis", icon: LineChart },
  { to: "/settings", label: "Settings", hint: "Account & system", icon: SettingsIcon },
];

function isActivePath(pathname, item) {
  if (item.exact) return pathname === item.to;
  return (item.match || [item.to]).some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
}

export default function MobileNav() {
  const { pathname } = useLocation();
  const { user, logout } = useAuth();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreBtnRef = useRef(null);
  const closeBtnRef = useRef(null);

  const moreActive = MORE_ITEMS.some((i) => isActivePath(pathname, i));

  // Close the sheet whenever the route changes.
  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  // While open: Escape closes, page behind does not scroll, focus moves in.
  useEffect(() => {
    if (!moreOpen) return undefined;

    const onKey = (e) => {
      if (e.key === "Escape") setMoreOpen(false);
    };
    document.addEventListener("keydown", onKey);

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    closeBtnRef.current?.focus();
    const btn = moreBtnRef.current;

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      btn?.focus?.();
    };
  }, [moreOpen]);

  return (
    <>
      <nav className="ta-bottomnav" aria-label="Primary">
        <ul className="ta-bottomnav__list">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            // While the More sheet is open, only "More" shows as active.
            const active = !moreOpen && isActivePath(pathname, tab);
            return (
              <li key={tab.to} className="ta-bottomnav__cell">
                <NavLink
                  to={tab.to}
                  end={tab.exact}
                  className={`ta-bottomnav__item${active ? " is-active" : ""}`}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon size={22} strokeWidth={active ? 2.25 : 1.75} aria-hidden="true" />
                  <span className="ta-bottomnav__label">{tab.label}</span>
                </NavLink>
              </li>
            );
          })}

          <li className="ta-bottomnav__cell">
            <button
              ref={moreBtnRef}
              type="button"
              className={`ta-bottomnav__item${moreActive || moreOpen ? " is-active" : ""}`}
              aria-haspopup="dialog"
              aria-expanded={moreOpen}
              onClick={() => setMoreOpen((v) => !v)}
            >
              <MoreHorizontal size={22} strokeWidth={moreActive || moreOpen ? 2.25 : 1.75} aria-hidden="true" />
              <span className="ta-bottomnav__label">More</span>
            </button>
          </li>
        </ul>
      </nav>

      {moreOpen && (
        <div className="ta-sheet-root">
          <div className="ta-sheet-backdrop" onClick={() => setMoreOpen(false)} aria-hidden="true" />
          <div className="ta-sheet" role="dialog" aria-modal="true" aria-label="More">
            <div className="ta-sheet__handle" aria-hidden="true" />
            <div className="ta-sheet__head">
              <h2 className="ta-sheet__title">More</h2>
              <button
                ref={closeBtnRef}
                type="button"
                className="ta-iconbtn"
                onClick={() => setMoreOpen(false)}
                aria-label="Close menu"
              >
                <X size={20} aria-hidden="true" />
              </button>
            </div>

            <ul className="ta-sheet__grid">
              {MORE_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = isActivePath(pathname, item);
                return (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      className={`ta-tile${active ? " is-active" : ""}`}
                      aria-current={active ? "page" : undefined}
                    >
                      <span className="ta-tile__icon">
                        <Icon size={20} aria-hidden="true" />
                      </span>
                      <span className="ta-tile__text">
                        <span className="ta-tile__label">{item.label}</span>
                        <span className="ta-tile__hint">{item.hint}</span>
                      </span>
                    </NavLink>
                  </li>
                );
              })}
            </ul>

            {user && (
              <div className="ta-sheet__account">
                <div className="ta-sheet__user">
                  <span className="ta-sheet__name">{user.full_name}</span>
                  <span className="ta-sheet__email">{user.email}</span>
                </div>
                <button type="button" className="ta-signout" onClick={logout}>
                  <LogOut size={16} aria-hidden="true" />
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
