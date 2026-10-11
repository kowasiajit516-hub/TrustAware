import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  HeartPulse,
  AlertTriangle,
  RotateCw,
  ShieldCheck,
  Power,
  Radio as Radio2,
} from "lucide-react";
import Topbar from "../components/Topbar.jsx";
import StatCard from "../components/StatCard.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import FaultInjectionPanel from "../components/FaultInjectionPanel.jsx";
import ActuatorIcon from "../components/ActuatorIcon.jsx";
import SensorIcon from "../components/SensorIcon.jsx";
import TrustRing from "../components/TrustRing.jsx";
import { usePolling } from "../hooks/usePolling.js";
import { useIsMobile } from "../hooks/useMediaQuery.js";
import { timeAgo } from "../utils/format.js";
import {
  listNodes,
  listSensors,
  listActuators,
  listFaultEvents,
  listActuatorEvents,
  commandActuator,
  getLatestTrustedReading,
} from "../api/client.js";
import { loadDashboard } from "../utils/dashboardLoader.js";

// Formats raw/trusted sensor values professionally - trims long
// floating point noise (e.g. 18.393884629... -> 18.39) without
// touching the underlying data.
function formatValue(value) {
  if (value === null || value === undefined) return "—";
  const num = Number(value);
  if (Number.isNaN(num)) return String(value);
  return Number.isInteger(num) ? String(num) : num.toFixed(2);
}

// Derived, frontend-only summary of what the self-healing pipeline is
// doing right now for a sensor - computed purely from data the backend
// already returns (status + trusted-reading source). No new backend
// logic; this is presentation only.
function healingActionFor(status, source) {
  if (!source) return "No healing data yet";
  if (status === "HEALTHY") return "Operating normally — raw value trusted";
  if (status === "RECOVERING" && source === "VIRTUAL")
    return "Virtual sensor engaged — trust recovering";
  if (status === "RECOVERING") return "Monitoring — trust recovering";
  if (status === "FAULTY" && source === "VIRTUAL")
    return "Fault detected — virtual sensor sustaining output";
  if (status === "FAULTY") return "Fault detected — awaiting virtual failover";
  if (status === "OFFLINE") return "No recent readings";
  return "—";
}

// Short, fixed-width type code for the narrow Self-Healing table column
// (e.g. TEMPERATURE -> TEMP, HUMIDITY -> HUM), matching the reference's
// abbreviated "TEMP"/"HUM" style. Purely a display shortening of the
// real sensor_type value - not a separate data field.
function abbreviateType(type) {
  if (!type) return "—";
  return type.length > 4 ? type.slice(0, 4) : type;
}

export default function Overview() {
  const { data: sensors } = usePolling(() => listSensors(), [], 4000);
  const { data: actuators, reload: reloadActuators } = usePolling(
    () => listActuators(),
    [],
    4000
  );
  const { data: faultEvents } = usePolling(
    () => listFaultEvents({ limit: 8 }),
    [],
    5000
  );
  const { data: actuatorEvents } = usePolling(
    () => listActuatorEvents({ limit: 8 }),
    [],
    5000
  );
  const isMobile = useIsMobile();
  // ESP32 node summary card is a phone-only addition; skip the request on desktop.
  const { data: nodes } = usePolling(
    () => (isMobile ? listNodes() : Promise.resolve(null)),
    [isMobile],
    8000
  );
  const [pendingCommand, setPendingCommand] = useState(null);


  // Physical/trusted/source per visible sensor - real data from the
  // real Phase 5 trusted-readings pipeline, just not previously shown
  // on this page. Fetched per sensor since there's no bulk
  // "latest-per-sensor" endpoint.
  // ALL sensors (GET /dashboard/sensors, or the standard endpoints if that one is not deployed yet): raw / trusted / source per sensor.
  // Sensors with no trusted value yet map to null and still get their row/card.
  const { data: dashboard } = usePolling(() => loadDashboard(), [], 4000);
  const trustedBySensor = useMemo(() => {
    const map = {};
    (dashboard?.sensors || []).forEach((s) => {
      map[s.sensor_id] = s.source
        ? { raw_value: s.raw_value, trusted_value: s.trusted_value, source: s.source }
        : s.raw_value !== null && s.raw_value !== undefined
        ? { raw_value: s.raw_value, trusted_value: null, source: null }
        : null;
    });
    return map;
  }, [dashboard]);

  const stats = useMemo(() => {
    if (!sensors) return null;
    const total = sensors.length;
    const byStatus = { HEALTHY: 0, FAULTY: 0, RECOVERING: 0, OFFLINE: 0 };
    let trustSum = 0;
    sensors.forEach((s) => {
      byStatus[s.status] = (byStatus[s.status] || 0) + 1;
      trustSum += s.trust_score ?? 0;
    });
    const avgTrust = total ? trustSum / total : 0;
    return { total, byStatus, avgTrust };
  }, [sensors]);

  const actuatorStats = useMemo(() => {
    if (!actuators) return null;
    return {
      total: actuators.length,
      on: actuators.filter((a) => a.state === "ON").length,
    };
  }, [actuators]);

  async function handleCommand(actuatorId, command) {
    setPendingCommand(actuatorId + command);
    try {
      await commandActuator(actuatorId, command);
      await reloadActuators();
    } catch (err) {
      console.error(err);
    } finally {
      setPendingCommand(null);
    }
  }

  return (
    <div>
      <Topbar
        title="Self-Healing AIoT Sensor Network"
        subtitle="AI-Based Fault Detection · Dynamic Trust · Virtual Sensing"
      />

      <div className="p-6 space-y-6">
        {/* Stat row */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <StatCard icon={Radio2} label="Total Sensors" value={stats?.total ?? "—"} tone="cyan" />
          <StatCard
            icon={ShieldCheck}
            label="Healthy"
            value={stats?.byStatus.HEALTHY ?? "—"}
            sub={stats ? `${pct(stats.byStatus.HEALTHY, stats.total)}%` : undefined}
            tone="healthy"
          />
          <StatCard
            icon={AlertTriangle}
            label="Faulty"
            value={stats?.byStatus.FAULTY ?? "—"}
            sub={stats ? `${pct(stats.byStatus.FAULTY, stats.total)}%` : undefined}
            tone="faulty"
          />
          <StatCard
            icon={RotateCw}
            label="Recovering"
            value={stats?.byStatus.RECOVERING ?? "—"}
            sub={stats ? `${pct(stats.byStatus.RECOVERING, stats.total)}%` : undefined}
            tone="recovering"
          />
          <StatCard
            icon={HeartPulse}
            label="Avg Trust"
            value={stats ? `${stats.avgTrust.toFixed(1)}%` : "—"}
            tone="cyan"
          />
          <StatCard
            icon={Power}
            label="Actuators On"
            value={actuatorStats ? `${actuatorStats.on}/${actuatorStats.total}` : "—"}
            tone="purple"
          />
        </div>

        {/* Phones / small tablets: active faults + ESP32 nodes at a glance */}
        <div className="lg:hidden grid grid-cols-1 sm:grid-cols-2 gap-4">
          <ActiveFaultsCard sensors={sensors} />
          <NodesCard nodes={nodes} />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Live sensor overview */}
          <div className="xl:col-span-2 card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-[#F8FAFC]">Live Sensor Overview</h2>
              <Link to="/sensors" className="text-xs text-accent-cyan hover:underline">
                View All Sensors →
              </Link>
            </div>
            {!sensors ? (
              <SkeletonRows />
            ) : sensors.length === 0 ? (
              <EmptyState text="No sensors yet. Add one to start the pipeline." action="/sensors/new" />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {sensors.map((s) => {
                  const tr = trustedBySensor?.[s.sensor_id];
                  return (
                    <div key={s.sensor_id} className="rounded-md border border-base-border p-3 bg-base-bg/40 flex gap-3">
                      <TrustRing score={s.trust_score} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-0.5">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <SensorIcon type={s.sensor_type} size={14} className="text-[#94A3B8] shrink-0" />
                            <span className="text-sm font-semibold text-[#F8FAFC] truncate">{s.sensor_id}</span>
                          </div>
                          <StatusBadge status={s.status} className="shrink-0" />
                        </div>
                        <div className="text-[11px] text-[#94A3B8] mb-2">{s.sensor_type}</div>
                        {tr && (
                          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-base-border text-[11px]">
                            <div>
                              <div className="text-[#94A3B8]">Physical</div>
                              <div className="text-[#F8FAFC] font-semibold">{formatValue(tr.raw_value)}</div>
                            </div>
                            <div>
                              <div className="text-[#94A3B8]">Trusted</div>
                              <div className="text-[#F8FAFC] font-semibold">{formatValue(tr.trusted_value)}</div>
                            </div>
                            <div>
                              <div className="text-[#94A3B8]">Source</div>
                              <StatusBadge status={tr.source} />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Self-healing status - compact multi-sensor table, matching the
              reference. Uses the same real sensors + trusted-readings data
              as the Live Sensor Overview cards - not a separate data source. */}
          <div className="card p-5 overflow-hidden">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-semibold text-[#F8FAFC]">Self-Healing Status</h2>
                <p className="text-[11px] text-[#94A3B8]">AI monitoring and automatic recovery</p>
              </div>
              <Link to="/self-healing" className="text-xs text-accent-cyan hover:underline shrink-0">
                View Full Details →
              </Link>
            </div>
            {!sensors ? (
              <SkeletonRows compact />
            ) : sensors.length === 0 ? (
              <p className="text-sm text-[#94A3B8]">No sensor data yet.</p>
            ) : (
              <>
              <div className="hidden lg:block overflow-x-auto -mx-1">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="text-left text-[#94A3B8] border-b border-base-border">
                      <th className="py-2 px-1 font-medium">Sensor</th>
                      <th className="py-2 px-1 font-medium">Status</th>
                      <th className="py-2 px-1 font-medium">Trust</th>
                      <th className="py-2 px-1 font-medium">Type</th>
                      <th className="py-2 px-1 font-medium">Physical</th>
                      <th className="py-2 px-1 font-medium">Trusted</th>
                      <th className="py-2 px-1 font-medium">Source</th>
                      <th className="py-2 px-1 font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sensors.map((s) => {
                      const tr = trustedBySensor?.[s.sensor_id];
                      return (
                        <tr key={s.sensor_id} className="border-b border-base-border/60 last:border-0">
                          <td className="py-2 px-1 font-semibold text-[#F8FAFC] max-w-[110px] break-words">
                            {s.sensor_id}
                          </td>
                          <td className="py-2 px-1">
                            <StatusBadge status={s.status} />
                          </td>
                          <td className="py-2 px-1 text-[#F8FAFC]">{Math.round(s.trust_score ?? 0)}%</td>
                          <td className="py-2 px-1 text-[#94A3B8]">{abbreviateType(s.sensor_type)}</td>
                          <td className="py-2 px-1 text-[#F8FAFC]">{tr ? formatValue(tr.raw_value) : "—"}</td>
                          <td className="py-2 px-1 text-[#F8FAFC]">{tr ? formatValue(tr.trusted_value) : "—"}</td>
                          <td className="py-2 px-1">{tr ? <StatusBadge status={tr.source} /> : "—"}</td>
                          <td className="py-2 px-1 text-[#94A3B8]">{healingActionFor(s.status, tr?.source)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="lg:hidden space-y-2">
                {sensors.map((s) => {
                  const tr = trustedBySensor?.[s.sensor_id];
                  return (
                    <div key={s.sensor_id} className="rounded-lg border border-base-border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-[#F8FAFC] truncate">{s.sensor_id}</span>
                        <StatusBadge status={s.status} className="shrink-0" />
                      </div>
                      <div className="grid grid-cols-3 gap-2 mt-2 text-[11px]">
                        <div>
                          <div className="text-[#94A3B8]">Trust</div>
                          <div className="text-[#F8FAFC] font-semibold">{Math.round(s.trust_score ?? 0)}%</div>
                        </div>
                        <div>
                          <div className="text-[#94A3B8]">Physical</div>
                          <div className="text-[#F8FAFC] font-semibold">{tr ? formatValue(tr.raw_value) : "—"}</div>
                        </div>
                        <div>
                          <div className="text-[#94A3B8]">Trusted</div>
                          <div className="text-[#F8FAFC] font-semibold">{tr ? formatValue(tr.trusted_value) : "—"}</div>
                        </div>
                      </div>
                      <p className="mt-2 text-[11px] text-[#94A3B8]">{healingActionFor(s.status, tr?.source)}</p>
                    </div>
                  );
                })}
              </div>
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Actuator control */}
          <div className="xl:col-span-2 card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-[#F8FAFC]">Actuator Control</h2>
              <Link to="/actuators" className="text-xs text-accent-cyan hover:underline">
                View All →
              </Link>
            </div>
            {!actuators ? (
              <SkeletonRows />
            ) : actuators.length === 0 ? (
              <EmptyState text="No actuators yet." action="/actuators/new" />
            ) : (
              <div className="space-y-2">
                {actuators.slice(0, 6).map((a) => (
                  <div
                    key={a.actuator_id}
                    className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-lg border border-base-border px-3 py-2.5"
                  >
                    <div className="flex items-center gap-2.5">
                      <ActuatorIcon type={a.actuator_type} size={16} className="text-accent-purple" />
                      <div>
                        <div className="text-sm font-semibold text-[#F8FAFC]">{a.actuator_id}</div>
                        <div className="text-[11px] text-[#94A3B8]">{a.name}</div>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={a.mode} />
                      <StatusBadge status={a.state} />
                      <button
                        disabled={pendingCommand === a.actuator_id + "ON"}
                        onClick={() => handleCommand(a.actuator_id, "ON")}
                        className="text-[11px] font-semibold px-2 py-1 rounded-md bg-status-healthy/10 text-status-healthy hover:bg-status-healthy/20 disabled:opacity-40"
                      >
                        ON
                      </button>
                      <button
                        disabled={pendingCommand === a.actuator_id + "OFF"}
                        onClick={() => handleCommand(a.actuator_id, "OFF")}
                        className="text-[11px] font-semibold px-2 py-1 rounded-md bg-[#94A3B8]/10 text-[#F8FAFC] hover:bg-[#94A3B8]/20 disabled:opacity-40"
                      >
                        OFF
                      </button>
                      <button
                        disabled={pendingCommand === a.actuator_id + "AUTO"}
                        onClick={() => handleCommand(a.actuator_id, "AUTO")}
                        className="text-[11px] font-semibold px-2 py-1 rounded-md bg-accent-cyan/10 text-accent-cyan hover:bg-accent-cyan/20 disabled:opacity-40"
                      >
                        AUTO
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent fault events */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-[#F8FAFC]">Recent Fault Events</h2>
              <Link to="/fault-history" className="text-xs text-accent-cyan hover:underline">
                View All →
              </Link>
            </div>
            {!faultEvents ? (
              <SkeletonRows compact />
            ) : faultEvents.length === 0 ? (
              <p className="text-sm text-[#94A3B8]">No status transitions recorded yet.</p>
            ) : (
              <div className="space-y-2">
                {faultEvents.map((e) => (
                  <div key={e.id} className="text-xs flex items-center justify-between border-b border-base-border/60 pb-2 last:border-0 last:pb-0">
                    <div>
                      <span className="font-semibold text-[#F8FAFC]">{e.sensor_id}</span>{" "}
                      <span className="text-[#94A3B8]">
                        {e.previous_status} → {e.new_status}
                      </span>
                    </div>
                    <span className="text-[#94A3B8]">
                      {new Date(e.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Fault Injection */}
        <div className="hidden lg:block">
          <FaultInjectionPanel sensors={sensors} />
        </div>

        {/* Recent actuator events */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-[#F8FAFC]">Recent Actuator Events</h2>
            <Link to="/actuator-history" className="text-xs text-accent-cyan hover:underline">
              View All →
            </Link>
          </div>
          {!actuatorEvents ? (
            <SkeletonRows compact />
          ) : actuatorEvents.length === 0 ? (
            <p className="text-sm text-[#94A3B8]">No actuator commands recorded yet.</p>
          ) : (
            <>
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-[#94A3B8] border-b border-base-border">
                    <th className="py-2 pr-4 font-medium">Time</th>
                    <th className="py-2 pr-4 font-medium">Actuator</th>
                    <th className="py-2 pr-4 font-medium">Command</th>
                    <th className="py-2 pr-4 font-medium">Previous</th>
                    <th className="py-2 pr-4 font-medium">New</th>
                    <th className="py-2 pr-4 font-medium">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {actuatorEvents.map((e) => (
                    <tr key={e.id} className="border-b border-base-border/50 last:border-0">
                      <td className="py-2 pr-4 text-[#94A3B8]">
                        {new Date(e.timestamp).toLocaleTimeString()}
                      </td>
                      <td className="py-2 pr-4 text-[#F8FAFC] font-medium">{e.actuator_id}</td>
                      <td className="py-2 pr-4">
                        <StatusBadge status={e.command} />
                      </td>
                      <td className="py-2 pr-4 text-[#94A3B8]">{e.previous_state}</td>
                      <td className="py-2 pr-4 text-[#F8FAFC]">{e.new_state}</td>
                      <td className="py-2 pr-4 text-[#94A3B8]">{e.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="lg:hidden space-y-2">
              {actuatorEvents.map((e) => (
                <div key={e.id} className="rounded-lg border border-base-border p-3 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-[#F8FAFC] truncate">{e.actuator_id}</span>
                    <span className="text-[#94A3B8] shrink-0">{new Date(e.timestamp).toLocaleTimeString()}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mt-1.5">
                    <StatusBadge status={e.command} />
                    <span className="text-[#94A3B8]">
                      {e.previous_state} → <span className="text-[#F8FAFC]">{e.new_state}</span>
                    </span>
                  </div>
                  {e.reason && <p className="mt-1.5 text-[11px] text-[#94A3B8] break-words">{e.reason}</p>}
                </div>
              ))}
            </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ActiveFaultsCard({ sensors }) {
  const active = (sensors || []).filter((s) => s.status !== "HEALTHY");
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold text-[#F8FAFC]">Active Faults</h2>
        <Link to="/fault-history" className="text-xs text-accent-cyan">History →</Link>
      </div>
      {!sensors ? (
        <p className="text-xs text-[#94A3B8]">Loading…</p>
      ) : active.length === 0 ? (
        <p className="text-xs text-status-healthy">All sensors healthy</p>
      ) : (
        <ul className="space-y-1.5">
          {active.slice(0, 5).map((s) => (
            <li key={s.sensor_id}>
              <Link to={`/sensors/${s.sensor_id}`} className="flex items-center justify-between gap-2 min-h-[44px]">
                <span className="text-xs font-semibold text-[#F8FAFC] truncate">{s.sensor_id}</span>
                <span className="flex items-center gap-2 shrink-0">
                  <span className="text-[11px] text-[#94A3B8]">{Math.round(s.trust_score ?? 0)}%</span>
                  <StatusBadge status={s.status} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NodesCard({ nodes }) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold text-[#F8FAFC]">ESP32 Nodes</h2>
        <Link to="/nodes" className="text-xs text-accent-cyan">All →</Link>
      </div>
      {!nodes ? (
        <p className="text-xs text-[#94A3B8]">Loading…</p>
      ) : nodes.length === 0 ? (
        <p className="text-xs text-[#94A3B8]">No nodes registered yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {nodes.slice(0, 5).map((n) => (
            <li key={n.node_id}>
              <Link to={`/nodes/${n.node_id}`} className="flex items-center justify-between gap-2 min-h-[44px]">
                <span className="min-w-0">
                  <span className="block text-xs font-semibold text-[#F8FAFC] truncate">{n.name}</span>
                  <span className="block text-[11px] text-[#94A3B8]">
                    {n.last_seen ? timeAgo(n.last_seen) : "never seen"}
                  </span>
                </span>
                <StatusBadge status={n.status} className="shrink-0" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SkeletonRows({ compact = false }) {
  return (
    <div className="space-y-2 animate-pulse">
      {Array.from({ length: compact ? 3 : 4 }).map((_, i) => (
        <div key={i} className="h-10 rounded-lg bg-base-hover" />
      ))}
    </div>
  );
}

function EmptyState({ text, action }) {
  return (
    <div className="text-center py-8">
      <p className="text-sm text-[#94A3B8] mb-2">{text}</p>
      <Link to={action} className="text-xs text-accent-cyan hover:underline">
        Add one now →
      </Link>
    </div>
  );
}

function pct(n, total) {
  if (!total) return 0;
  return Math.round((n / total) * 100);
}
