import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Radio,
  PlusCircle,
  HeartPulse,
  Cpu,
  PlusSquare,
  ListTree,
  Workflow,
  Activity,
  History,
  BarChart3,
  Server,
  Settings as SettingsIcon,
  LogOut,
} from "lucide-react";
import { useAuth } from "../auth/AuthContext.jsx";
import TrustAwareMark from "./TrustAwareMark.jsx";

const NAV_GROUPS = [
  {
    items: [{ to: "/", label: "Dashboard", icon: LayoutDashboard, end: true }],
  },
  {
    title: "Sensors",
    items: [
      { to: "/sensors", label: "Sensors", icon: Radio },
      { to: "/sensors/new", label: "Add Sensor", icon: PlusCircle },
      { to: "/sensor-health", label: "Sensor Health", icon: HeartPulse },
    ],
  },
  {
    title: "Actuators",
    items: [
      { to: "/actuators", label: "Actuators", icon: Cpu },
      { to: "/actuators/new", label: "Add Actuator", icon: PlusSquare },
      { to: "/actuator-history", label: "Actuator Events", icon: ListTree },
    ],
  },
  {
    title: "Automation",
    items: [{ to: "/automation", label: "Automation Rules", icon: Workflow }],
  },
  {
    title: "Analytics",
    items: [
      { to: "/self-healing", label: "Self-Healing", icon: Activity },
      { to: "/fault-history", label: "Fault History", icon: History },
      { to: "/charts", label: "Charts & Graphs", icon: BarChart3 },
    ],
  },
  {
    title: "System",
    items: [
      { to: "/nodes", label: "Nodes (ESP32)", icon: Server },
      { to: "/settings", label: "Settings", icon: SettingsIcon },
    ],
  },
];

export default function Sidebar() {
  const { user, logout } = useAuth();

  return (
    <aside className="w-60 shrink-0 h-screen sticky top-0 bg-base-panel border-r border-white/10 flex flex-col">
      <div className="flex items-center gap-2 px-5 py-5 border-b border-white/10">
        <TrustAwareMark size="sm" />
        <div>
          <div className="font-bold leading-tight">
            <span className="text-white">Trust</span>
            <span className="text-auth-blueLight">Aware</span>
          </div>
          <div className="text-[10px] text-[#94A3B8] leading-tight">AIoT Sensor Network</div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-5">
        {NAV_GROUPS.map((group, i) => (
          <div key={i}>
            {group.title && (
              <div className="px-2 mb-1 text-[10px] font-semibold tracking-wider text-[#94A3B8] uppercase">
                {group.title}
              </div>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors ${
                      isActive
                        ? "bg-accent-cyan/20 text-[#F8FAFC] font-medium"
                        : "text-[#94A3B8] font-medium hover:text-[#F8FAFC] hover:bg-white/5"
                    }`
                  }
                >
                  <item.icon size={16} />
                  {item.label}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="px-4 py-3 border-t border-white/10">
        {user && (
          <div className="flex items-center justify-between mb-2">
            <div className="min-w-0">
              <div className="text-xs font-medium text-[#F8FAFC] truncate">{user.full_name}</div>
              <div className="text-[10px] text-[#94A3B8] truncate">{user.email}</div>
            </div>
            <button
              onClick={logout}
              title="Sign out"
              className="p-1.5 rounded-md text-[#94A3B8] hover:text-status-faulty hover:bg-status-faulty/10 shrink-0"
            >
              <LogOut size={14} />
            </button>
          </div>
        )}
        <div className="text-[10px] text-[#94A3B8]">Trust-Aware Self-Healing IoT · v0.7.0</div>
      </div>
    </aside>
  );
}
