import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Pencil, Trash2, Power, PowerOff, Cpu, ToggleRight, ToggleLeft, Zap } from "lucide-react";
import Topbar from "../components/Topbar.jsx";
import StatCard from "../components/StatCard.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import ActuatorCard from "../components/ActuatorCard.jsx";
import { usePolling } from "../hooks/usePolling.js";
import { useIsMobile } from "../hooks/useMediaQuery.js";
import {
  listRules,
  listActuators,
  deleteActuator,
  enableActuator,
  disableActuator,
  commandActuator,
} from "../api/client.js";

export default function Actuators() {
  const { data: actuators, reload } = usePolling(() => listActuators(), [], 5000);
  const isMobile = useIsMobile();
  // Phone cards show which automation rule(s) control each actuator
  // (real GET /automation-rules). Only fetched on phones.
  const { data: rules } = usePolling(
    () => (isMobile ? listRules() : Promise.resolve([])),
    [isMobile],
    10000
  );
  const [pendingCmd, setPendingCmd] = useState(null); // "ACTUATOR_ID:COMMAND"
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  // Real summary, built only from fields the backend actually returns.
  // "Enabled/Disabled" is used instead of "Online/Offline" because
  // actuators have no connectivity/heartbeat concept yet (that's a
  // Phase 8 ESP32 thing) - `enabled` is the real closest equivalent.
  const summary = useMemo(() => {
    if (!actuators) return null;
    return {
      total: actuators.length,
      enabled: actuators.filter((a) => a.enabled).length,
      disabled: actuators.filter((a) => !a.enabled).length,
      auto: actuators.filter((a) => a.mode === "AUTO").length,
    };
  }, [actuators]);

  async function guarded(id, fn) {
    setBusy(id);
    setError(null);
    try {
      await fn();
      await reload();
    } catch (err) {
      setError(err.detail || err.message);
    } finally {
      setBusy(null);
    }
  }

  async function sendCommand(actuatorId, command) {
    setPendingCmd(`${actuatorId}:${command}`);
    await guarded(actuatorId, () => commandActuator(actuatorId, command));
    setPendingCmd(null);
  }

  return (
    <div>
      <Topbar title="Actuators" subtitle="Fan, LED, buzzer, pump, relay, motor and more — driven only by trusted values (Phase 9)" />
      <div className="p-6 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard icon={Cpu} label="Total Actuators" value={summary?.total ?? "—"} tone="cyan" />
          <StatCard icon={ToggleRight} label="Enabled" value={summary?.enabled ?? "—"} tone="healthy" />
          <StatCard icon={ToggleLeft} label="Disabled" value={summary?.disabled ?? "—"} tone="offline" />
          <StatCard icon={Zap} label="Auto Mode" value={summary?.auto ?? "—"} tone="cyan" />
        </div>

        <div className="flex items-center justify-between">
          <p className="text-sm text-[#94A3B8]">
            {actuators ? `${actuators.length} actuator${actuators.length === 1 ? "" : "s"}` : "Loading…"}
          </p>
          <Link
            to="/actuators/new"
            className="min-h-[44px] lg:min-h-0 inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-2 rounded-lg bg-gradient-to-r from-accent-blue to-accent-purple text-white hover:opacity-90"
          >
            <Plus size={16} /> Add Actuator
          </Link>
        </div>

        {error && (
          <div className="text-sm text-status-faulty bg-status-faulty/10 border border-status-faulty/30 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        {/* Phones / small tablets: one control card per actuator */}
        <div className="lg:hidden space-y-3">
          {!actuators && (
            <p className="text-center text-sm text-[#94A3B8] py-8">Loading actuators…</p>
          )}
          {actuators && actuators.length === 0 && (
            <div className="card p-6 text-center text-sm text-[#94A3B8]">
              No actuators yet.{" "}
              <Link to="/actuators/new" className="text-accent-cyan hover:underline">
                Add your first actuator →
              </Link>
            </div>
          )}
          {actuators?.map((a) => (
            <ActuatorCard
              key={a.actuator_id}
              actuator={a}
              rules={(rules || []).filter((r) => r.actuator_id === a.actuator_id)}
              busy={busy === a.actuator_id}
              busyCommand={pendingCmd && pendingCmd.startsWith(`${a.actuator_id}:`) ? pendingCmd.split(":")[1] : null}
              onCommand={sendCommand}
              onToggleEnabled={(act) =>
                guarded(act.actuator_id, () =>
                  act.enabled ? disableActuator(act.actuator_id) : enableActuator(act.actuator_id)
                )
              }
              onDelete={(id) => {
                if (confirm(`Delete actuator ${id}?`)) guarded(id, () => deleteActuator(id));
              }}
            />
          ))}
        </div>

        <div className="hidden lg:block card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[#94A3B8] text-xs border-b border-base-border bg-base-bg/40">
                <th className="py-2 px-4 font-medium">Actuator ID</th>
                <th className="py-2 px-4 font-medium">Name</th>
                <th className="py-2 px-4 font-medium">Type</th>
                <th className="py-2 px-4 font-medium">Location</th>
                <th className="py-2 px-4 font-medium">Mode</th>
                <th className="py-2 px-4 font-medium">State</th>
                <th className="py-2 px-4 font-medium">Control</th>
                <th className="py-2 px-4 font-medium">Enabled</th>
                <th className="py-2 px-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {!actuators && (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-[#94A3B8]">
                    Loading actuators…
                  </td>
                </tr>
              )}
              {actuators && actuators.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-10 text-center text-[#94A3B8]">
                    No actuators yet.{" "}
                    <Link to="/actuators/new" className="text-accent-cyan hover:underline">
                      Add your first actuator →
                    </Link>
                  </td>
                </tr>
              )}
              {actuators?.map((a) => (
                <tr key={a.actuator_id} className="border-b border-base-border/60 last:border-0 hover:bg-base-hover/50">
                  <td className="py-2 px-4 font-semibold text-[#F8FAFC]">{a.actuator_id}</td>
                  <td className="py-2 px-4 text-[#F8FAFC]">{a.name}</td>
                  <td className="py-2 px-4 text-[#94A3B8]">{a.actuator_type}</td>
                  <td className="py-2 px-4 text-[#94A3B8]">{a.location}</td>
                  <td className="py-2 px-4">
                    <StatusBadge status={a.mode} />
                  </td>
                  <td className="py-2 px-4">
                    <StatusBadge status={a.state} />
                  </td>
                  <td className="py-2 px-4">
                    <div className="flex items-center gap-1">
                      <button
                        disabled={busy === a.actuator_id}
                        onClick={() => guarded(a.actuator_id, () => commandActuator(a.actuator_id, "ON"))}
                        className="text-[11px] font-semibold px-2 py-1 rounded-md bg-status-healthy/10 text-status-healthy hover:bg-status-healthy/20 disabled:opacity-40"
                      >
                        ON
                      </button>
                      <button
                        disabled={busy === a.actuator_id}
                        onClick={() => guarded(a.actuator_id, () => commandActuator(a.actuator_id, "OFF"))}
                        className="text-[11px] font-semibold px-2 py-1 rounded-md bg-[#94A3B8]/10 text-[#F8FAFC] hover:bg-[#94A3B8]/20 disabled:opacity-40"
                      >
                        OFF
                      </button>
                      <button
                        disabled={busy === a.actuator_id}
                        onClick={() => guarded(a.actuator_id, () => commandActuator(a.actuator_id, "AUTO"))}
                        className="text-[11px] font-semibold px-2 py-1 rounded-md bg-accent-cyan/10 text-accent-cyan hover:bg-accent-cyan/20 disabled:opacity-40"
                      >
                        AUTO
                      </button>
                    </div>
                  </td>
                  <td className="py-2 px-4">
                    <button
                      disabled={busy === a.actuator_id}
                      onClick={() =>
                        guarded(a.actuator_id, () =>
                          a.enabled ? disableActuator(a.actuator_id) : enableActuator(a.actuator_id)
                        )
                      }
                      className="text-[#94A3B8] hover:text-[#F8FAFC] disabled:opacity-40"
                      title={a.enabled ? "Disable" : "Enable"}
                    >
                      {a.enabled ? <Power size={16} className="text-status-healthy" /> : <PowerOff size={16} />}
                    </button>
                  </td>
                  <td className="py-2 px-4">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        to={`/actuators/${a.actuator_id}/edit`}
                        className="p-1.5 rounded-md hover:bg-base-hover text-[#94A3B8] hover:text-accent-cyan"
                        title="Edit"
                      >
                        <Pencil size={15} />
                      </Link>
                      <button
                        disabled={busy === a.actuator_id}
                        onClick={() => {
                          if (confirm(`Delete actuator ${a.actuator_id}?`)) {
                            guarded(a.actuator_id, () => deleteActuator(a.actuator_id));
                          }
                        }}
                        className="p-1.5 rounded-md hover:bg-base-hover text-[#94A3B8] hover:text-status-faulty disabled:opacity-40"
                        title="Delete"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
