import { useEffect, useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import Topbar from "../components/Topbar.jsx";
import { usePolling } from "../hooks/usePolling.js";
import { listSensors, listReadings, listTrustedReadings, listPredictions } from "../api/client.js";

export default function Charts() {
  const { data: sensors } = usePolling(() => listSensors(), [], 8000);
  const [sensorId, setSensorId] = useState("");

  useEffect(() => {
    if (sensors?.length && !sensorId) setSensorId(sensors[0].sensor_id);
  }, [sensors, sensorId]);

  const { data: readings } = usePolling(
    () => (sensorId ? listReadings({ sensor_id: sensorId, limit: 60 }) : Promise.resolve([])),
    [sensorId],
    5000
  );
  const { data: trusted } = usePolling(
    () => (sensorId ? listTrustedReadings({ sensor_id: sensorId, limit: 60 }) : Promise.resolve([])),
    [sensorId],
    5000
  );
  const { data: predictions } = usePolling(
    () => (sensorId ? listPredictions({ sensor_id: sensorId, limit: 60 }) : Promise.resolve([])),
    [sensorId],
    5000
  );

  const readingSeries = useMemo(() => {
    if (!readings) return [];
    return [...readings]
      .reverse()
      .map((r) => ({ time: new Date(r.timestamp).toLocaleTimeString(), raw: r.value }));
  }, [readings]);

  const trustedSeries = useMemo(() => {
    if (!trusted) return [];
    return [...trusted]
      .reverse()
      .map((t) => ({
        time: new Date(t.timestamp).toLocaleTimeString(),
        raw: t.raw_value,
        trusted: t.trusted_value,
      }));
  }, [trusted]);

  const anomalySeries = useMemo(() => {
    if (!predictions) return [];
    return [...predictions]
      .reverse()
      .map((p) => ({ time: new Date(p.timestamp).toLocaleTimeString(), score: p.anomaly_score }));
  }, [predictions]);

  return (
    <div>
      <Topbar title="Charts & Graphs" subtitle="Raw vs trusted values and anomaly scores, per sensor" />
      <div className="p-6 space-y-6">
        <select className="input max-w-xs" value={sensorId} onChange={(e) => setSensorId(e.target.value)}>
          {sensors?.map((s) => (
            <option key={s.sensor_id} value={s.sensor_id}>
              {s.sensor_id}
            </option>
          ))}
        </select>

        <div className="card p-5">
          <h2 className="font-semibold text-slate-200 mb-4">Raw Sensor Readings</h2>
          {readingSeries.length === 0 ? (
            <EmptyChart text="No readings yet for this sensor." />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={readingSeries}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1c2740" />
                <XAxis dataKey="time" stroke="#64748b" fontSize={11} />
                <YAxis stroke="#64748b" fontSize={11} />
                <Tooltip contentStyle={{ background: "#111a2e", border: "1px solid #1c2740", fontSize: 12 }} />
                <Line type="monotone" dataKey="raw" stroke="#22d3ee" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="card p-5">
          <h2 className="font-semibold text-slate-200 mb-4">Raw vs Trusted Value</h2>
          {trustedSeries.length === 0 ? (
            <EmptyChart text="No trusted values yet for this sensor." />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={trustedSeries}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1c2740" />
                <XAxis dataKey="time" stroke="#64748b" fontSize={11} />
                <YAxis stroke="#64748b" fontSize={11} />
                <Tooltip contentStyle={{ background: "#111a2e", border: "1px solid #1c2740", fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="raw" name="Raw" stroke="#ef4444" strokeWidth={1.5} dot={false} />
                <Line type="monotone" dataKey="trusted" name="Trusted" stroke="#22c55e" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="card p-5">
          <h2 className="font-semibold text-slate-200 mb-4">Anomaly Score Over Time</h2>
          {anomalySeries.length === 0 ? (
            <EmptyChart text="No predictions yet for this sensor." />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={anomalySeries}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1c2740" />
                <XAxis dataKey="time" stroke="#64748b" fontSize={11} />
                <YAxis stroke="#64748b" fontSize={11} />
                <Tooltip contentStyle={{ background: "#111a2e", border: "1px solid #1c2740", fontSize: 12 }} />
                <Line type="monotone" dataKey="score" stroke="#8b5cf6" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyChart({ text }) {
  return <div className="h-[200px] flex items-center justify-center text-sm text-slate-500">{text}</div>;
}
