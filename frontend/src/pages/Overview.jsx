import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  HeartPulse,
  AlertTriangle,
  RotateCw,
  WifiOff,
  ShieldCheck,
  Cpu,
  Power,
  Radio as Radio2,
} from "lucide-react";
import Topbar from "../components/Topbar.jsx";
import StatCard from "../components/StatCard.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import TrustBar from "../components/TrustBar.jsx";
import FaultInjectionPanel from "../components/FaultInjectionPanel.jsx";
import { usePolling } from "../hooks/usePolling.js";
import {
  listSensors,
  listActuators,
  listFaultEvents,
  listActuatorEvents,
  commandActuator,
} from "../api/client.js";

function StatusIcon({ status }) {
  const map = {
    HEALTHY: <ShieldCheck size={18} className="text-status-healthy" />,
    FAULTY: <AlertTriangle size={18} className="text-status-faulty" />,
    RECOVERING: <RotateCw size={18} className="text-status-recovering" />,
    OFFLINE: <WifiOff size={18} className="text-status-offline" />,
  };
  return map[status] || map.OFFLINE;
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
  const [pendingCommand, setPendingCommand] = useState(null);

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

  const mostAtRisk = useMemo(() => {
    if (!sensors || sensors.length === 0) return null;
    return [...sensors].sort((a, b) => (a.trust_score ?? 100) - (b.trust_score ?? 100))[0];
  }, [sensors]);

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

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Live sensor overview */}
          <div className="xl:col-span-2 card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-slate-200">Live Sensor Overview</h2>
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
                {sensors.slice(0, 6).map((s) => (
                  <div key={s.sensor_id} className="rounded-lg border border-base-border p-3 bg-base-bg/40">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <StatusIcon status={s.status} />
                        <div>
                          <div className="text-sm font-semibold text-slate-100">{s.sensor_id}</div>
                          <div className="text-[11px] text-slate-500">{s.sensor_type}</div>
                        </div>
                      </div>
                      <StatusBadge status={s.status} />
                    </div>
                    <TrustBar score={s.trust_score} />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Self-healing status */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-slate-200">Self-Healing Status</h2>
              <Activity size={16} className="text-accent-cyan" />
            </div>
            {mostAtRisk ? (
              <div className="space-y-3 text-sm">
                <Row label="Sensor" value={mostAtRisk.sensor_id} />
                <Row
                  label="Status"
                  value={<StatusBadge status={mostAtRisk.status} />}
                />
                <Row label="Trust Score" value={`${mostAtRisk.trust_score?.toFixed(1) ?? "—"}%`} />
                <Row label="Type" value={mostAtRisk.sensor_type} />
                <Link
                  to="/self-healing"
                  className="inline-block mt-2 text-xs text-accent-cyan hover:underline"
                >
                  View Full Details →
                </Link>
              </div>
            ) : (
              <p className="text-sm text-slate-500">No sensor data yet.</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Actuator control */}
          <div className="xl:col-span-2 card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-slate-200">Actuator Control</h2>
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
                    className="flex items-center justify-between rounded-lg border border-base-border px-3 py-2.5"
                  >
                    <div className="flex items-center gap-2.5">
                      <Cpu size={16} className="text-accent-purple" />
                      <div>
                        <div className="text-sm font-semibold text-slate-100">{a.actuator_id}</div>
                        <div className="text-[11px] text-slate-500">{a.name}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={a.mode} />
                      <StatusBadge status={a.state} />
                      <button
                        disabled={pendingCommand === a.actuator_id + "ON"}
                        onClick={() => handleCommand(a.actuator_id, "ON")}
                        className="text-[11px] px-2 py-1 rounded-md bg-status-healthy/10 text-status-healthy hover:bg-status-healthy/20 disabled:opacity-40"
                      >
                        ON
                      </button>
                      <button
                        disabled={pendingCommand === a.actuator_id + "OFF"}
                        onClick={() => handleCommand(a.actuator_id, "OFF")}
                        className="text-[11px] px-2 py-1 rounded-md bg-slate-500/10 text-slate-300 hover:bg-slate-500/20 disabled:opacity-40"
                      >
                        OFF
                      </button>
                      <button
                        disabled={pendingCommand === a.actuator_id + "AUTO"}
                        onClick={() => handleCommand(a.actuator_id, "AUTO")}
                        className="text-[11px] px-2 py-1 rounded-md bg-accent-cyan/10 text-accent-cyan hover:bg-accent-cyan/20 disabled:opacity-40"
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
              <h2 className="font-semibold text-slate-200">Recent Fault Events</h2>
              <Link to="/fault-history" className="text-xs text-accent-cyan hover:underline">
                View All →
              </Link>
            </div>
            {!faultEvents ? (
              <SkeletonRows compact />
            ) : faultEvents.length === 0 ? (
              <p className="text-sm text-slate-500">No status transitions recorded yet.</p>
            ) : (
              <div className="space-y-2">
                {faultEvents.map((e) => (
                  <div key={e.id} className="text-xs flex items-center justify-between border-b border-base-border/60 pb-2 last:border-0 last:pb-0">
                    <div>
                      <span className="font-semibold text-slate-200">{e.sensor_id}</span>{" "}
                      <span className="text-slate-500">
                        {e.previous_status} → {e.new_status}
                      </span>
                    </div>
                    <span className="text-slate-500">
                      {new Date(e.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Fault Injection */}
        <FaultInjectionPanel sensors={sensors} />

        {/* Recent actuator events */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-200">Recent Actuator Events</h2>
            <Link to="/actuator-history" className="text-xs text-accent-cyan hover:underline">
              View All →
            </Link>
          </div>
          {!actuatorEvents ? (
            <SkeletonRows compact />
          ) : actuatorEvents.length === 0 ? (
            <p className="text-sm text-slate-500">No actuator commands recorded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-slate-500 border-b border-base-border">
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
                      <td className="py-2 pr-4 text-slate-500">
                        {new Date(e.timestamp).toLocaleTimeString()}
                      </td>
                      <td className="py-2 pr-4 text-slate-200 font-medium">{e.actuator_id}</td>
                      <td className="py-2 pr-4">
                        <StatusBadge status={e.command} />
                      </td>
                      <td className="py-2 pr-4 text-slate-400">{e.previous_state}</td>
                      <td className="py-2 pr-4 text-slate-200">{e.new_state}</td>
                      <td className="py-2 pr-4 text-slate-500">{e.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-500">{label}</span>
      <span className="text-slate-200 font-medium">{value}</span>
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
      <p className="text-sm text-slate-500 mb-2">{text}</p>
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
