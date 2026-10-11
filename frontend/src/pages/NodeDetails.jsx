import { Link, useParams } from "react-router-dom";
import Topbar from "../components/Topbar.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import SensorIcon from "../components/SensorIcon.jsx";
import ActuatorIcon from "../components/ActuatorIcon.jsx";
import { usePolling } from "../hooks/usePolling.js";
import { formatDateTime, parseTs, timeAgo } from "../utils/format.js";
import { getNode, listSensors, listActuators, listFaultEvents, listActuatorEvents } from "../api/client.js";

/**
 * NodeDetails - one ESP32 node. Shows only what the backend really has:
 * status / ip_address / last_seen / location / enabled from GET /nodes/{id},
 * the sensors and actuators whose node_id matches, and their recent real
 * fault / actuator events. (Firmware, MAC, Wi-Fi RSSI and uptime are not
 * reported by the backend yet, so they are intentionally not shown.)
 */
export default function NodeDetails() {
  const { nodeId } = useParams();

  const { data } = usePolling(
    async () => {
      const [node, sensors, actuators, faults, acts] = await Promise.allSettled([
        getNode(nodeId),
        listSensors(),
        listActuators(),
        listFaultEvents({ limit: 200 }),
        listActuatorEvents({ limit: 200 }),
      ]);
      const val = (r, f = []) => (r.status === "fulfilled" ? r.value : f);
      const mySensors = val(sensors).filter((s) => s.node_id === nodeId);
      const myActuators = val(actuators).filter((a) => a.node_id === nodeId);
      const sIds = new Set(mySensors.map((s) => s.sensor_id));
      const aIds = new Set(myActuators.map((a) => a.actuator_id));
      return {
        node: node.status === "fulfilled" ? node.value : null,
        notFound: node.status === "rejected" && node.reason?.status === 404,
        loadError: node.status === "rejected" ? node.reason?.message : null,
        sensors: mySensors,
        actuators: myActuators,
        faults: val(faults).filter((e) => sIds.has(e.sensor_id)).slice(0, 6),
        actuatorEvents: val(acts).filter((e) => aIds.has(e.actuator_id)).slice(0, 6),
      };
    },
    [nodeId],
    5000
  );

  if (!data) {
    return (
      <div>
        <Topbar title="ESP32 Node" />
        <p className="p-6 text-sm text-[#94A3B8]">Loading…</p>
      </div>
    );
  }
  const n = data.node;
  if (!n) {
    return (
      <div>
        <Topbar title="ESP32 Node" />
        <div className="p-6">
          <div className="card p-6 text-center text-sm text-[#94A3B8]">
            {data.notFound ? `No node with ID “${nodeId}”.` : data.loadError || "Could not load this node."}{" "}
            <Link to="/nodes" className="text-accent-cyan hover:underline">
              Back to nodes
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Topbar title={`Node · ${n.node_id}`} subtitle={n.name} />
      <div className="p-6 space-y-4 max-w-4xl">
        <div className="card p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-base font-bold text-[#F8FAFC] truncate">{n.name}</h2>
              <div className="text-[11px] text-[#94A3B8] truncate">{n.node_id}</div>
            </div>
            <StatusBadge status={n.status} className="shrink-0" />
          </div>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-3 text-xs mt-4 pt-4 border-t border-base-border">
            <Info label="IP address" value={<span className="font-mono">{n.ip_address || "—"}</span>} />
            <Info label="Last communication" value={n.last_seen ? timeAgo(n.last_seen) : "never"} />
            <Info label="Location" value={n.location} />
            <Info label="Enabled" value={n.enabled ? "Yes" : "No"} />
            <Info label="Connected sensors" value={data.sensors.length} />
            <Info label="Connected actuators" value={data.actuators.length} />
          </dl>
        </div>

        <div className="card p-4">
          <h3 className="text-sm font-semibold text-[#F8FAFC] mb-2">Connected sensors</h3>
          {data.sensors.length === 0 ? (
            <p className="text-xs text-[#94A3B8]">No sensors are assigned to this node.</p>
          ) : (
            <ul className="divide-y divide-base-border/60">
              {data.sensors.map((s) => (
                <li key={s.sensor_id}>
                  <Link to={`/sensors/${s.sensor_id}`} className="flex items-center gap-3 min-h-[52px] py-1">
                    <SensorIcon type={s.sensor_type} size={16} className="text-[#94A3B8] shrink-0" />
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-semibold text-[#F8FAFC] truncate">{s.name}</span>
                      <span className="block text-[11px] text-[#94A3B8] truncate">
                        {s.sensor_id} · trust {Math.round(s.trust_score ?? 0)}%
                      </span>
                    </span>
                    <StatusBadge status={s.status} className="shrink-0" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card p-4">
          <h3 className="text-sm font-semibold text-[#F8FAFC] mb-2">Connected actuators</h3>
          {data.actuators.length === 0 ? (
            <p className="text-xs text-[#94A3B8]">No actuators are assigned to this node.</p>
          ) : (
            <ul className="divide-y divide-base-border/60">
              {data.actuators.map((a) => (
                <li key={a.actuator_id}>
                  <Link to="/actuators" className="flex items-center gap-3 min-h-[52px] py-1">
                    <ActuatorIcon type={a.actuator_type} size={16} className="text-accent-purple shrink-0" />
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-semibold text-[#F8FAFC] truncate">{a.name}</span>
                      <span className="block text-[11px] text-[#94A3B8] truncate">{a.actuator_id}</span>
                    </span>
                    <span className="flex items-center gap-1.5 shrink-0">
                      <StatusBadge status={a.state} />
                      <StatusBadge status={a.mode} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card p-4">
          <h3 className="text-sm font-semibold text-[#F8FAFC] mb-2">Fault events</h3>
          {data.faults.length === 0 ? (
            <p className="text-xs text-[#94A3B8]">No fault events for this node’s sensors.</p>
          ) : (
            <ul className="space-y-2.5">
              {data.faults.map((e) => (
                <li key={e.id} className="text-xs">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-semibold text-[#F8FAFC]">{e.sensor_id}</span>
                    <StatusBadge status={e.previous_status} />
                    <span className="text-[#94A3B8]">→</span>
                    <StatusBadge status={e.new_status} />
                  </div>
                  <div className="text-[#94A3B8] mt-0.5">{formatDateTime(e.timestamp)}</div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card p-4">
          <h3 className="text-sm font-semibold text-[#F8FAFC] mb-2">Actuator events</h3>
          {data.actuatorEvents.length === 0 ? (
            <p className="text-xs text-[#94A3B8]">No actuator events for this node’s actuators.</p>
          ) : (
            <ul className="space-y-2.5">
              {data.actuatorEvents.map((e) => (
                <li key={e.id} className="text-xs">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-semibold text-[#F8FAFC]">{e.actuator_id}</span>
                    <StatusBadge status={e.command} />
                    <span className="text-[#94A3B8]">
                      {e.previous_state} → {e.new_state}
                    </span>
                  </div>
                  <div className="text-[#94A3B8] mt-0.5">{formatDateTime(e.timestamp)}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div className="min-w-0">
      <dt className="text-[#94A3B8]">{label}</dt>
      <dd className="text-[#F8FAFC] font-medium break-words">{value}</dd>
    </div>
  );
}
