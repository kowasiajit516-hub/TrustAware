import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ChevronLeft, WifiOff } from "lucide-react";
import { getHealth } from "../api/client.js";

/*
 * Mobile top header (shown at <= 768px only). Purely presentational:
 * derives the title from the current route and makes NO API calls.
 *
 * Top-level tabs show the brand mark; nested pages (add / edit forms)
 * show a back button instead.
 */

// Ordered: first match wins. Patterns cover the routes declared in App.jsx.
const ROUTES = [
  { re: /^\/$/, title: "Overview", root: true },
  { re: /^\/sensors$/, title: "Sensors", root: true },
  { re: /^\/sensors\/new$/, title: "Add Sensor", parent: "/sensors" },
  { re: /^\/sensors\/[^/]+\/edit$/, title: "Edit Sensor", parent: "/sensors" },
  { re: /^\/sensors\/[^/]+$/, title: "Sensor Details", parent: "/sensors" },
  { re: /^\/actuators$/, title: "Actuators", root: true },
  { re: /^\/actuators\/new$/, title: "Add Actuator", parent: "/actuators" },
  { re: /^\/actuators\/[^/]+\/edit$/, title: "Edit Actuator", parent: "/actuators" },
  { re: /^\/automation$/, title: "Automation Rules", root: true },
  { re: /^\/self-healing$/, title: "Self-Healing", root: true },
  { re: /^\/sensor-health$/, title: "Self-Healing", root: true },
  { re: /^\/fault-history$/, title: "Fault History", parent: "/" },
  { re: /^\/actuator-history$/, title: "Actuator History", parent: "/" },
  { re: /^\/charts$/, title: "Charts & Graphs", parent: "/" },
  { re: /^\/nodes$/, title: "ESP32 Nodes", parent: "/" },
  { re: /^\/nodes\/[^/]+$/, title: "Node Details", parent: "/nodes" },
  { re: /^\/fault-injection$/, title: "Fault Injection", parent: "/" },
  { re: /^\/settings$/, title: "Settings", parent: "/" },
];

function resolve(pathname) {
  const clean = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return ROUTES.find((r) => r.re.test(clean)) || { title: "TrustAware", root: true };
}

function BrandMark() {
  return (
    <svg className="ta-brand" viewBox="0 0 32 32" width="28" height="28" aria-hidden="true">
      <path
        d="M16 3l10 4v8c0 6.2-4.2 11-10 14C10.2 26 6 21.2 6 15V7l10-4z"
        fill="none"
        stroke="#00d2ff"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M9.5 16h4l1.8-5 2.6 10 1.8-5h2.8"
        fill="none"
        stroke="#00d2ff"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function MobileHeader() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [online, setOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine
  );

  // Real device connectivity (not a fake backend-status indicator).
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  // Real backend reachability (same GET /health the desktop Topbar polls).
  const [backend, setBackend] = useState(null); // null = checking
  useEffect(() => {
    let cancelled = false;
    const check = () =>
      getHealth()
        .then(() => !cancelled && setBackend(true))
        .catch(() => !cancelled && setBackend(false));
    check();
    const id = setInterval(check, 10000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const route = resolve(pathname);

  const goBack = () => {
    // Prefer real history; fall back to the parent route on a cold deep-link.
    if (window.history.length > 1) navigate(-1);
    else navigate(route.parent || "/");
  };

  return (
    <header className="ta-topbar">
      {route.root ? (
        <BrandMark />
      ) : (
        <button type="button" className="ta-iconbtn" onClick={goBack} aria-label="Go back">
          <ChevronLeft size={22} aria-hidden="true" />
        </button>
      )}

      <div className="ta-topbar__titles">
        <span className="ta-topbar__eyebrow">TrustAware</span>
        <h1 className="ta-topbar__title">{route.title}</h1>
      </div>

      {!online ? (
        <span className="ta-chip ta-chip--warn" role="status">
          <WifiOff size={14} aria-hidden="true" />
          No network
        </span>
      ) : (
        <span
          className={`ta-chip ${backend === false ? "ta-chip--bad" : backend ? "ta-chip--ok" : ""}`}
          role="status"
        >
          <span className="ta-dot" aria-hidden="true" />
          {backend === null ? "Checking" : backend ? "Online" : "Unreachable"}
        </span>
      )}
    </header>
  );
}
