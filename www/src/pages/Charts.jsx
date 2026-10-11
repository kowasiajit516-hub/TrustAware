
import { useEffect, useMemo, useState } from "react";
import createPlotlyComponent from "react-plotly.js/factory";
import Plotly from "plotly.js-gl3d-dist-min";
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
import { RefreshCw } from "lucide-react";
import Topbar from "../components/Topbar.jsx";
import { usePolling } from "../hooks/usePolling.js";
import { listSensors, listReadings, listTrustedReadings, listPredictions } from "../api/client.js";

const TIME_RANGES = [
  { value: "15m", label: "Last 15 Minutes", ms: 15 * 60 * 1000 },
  { value: "1h", label: "Last 1 Hour", ms: 60 * 60 * 1000 },
  { value: "6h", label: "Last 6 Hours", ms: 6 * 60 * 60 * 1000 },
  { value: "24h", label: "Last 24 Hours", ms: 24 * 60 * 60 * 1000 },
  { value: "custom", label: "Custom Range", ms: null },
];

// Kept small to keep the 3D scene readable and performant - a real
// engineering tradeoff, not an arbitrary limit.
const MAX_SENSORS_3D = 8;
const ANOMALY_TIME_BUCKETS = 24;

const SENSOR_COLORS = ["#38BDF8", "#A78BFA", "#F472B6", "#FB923C", "#4ADE80", "#FACC15", "#60A5FA", "#F87171"];

const DARK_SCENE_AXIS = {
  gridcolor: "#243244",
  zerolinecolor: "#243244",
  color: "#94A3B8",
  tickfont: { family: "Inter, sans-serif", size: 10 },
};

function darkLayout(extra = {}) {
  return {
    paper_bgcolor: "#111827",
    plot_bgcolor: "#111827",
    font: { family: "Inter, sans-serif", color: "#94A3B8", size: 11 },
    // Fixed margins: right side reserved for the legend (see below),
    // top reserved for Plotly's own modebar row (camera/zoom/pan/reset
    // icons) so the legend's top entries don't visually collide with it.
    margin: { l: 0, r: 170, t: 40, b: 0 },
    showlegend: true,
    legend: {
      font: { color: "#94A3B8", size: 9 },
      x: 1.02,
      xanchor: "left",
      y: 0.95,
      yanchor: "top",
      bgcolor: "rgba(17,24,39,0.7)",
      bordercolor: "#243244",
      borderwidth: 1,
      itemsizing: "constant",
      tracegroupgap: 2,
    },
    ...extra,
  };
}

const PLOT_CONFIG = { displayModeBar: true, displaylogo: false, responsive: true };
const PLOT_HEIGHT = "560px";
const Plot = createPlotlyComponent(Plotly);

export default function Charts() {
  const [viewMode, setViewMode] = useState("2D");
  const [timeRangeKey, setTimeRangeKey] = useState("1h");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [refreshTick, setRefreshTick] = useState(0);

  const { data: sensors } = usePolling(() => listSensors(), [], 8000);
  const [sensorId, setSensorId] = useState("");

  useEffect(() => {
    if (sensors?.length && !sensorId) setSensorId(sensors[0].sensor_id);
  }, [sensors, sensorId]);

  // ---------------------------------------------------------------
  // 2D mode - unchanged single-sensor charts, still fully available
  // ---------------------------------------------------------------
  const { data: readings } = usePolling(
    () => (sensorId ? listReadings({ sensor_id: sensorId, limit: 60 }) : Promise.resolve([])),
    [sensorId, refreshTick],
    5000
  );
  const { data: trusted } = usePolling(
    () => (sensorId ? listTrustedReadings({ sensor_id: sensorId, limit: 60 }) : Promise.resolve([])),
    [sensorId, refreshTick],
    5000
  );
  const { data: predictions } = usePolling(
    () => (sensorId ? listPredictions({ sensor_id: sensorId, limit: 60 }) : Promise.resolve([])),
    [sensorId, refreshTick],
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

  // ---------------------------------------------------------------
  // 3D mode - real data across ALL sensors (not just the selected one),
  // since the 3D axes are Time x Sensor x Value/Score.
  // ---------------------------------------------------------------
  const sensorIds3D = useMemo(
    () => (sensors || []).slice(0, MAX_SENSORS_3D).map((s) => s.sensor_id),
    [sensors]
  );

  const windowMs = useMemo(() => {
    if (timeRangeKey === "custom") return null; // custom uses absolute bounds, not a rolling window
    const range = TIME_RANGES.find((t) => t.value === timeRangeKey);
    return range?.ms || 60 * 60 * 1000;
  }, [timeRangeKey]);

  const { data: all3D, loading: loading3D } = usePolling(
    async () => {
      if (viewMode !== "3D" || sensorIds3D.length === 0) return null;
      return Promise.all(
        sensorIds3D.map(async (id) => {
          const [r, t, p] = await Promise.all([
            listReadings({ sensor_id: id, limit: 300 }).catch(() => []),
            listTrustedReadings({ sensor_id: id, limit: 300 }).catch(() => []),
            listPredictions({ sensor_id: id, limit: 300 }).catch(() => []),
          ]);
          return { sensor_id: id, readings: r || [], trusted: t || [], predictions: p || [] };
        })
      );
    },
    [viewMode, sensorIds3D.join(","), refreshTick],
    2000
  );

  // Anchor the rolling time window to the MOST RECENT actual data
  // point across everything just fetched, not the browser's wall
  // clock. This makes "Last 24 Hours" mean "the 24 hours ending at
  // the latest real reading", which is immune to any clock skew
  // between this browser and wherever the backend/database runs -
  // a real bug that showed up as 2D (unfiltered, just "most recent N")
  // working fine while 3D's absolute-time filtering came up empty.
  const rangeBounds = useMemo(() => {
    if (timeRangeKey === "custom" && customFrom && customTo) {
      return { from: new Date(customFrom).getTime(), to: new Date(customTo).getTime() };
    }
    if (!all3D) return { from: 0, to: Date.now() };

    let latest = 0;
    all3D.forEach((s) => {
      [...s.readings, ...s.trusted, ...s.predictions].forEach((row) => {
        const t = new Date(row.timestamp).getTime();
        if (t > latest) latest = t;
      });
    });
    const to = latest || Date.now();
    return { from: to - (windowMs || 60 * 60 * 1000), to };
  }, [all3D, timeRangeKey, customFrom, customTo, windowMs]);

  function inRange(ts) {
    const t = new Date(ts).getTime();
    return t >= rangeBounds.from && t <= rangeBounds.to;
  }
  const byTime = (a, b) => new Date(a.timestamp) - new Date(b.timestamp);

  const raw3DTraces = useMemo(() => {
    if (!all3D) return [];
    return all3D.map((s, idx) => {
      const pts = s.readings.filter((r) => inRange(r.timestamp)).sort(byTime);
      const color = SENSOR_COLORS[idx % SENSOR_COLORS.length];
      return {
        type: "scatter3d",
        mode: "lines+markers",
        name: s.sensor_id,
        x: pts.map((r) => r.timestamp),
        y: pts.map(() => idx),
        z: pts.map((r) => r.value),
        marker: { size: 2.5, color },
        line: { color, width: 3 },
        hovertemplate: `<b>${s.sensor_id}</b><br>Time: %{x}<br>Raw Value: %{z:.2f}<extra></extra>`,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all3D, rangeBounds.from, rangeBounds.to]);

  const rawVsTrusted3DTraces = useMemo(() => {
    if (!all3D) return [];
    const traces = [];
    all3D.forEach((s, idx) => {
      const pts = s.trusted.filter((t) => inRange(t.timestamp)).sort(byTime);
      if (pts.length === 0) return;
      traces.push({
        type: "scatter3d",
        mode: "lines",
        name: `${s.sensor_id} · Raw`,
        x: pts.map((t) => t.timestamp),
        y: pts.map(() => idx),
        z: pts.map((t) => t.raw_value),
        customdata: pts.map((t) => t.source),
        line: { color: "#EF4444", width: 3 },
        hovertemplate:
          `<b>${s.sensor_id}</b><br>Time: %{x}<br>Raw Value: %{z:.2f}<br>Source: %{customdata}<extra></extra>`,
      });
      traces.push({
        type: "scatter3d",
        mode: "lines",
        name: `${s.sensor_id} · Trusted`,
        x: pts.map((t) => t.timestamp),
        y: pts.map(() => idx),
        z: pts.map((t) => t.trusted_value),
        customdata: pts.map((t) => t.source),
        line: { color: "#22C55E", width: 4 },
        hovertemplate:
          `<b>${s.sensor_id}</b><br>Time: %{x}<br>Trusted Value: %{z:.2f}<br>Source: %{customdata}<extra></extra>`,
      });
    });
    return traces;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all3D, rangeBounds.from, rangeBounds.to]);

  // Real surface: bucket each sensor's predictions into fixed time
  // buckets across the selected window and average the anomaly_score
  // per (sensor, bucket) cell - a genuine grid built from real data,
  // not a decorative mesh.
  const anomalySurface = useMemo(() => {
    if (!all3D) return null;
    const bucketMs = (rangeBounds.to - rangeBounds.from) / ANOMALY_TIME_BUCKETS;
    const z = all3D.map((s) => {
      const buckets = Array.from({ length: ANOMALY_TIME_BUCKETS }, () => []);
      s.predictions
        .filter((p) => inRange(p.timestamp))
        .forEach((p) => {
          const idx = Math.min(
            ANOMALY_TIME_BUCKETS - 1,
            Math.max(0, Math.floor((new Date(p.timestamp).getTime() - rangeBounds.from) / bucketMs))
          );
          buckets[idx].push(p.anomaly_score);
        });
      return buckets.map((b) => (b.length ? b.reduce((a, v) => a + v, 0) / b.length : null));
    });
    const flat = z.flat().filter((v) => v !== null);
    if (flat.length === 0) return null;
    return {
      z,
      x: Array.from({ length: ANOMALY_TIME_BUCKETS }, (_, i) =>
        new Date(rangeBounds.from + i * bucketMs).toLocaleTimeString()
      ),
      y: all3D.map((s) => s.sensor_id),
      current: flat[flat.length - 1],
      max: Math.max(...flat),
      min: Math.min(...flat),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all3D, rangeBounds.from, rangeBounds.to]);

  return (
    <div>
      <Topbar title="Charts & Graphs" subtitle="Raw vs trusted values and anomaly scores, per sensor" />
      <div className="p-6 space-y-6">
        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3">
          {viewMode === "2D" && (
            <select className="input max-w-xs" value={sensorId} onChange={(e) => setSensorId(e.target.value)}>
              {sensors?.map((s) => (
                <option key={s.sensor_id} value={s.sensor_id}>
                  {s.sensor_id}
                </option>
              ))}
            </select>
          )}

          {viewMode === "3D" && (
            <>
              <select
                className="input max-w-[180px]"
                value={timeRangeKey}
                onChange={(e) => setTimeRangeKey(e.target.value)}
              >
                {TIME_RANGES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
              {timeRangeKey === "custom" && (
                <>
                  <input
                    type="datetime-local"
                    className="input max-w-[190px]"
                    value={customFrom}
                    onChange={(e) => setCustomFrom(e.target.value)}
                  />
                  <input
                    type="datetime-local"
                    className="input max-w-[190px]"
                    value={customTo}
                    onChange={(e) => setCustomTo(e.target.value)}
                  />
                </>
              )}
            </>
          )}

          <div className="inline-flex rounded-md border border-base-border overflow-hidden">
            <button
              onClick={() => setViewMode("2D")}
              className={`px-3 py-1.5 text-xs font-semibold ${
                viewMode === "2D" ? "bg-accent-cyan/20 text-accent-cyan" : "text-[#94A3B8] hover:text-[#F8FAFC]"
              }`}
            >
              2D
            </button>
            <button
              onClick={() => setViewMode("3D")}
              className={`px-3 py-1.5 text-xs font-semibold border-l border-base-border ${
                viewMode === "3D" ? "bg-accent-cyan/20 text-accent-cyan" : "text-[#94A3B8] hover:text-[#F8FAFC]"
              }`}
            >
              3D
            </button>
          </div>

          <button
            onClick={() => setRefreshTick((t) => t + 1)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-base-border text-xs font-semibold text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-base-hover"
          >
            <RefreshCw size={13} /> Refresh
          </button>

          {viewMode === "3D" && (
            <span className="text-[11px] text-[#94A3B8]">
              Rotate: drag · Zoom: scroll · Pan: right-click drag · Reset: modebar
            </span>
          )}
        </div>

        {viewMode === "2D" ? (
          <>
            <div className="card p-5">
              <h2 className="font-semibold text-[#F8FAFC] mb-4">Raw Sensor Readings</h2>
              {readingSeries.length === 0 ? (
                <EmptyChart text="No readings yet for this sensor." />
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={readingSeries}>
                    <CartesianGrid stroke="#1B2536" />
                    <XAxis dataKey="time" stroke="#94A3B8" fontSize={11} tick={{ fontFamily: "Inter, sans-serif" }} />
                    <YAxis stroke="#94A3B8" fontSize={11} tick={{ fontFamily: "Inter, sans-serif" }} />
                    <Tooltip contentStyle={{ background: "#111827", border: "1px solid #243244", color: "#F8FAFC", fontSize: 12, fontFamily: "Inter, sans-serif" }} />
                    <Line type="monotone" dataKey="raw" stroke="#38BDF8" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="card p-5">
              <h2 className="font-semibold text-[#F8FAFC] mb-4">Raw vs Trusted Value</h2>
              {trustedSeries.length === 0 ? (
                <EmptyChart text="No trusted values yet for this sensor." />
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={trustedSeries}>
                    <CartesianGrid stroke="#1B2536" />
                    <XAxis dataKey="time" stroke="#94A3B8" fontSize={11} tick={{ fontFamily: "Inter, sans-serif" }} />
                    <YAxis stroke="#94A3B8" fontSize={11} tick={{ fontFamily: "Inter, sans-serif" }} />
                    <Tooltip contentStyle={{ background: "#111827", border: "1px solid #243244", color: "#F8FAFC", fontSize: 12, fontFamily: "Inter, sans-serif" }} />
                    <Legend wrapperStyle={{ fontSize: 11, fontFamily: "Inter, sans-serif", color: "#94A3B8" }} />
                    <Line type="monotone" dataKey="raw" name="Raw" stroke="#EF4444" strokeWidth={1.5} dot={false} />
                    <Line type="monotone" dataKey="trusted" name="Trusted" stroke="#22C55E" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="card p-5">
              <h2 className="font-semibold text-[#F8FAFC] mb-4">Anomaly Score Over Time</h2>
              {anomalySeries.length === 0 ? (
                <EmptyChart text="No predictions yet for this sensor." />
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={anomalySeries}>
                    <CartesianGrid stroke="#1B2536" />
                    <XAxis dataKey="time" stroke="#94A3B8" fontSize={11} tick={{ fontFamily: "Inter, sans-serif" }} />
                    <YAxis stroke="#94A3B8" fontSize={11} tick={{ fontFamily: "Inter, sans-serif" }} />
                    <Tooltip contentStyle={{ background: "#111827", border: "1px solid #243244", color: "#F8FAFC", fontSize: 12, fontFamily: "Inter, sans-serif" }} />
                    <Line type="monotone" dataKey="score" stroke="#F59E0B" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="card p-5">
              <h2 className="font-semibold text-[#F8FAFC] mb-1">Raw Sensor Readings (3D)</h2>
              <p className="text-[11px] text-[#94A3B8] mb-4">3D visualization of raw sensor values over time</p>
              {!all3D ? (
                <EmptyChart text={loading3D ? "Loading…" : "No sensors available."} />
              ) : raw3DTraces.every((t) => t.x.length === 0) ? (
                <EmptyChart text="No readings in this time range." />
              ) : (
                <Plot
                  data={raw3DTraces}
                  layout={darkLayout({
                    scene: {
                      xaxis: { title: "Time", ...DARK_SCENE_AXIS },
                      yaxis: {
                        title: "Sensor",
                        tickvals: all3D.map((_, i) => i),
                        ticktext: all3D.map((s) => s.sensor_id),
                        ...DARK_SCENE_AXIS,
                      },
                      zaxis: { title: "Value", ...DARK_SCENE_AXIS },
                      camera: { eye: { x: 1.6, y: -1.6, z: 0.9 } },
                    },
                  })}
                  config={PLOT_CONFIG}
                  style={{ width: "100%", height: PLOT_HEIGHT }}
                  useResizeHandler
                />
              )}
            </div>

            <div className="card p-5">
              <div className="flex items-center justify-between mb-1">
                <h2 className="font-semibold text-[#F8FAFC]">Raw vs Trusted Value (3D)</h2>
                <div className="flex items-center gap-3 text-[11px]">
                  <span className="flex items-center gap-1 text-[#94A3B8]">
                    <span className="w-2 h-2 rounded-full bg-status-faulty" /> Raw Value
                  </span>
                  <span className="flex items-center gap-1 text-[#94A3B8]">
                    <span className="w-2 h-2 rounded-full bg-status-healthy" /> Trusted Value
                  </span>
                </div>
              </div>
              <p className="text-[11px] text-[#94A3B8] mb-4">3D comparison of raw and trusted values over time</p>
              {!all3D ? (
                <EmptyChart text={loading3D ? "Loading…" : "No sensors available."} />
              ) : rawVsTrusted3DTraces.length === 0 ? (
                <EmptyChart text="No trusted readings in this time range." />
              ) : (
                <Plot
                  data={rawVsTrusted3DTraces}
                  layout={darkLayout({
                    scene: {
                      xaxis: { title: "Time", ...DARK_SCENE_AXIS },
                      yaxis: {
                        title: "Sensor",
                        tickvals: all3D.map((_, i) => i),
                        ticktext: all3D.map((s) => s.sensor_id),
                        ...DARK_SCENE_AXIS,
                      },
                      zaxis: { title: "Value", ...DARK_SCENE_AXIS },
                      camera: { eye: { x: 1.6, y: -1.6, z: 0.9 } },
                    },
                  })}
                  config={PLOT_CONFIG}
                  style={{ width: "100%", height: PLOT_HEIGHT }}
                  useResizeHandler
                />
              )}
            </div>

            <div className="card p-5">
              <div className="flex items-center justify-between mb-1">
                <h2 className="font-semibold text-[#F8FAFC]">Anomaly Score Over Time (3D)</h2>
                {anomalySurface && (
                  <div className="flex items-center gap-4 text-[11px]">
                    <StatChip label="Current" value={anomalySurface.current} />
                    <StatChip label="Max" value={anomalySurface.max} />
                    <StatChip label="Min" value={anomalySurface.min} />
                  </div>
                )}
              </div>
              <p className="text-[11px] text-[#94A3B8] mb-4">3D visualization of anomaly scores across sensors and time</p>
              {!all3D ? (
                <EmptyChart text={loading3D ? "Loading…" : "No sensors available."} />
              ) : !anomalySurface ? (
                <EmptyChart text="No predictions in this time range." />
              ) : (
                <Plot
                  data={[
                    {
                      type: "surface",
                      x: anomalySurface.x,
                      y: anomalySurface.y,
                      z: anomalySurface.z,
                      colorscale: [
                        [0, "#3B82F6"],
                        [0.2, "#22D3EE"],
                        [0.4, "#22C55E"],
                        [0.6, "#FACC15"],
                        [0.8, "#FB923C"],
                        [1, "#EF4444"],
                      ],
                      colorbar: { title: "Anomaly Score", titlefont: { color: "#94A3B8" }, tickfont: { color: "#94A3B8" } },
                      hovertemplate: "Sensor: %{y}<br>Time: %{x}<br>Anomaly Score: %{z:.4f}<extra></extra>",
                    },
                  ]}
                  layout={darkLayout({
                    scene: {
                      xaxis: { title: "Time", ...DARK_SCENE_AXIS },
                      yaxis: { title: "Sensor", ...DARK_SCENE_AXIS },
                      zaxis: { title: "Anomaly Score", ...DARK_SCENE_AXIS },
                      camera: { eye: { x: 1.6, y: -1.6, z: 0.9 } },
                    },
                  })}
                  config={PLOT_CONFIG}
                  style={{ width: "100%", height: PLOT_HEIGHT }}
                  useResizeHandler
                />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function StatChip({ label, value }) {
  return (
    <span className="text-[#94A3B8]">
      {label}: <span className="text-[#F8FAFC] font-semibold">{value?.toFixed(4) ?? "—"}</span>
    </span>
  );
}

function EmptyChart({ text }) {
  return <div className="h-[200px] flex items-center justify-center text-sm text-[#94A3B8]">{text}</div>;
}
