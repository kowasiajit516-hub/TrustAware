import { useEffect, useState } from "react";
import Topbar from "../components/Topbar.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import TrustBar from "../components/TrustBar.jsx";
import PipelineStepper from "../components/PipelineStepper.jsx";
import FaultInjectionPanel from "../components/FaultInjectionPanel.jsx";
import { usePolling } from "../hooks/usePolling.js";
import { formatValue, timeAgo } from "../utils/format.js";
import { listSensors, getSensorHealth, getLatestTrustedReading, getLatestFaultEvent } from "../api/client.js";

/**
 * FaultInjection - dedicated demo page for the self-healing loop.
 * Reuses the existing FaultInjectionPanel (real POST /fault-injection/{id},
 * which submits through the real ingestion pipeline) and shows the selected
 * sensor's LIVE state beside it, refreshed every 2s, so you can watch the
 * value / trust / status react after each injection.
 */
export default function FaultInjection() {
  const { data: sensors } = usePolling(() => listSensors(), [], 6000);
  const [selected, setSelected] = useState("");

  useEffect(() => {
    if (!selected && sensors && sensors.length) setSelected(sensors[0].sensor_id);
  }, [sensors, selected]);

  const sensor = sensors?.find((s) => s.sensor_id === selected) || null;

  const { data: live, reload } = usePolling(
    async () => {
      if (!selected) return null;
      const [health, trusted, event] = await Promise.allSettled([
        getSensorHealth(selected),
        getLatestTrustedReading(selected),
        getLatestFaultEvent(selected),
      ]);
      const val = (r) => (r.status === "fulfilled" ? r.value : null);
      return { health: val(health), trusted: val(trusted), event: val(event) };
    },
    [selected],
    2000
  );

  const status = live?.health?.status || sensor?.status;
  const trust = live?.health?.trust_score ?? sensor?.trust_score;
  const unit = sensor?.unit || "";

  return (
    <div>
      <Topbar title="Fault Injection" subtitle="Inject a fault and watch AI detection, trust and virtual sensing react" />
      <div className="p-6 space-y-4 max-w-3xl">
        {!sensors ? (
          <p className="text-sm text-[#94A3B8]">Loading…</p>
        ) : sensors.length === 0 ? (
          <div className="card p-6 text-center text-sm text-[#94A3B8]">Add a sensor first to inject faults.</div>
        ) : (
          <>
            <label className="block">
              <span className="block text-xs font-medium text-[#94A3B8] mb-1">Sensor</span>
              <select className="input" value={selected} onChange={(e) => setSelected(e.target.value)}>
                {sensors.map((s) => (
                  <option key={s.sensor_id} value={s.sensor_id}>
                    {s.sensor_id} — {s.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="card p-4">
              <div className="flex items-center justify-between gap-2 mb-3">
                <h3 className="text-sm font-semibold text-[#F8FAFC]">Live state</h3>
                {status && <StatusBadge status={status} />}
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <Cell label="Physical" value={live?.trusted ? formatValue(live.trusted.raw_value) : "—"} unit={unit} />
                <Cell label="Trusted" value={live?.trusted ? formatValue(live.trusted.trusted_value) : "—"} unit={unit} accent />
                <Cell label="Source" value={live?.trusted ? live.trusted.source : "—"} />
              </div>
              <div className="mt-3">{trust !== undefined && <TrustBar score={trust} />}</div>
              <p className="text-[11px] text-[#94A3B8] mt-2">
                Last reading: {live?.trusted ? timeAgo(live.trusted.timestamp) : "none yet"} · refreshes every 2 s
              </p>
            </div>

            <FaultInjectionPanel key={selected} sensors={sensor ? [sensor] : []} hideSensorSelect onInjected={reload} />

            <div className="card p-4">
              <h3 className="text-sm font-semibold text-[#F8FAFC] mb-3">Self-healing loop</h3>
              <PipelineStepper status={status} source={live?.trusted?.source} lastEvent={live?.event} />
            </div>

            <p className="text-[11px] text-[#94A3B8] px-1">
              There is no “clear fault” action: an injection is one bad reading. The sensor recovers by itself as
              normal readings resume and trust is rebuilt. “Missing” submits no reading, so it will not change
              status until a new reading arrives.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function Cell({ label, value, unit, accent }) {
  return (
    <div className="min-w-0 rounded-lg bg-base-bg/50 border border-base-border py-2 px-1">
      <div className="text-[10px] uppercase tracking-wider text-[#94A3B8]">{label}</div>
      <div className={`text-lg font-bold mt-0.5 truncate ${accent ? "text-accent-cyan" : "text-[#F8FAFC]"}`}>{value}</div>
      <div className="text-[10px] text-[#94A3B8] h-3">{unit}</div>
    </div>
  );
}
