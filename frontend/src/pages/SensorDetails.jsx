import { Link, useParams } from "react-router-dom";
import { Pencil, Power, PowerOff } from "lucide-react";
import { useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  Legend,
} from "recharts";
import Topbar from "../components/Topbar.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import TrustBar from "../components/TrustBar.jsx";
import TrustRing from "../components/TrustRing.jsx";
import SensorIcon from "../components/SensorIcon.jsx";
import PipelineStepper from "../components/PipelineStepper.jsx";
import FaultInjectionPanel from "../components/FaultInjectionPanel.jsx";
import { usePolling } from "../hooks/usePolling.js";
import { formatValue, formatDateTime, formatTime, timeAgo, parseTs } from "../utils/format.js";
import {
  getSensor,
  getSensorHealth,
  getLatestTrustedReading,
  getLatestPrediction,
  listTrustedReadings,
  listFaultEvents,
  enableSensor,
  disableSensor,
} from "../api/client.js";

const TOOLTIP_STYLE = {
  background: "#0b1320",
  border: "1px solid #1e293b",
  borderRadius: 8,
  fontSize: 12,
  color: "#F8FAFC",
};

/**
 * SensorDetails - phone-friendly detail view for one sensor. Everything
 * shown comes from real endpoints: /sensors/{id}, /sensor-health/{id},
 * /trusted-readings (+/latest), /predictions/{id}/latest, /fault-events.
 * Loaded lazily (recharts), see App.jsx.
 */
export default function SensorDetails() {
  const { sensorId } = useParams();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const { data, reload } = usePolling(
    async () => {
      const [sensor, health, trusted, prediction, series, events] = await Promise.allSettled([
        getSensor(sensorId),
        getSensorHealth(sensorId),
        getLatestTrustedReading(sensorId),
        getLatestPrediction(sensorId),
        listTrustedReadings({ sensor_id: sensorId, limit: 60 }),
        listFaultEvents({ sensor_id: sensorId, limit: 30 }),
      ]);
      const val = (r, fallback = null) => (r.status === "fulfilled" ? r.value : fallback);
      return {
        sensor: val(sensor),
        notFound: sensor.status === "rejected" && sensor.reason?.status === 404,
        loadError: sensor.status === "rejected" ? sensor.reason?.message : null,
        health: val(health),
        trusted: val(trusted),
        prediction: val(prediction),
        series: val(series, []),
        events: val(events, []),
      };
    },
    [sensorId],
    4000
  );

  async function toggleEnabled(sensor) {
    setBusy(true);
    setError(null);
    try {
      if (sensor.enabled) await disableSensor(sensor.sensor_id);
      else await enableSensor(sensor.sensor_id);
      await reload();
    } catch (err) {
      setError(err.detail || err.message);
    } finally {
      setBusy(false);
    }
  }

  const sensor = data?.sensor;

  if (!data) {
    return (
      <div>
        <Topbar title="Sensor Details" />
        <p className="p-6 text-sm text-[#94A3B8]">Loading…</p>
      </div>
    );
  }
  if (!sensor) {
    return (
      <div>
        <Topbar title="Sensor Details" />
        <div className="p-6">
          <div className="card p-6 text-center text-sm text-[#94A3B8]">
            {data.notFound ? `No sensor with ID “${sensorId}”.` : data.loadError || "Could not load this sensor."}{" "}
            <Link to="/sensors" className="text-accent-cyan hover:underline">
              Back to sensors
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const status = data.health?.status || sensor.status;
  const trust = data.health?.trust_score ?? sensor.trust_score;
  const unit = sensor.unit || "";
  const trusted = data.trusted;
  const isVirtual = trusted?.source === "VIRTUAL";
  const lastEvent = data.events?.length
    ? [...data.events].sort((a, b) => parseTs(b.timestamp) - parseTs(a.timestamp))[0]
    : null;

  // Oldest -> newest for the charts.
  const points = [...(data.series || [])]
    .sort((a, b) => parseTs(a.timestamp) - parseTs(b.timestamp))
    .map((r) => ({
      t: formatTime(r.timestamp),
      physical: r.raw_value,
      trusted: r.trusted_value,
      virtual: r.source === "VIRTUAL" ? r.trusted_value : null,
    }));
  const trustPoints = [...(data.events || [])]
    .sort((a, b) => parseTs(a.timestamp) - parseTs(b.timestamp))
    .map((e) => ({ t: formatTime(e.timestamp), trust: e.trust_score }));

  return (
    <div>
      <Topbar title={`Sensor · ${sensor.sensor_id}`} subtitle={sensor.name} />
      <div className="p-6 space-y-4 max-w-4xl">
        {error && (
          <div className="text-sm text-status-faulty bg-status-faulty/10 border border-status-faulty/30 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        {/* Header */}
        <div className="card p-4 flex items-center gap-3">
          <TrustRing score={trust} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <SensorIcon type={sensor.sensor_type} size={16} className="text-[#94A3B8] shrink-0" />
              <h2 className="text-base font-bold text-[#F8FAFC] truncate">{sensor.name}</h2>
            </div>
            <div className="text-[11px] text-[#94A3B8] truncate">
              {sensor.sensor_id} · {sensor.sensor_type}
            </div>
            <div className="mt-1.5 flex items-center gap-2 flex-wrap">
              <StatusBadge status={status} />
              {!sensor.enabled && <span className="text-[11px] font-semibold text-status-recovering">Disabled</span>}
            </div>
          </div>
        </div>

        {/* Physical / Virtual / Trusted */}
        <div className="card p-4">
          <div className="grid grid-cols-3 gap-2 text-center">
            <ValueCell label="Physical" value={trusted ? formatValue(trusted.raw_value) : "—"} unit={unit} />
            <ValueCell
              label="Virtual"
              value={isVirtual ? formatValue(trusted.trusted_value) : "—"}
              unit={isVirtual ? unit : ""}
              tone="amber"
            />
            <ValueCell label="Trusted" value={trusted ? formatValue(trusted.trusted_value) : "—"} unit={unit} tone="cyan" />
          </div>
          <div className="mt-3 pt-3 border-t border-base-border flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[#94A3B8]">
            <span className="flex items-center gap-1.5">
              Source: {trusted ? <StatusBadge status={trusted.source} /> : "—"}
            </span>
            <span>Updated: {trusted ? timeAgo(trusted.timestamp) : "never"}</span>
          </div>
          <div className="mt-3">
            <TrustBar score={trust} />
          </div>
          {data.health && (
            <div className="grid grid-cols-3 gap-2 mt-3 text-[11px]">
              <MiniStat label="Consecutive faults" value={data.health.consecutive_faults} />
              <MiniStat label="Consecutive healthy" value={data.health.consecutive_healthy} />
              <MiniStat
                label="Anomaly score"
                value={data.prediction ? data.prediction.anomaly_score.toFixed(3) : "—"}
              />
            </div>
          )}
        </div>

        {/* Live chart */}
        <div className="card p-4">
          <h3 className="text-sm font-semibold text-[#F8FAFC] mb-3">Physical vs Virtual vs Trusted</h3>
          {points.length < 2 ? (
            <p className="text-xs text-[#94A3B8]">Not enough readings yet to draw a chart.</p>
          ) : (
            <div className="w-full" style={{ height: 230 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={points} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                  <XAxis dataKey="t" stroke="#64748B" tick={{ fontSize: 10 }} minTickGap={32} />
                  <YAxis stroke="#64748B" tick={{ fontSize: 10 }} width={44} domain={["auto", "auto"]} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="physical" name="Physical" stroke="#94A3B8" dot={false} strokeWidth={1.5} isAnimationActive={false} />
                  <Line type="monotone" dataKey="virtual" name="Virtual" stroke="#F59E0B" dot={{ r: 2 }} strokeWidth={1.5} connectNulls={false} isAnimationActive={false} />
                  <Line type="monotone" dataKey="trusted" name="Trusted" stroke="#00d2ff" dot={false} strokeWidth={2} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Trust history: real fault_events carry trust_score per transition */}
        <div className="card p-4">
          <h3 className="text-sm font-semibold text-[#F8FAFC]">Trust history</h3>
          <p className="text-[11px] text-[#94A3B8] mb-3">Trust score at each recorded status transition.</p>
          {trustPoints.length < 2 ? (
            <p className="text-xs text-[#94A3B8]">
              {trustPoints.length === 0 ? "No transitions recorded yet." : "Only one transition recorded so far."}
            </p>
          ) : (
            <div className="w-full" style={{ height: 180 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trustPoints} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                  <XAxis dataKey="t" stroke="#64748B" tick={{ fontSize: 10 }} minTickGap={32} />
                  <YAxis stroke="#64748B" tick={{ fontSize: 10 }} width={44} domain={[0, 100]} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Line type="stepAfter" dataKey="trust" name="Trust" stroke="#22C55E" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Pipeline */}
        <div className="card p-4">
          <h3 className="text-sm font-semibold text-[#F8FAFC] mb-3">Self-healing status</h3>
          <PipelineStepper status={status} source={trusted?.source} lastEvent={lastEvent} />
        </div>

        {/* Fault history */}
        <div className="card p-4">
          <h3 className="text-sm font-semibold text-[#F8FAFC] mb-3">Fault history</h3>
          {(data.events || []).length === 0 ? (
            <p className="text-xs text-[#94A3B8]">No status transitions recorded for this sensor.</p>
          ) : (
            <ul className="space-y-2.5">
              {[...data.events]
                .sort((a, b) => parseTs(b.timestamp) - parseTs(a.timestamp))
                .slice(0, 8)
                .map((e) => (
                  <li key={e.id} className="text-xs">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <StatusBadge status={e.previous_status} />
                      <span className="text-[#94A3B8]">→</span>
                      <StatusBadge status={e.new_status} />
                    </div>
                    <div className="text-[#94A3B8] mt-1">
                      Trust {e.trust_score.toFixed(0)}% · {formatDateTime(e.timestamp)}
                    </div>
                  </li>
                ))}
            </ul>
          )}
        </div>

        {/* Information */}
        <div className="card p-4">
          <h3 className="text-sm font-semibold text-[#F8FAFC] mb-3">Information</h3>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-3 text-xs">
            <Info label="Type" value={sensor.sensor_type} />
            <Info label="Unit" value={sensor.unit} />
            <Info label="Location" value={sensor.location} />
            <Info
              label="ESP32 node"
              value={
                sensor.node_id ? (
                  <Link to={`/nodes/${sensor.node_id}`} className="text-accent-cyan hover:underline">
                    {sensor.node_id}
                  </Link>
                ) : (
                  "—"
                )
              }
            />
            <Info label="Normal range" value={`${sensor.normal_min} – ${sensor.normal_max} ${unit}`} />
            <Info label="Sampling" value={`every ${sensor.sampling_interval_seconds}s`} />
          </dl>
        </div>

        {/* Actions */}
        <div className="card p-4 space-y-3">
          <h3 className="text-sm font-semibold text-[#F8FAFC]">Actions</h3>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => toggleEnabled(sensor)}
              className="min-h-[44px] rounded-lg border border-base-border text-sm font-semibold text-[#F8FAFC] hover:bg-white/5 disabled:opacity-50 inline-flex items-center justify-center gap-2"
            >
              {sensor.enabled ? <PowerOff size={15} /> : <Power size={15} />}
              {sensor.enabled ? "Disable" : "Enable"}
            </button>
            <Link
              to={`/sensors/${sensor.sensor_id}/edit`}
              className="min-h-[44px] rounded-lg border border-base-border text-sm font-semibold text-[#F8FAFC] hover:bg-white/5 inline-flex items-center justify-center gap-2"
            >
              <Pencil size={15} /> Edit
            </Link>
          </div>
        </div>

        <FaultInjectionPanel key={sensor.sensor_id} sensors={[sensor]} hideSensorSelect onInjected={reload} />
        <p className="text-[11px] text-[#94A3B8] px-1">
          There is no “clear fault” action: an injected fault is a single bad reading, and the sensor recovers
          on its own as normal readings resume and trust is rebuilt.
        </p>
      </div>
    </div>
  );
}

function ValueCell({ label, value, unit, tone }) {
  const color = tone === "cyan" ? "text-accent-cyan" : tone === "amber" ? "text-status-recovering" : "text-[#F8FAFC]";
  return (
    <div className="min-w-0 rounded-lg bg-base-bg/50 border border-base-border py-2 px-1">
      <div className="text-[10px] uppercase tracking-wider text-[#94A3B8]">{label}</div>
      <div className={`text-lg font-bold mt-0.5 truncate ${color}`}>{value}</div>
      <div className="text-[10px] text-[#94A3B8] h-3">{unit}</div>
    </div>
  );
}

function MiniStat({ label, value }) {
  return (
    <div>
      <div className="text-[#94A3B8]">{label}</div>
      <div className="text-[#F8FAFC] font-semibold">{value}</div>
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
