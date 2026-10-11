import { useMemo, useRef, useState } from 'react';
import Plotly from 'plotly.js-gl3d-dist-min';
import createPlotlyComponent from 'react-plotly.js/factory';
import { buildSurface, surfaceToCsv, sensorType, sensorName, sensorUnit } from './surfaceData';
import './surface3d.css';

const Plot = createPlotlyComponent(Plotly);

const DEFAULT_CAMERA = { eye: { x: 1.7, y: -1.7, z: 0.95 }, center: { x: 0, y: 0, z: -0.1 } };
const COLORSCALE = [
  [0, '#0a1cff'], [0.18, '#1f7bff'], [0.36, '#00e5ff'],
  [0.52, '#00e676'], [0.68, '#f5f500'], [0.84, '#ff9100'], [1, '#ff1a1a'],
];
const RANGES = [
  { label: 'Last 1 Hour', ms: 3600e3 },
  { label: 'Last 6 Hours', ms: 6 * 3600e3 },
  { label: 'Last 24 Hours', ms: 24 * 3600e3 },
  { label: 'Last 7 Days', ms: 7 * 24 * 3600e3 },
  { label: 'All data', ms: 0 },
];
const GRID = 'rgba(34,211,238,0.28)';
const TXT = '#9fdcff';

const fmtTime = (ms, withSec) =>
  new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', ...(withSec ? { second: '2-digit' } : {}) });

/**
 * Props (all REAL data from your existing API — nothing is generated here):
 *  sensors  : array of sensor docs   (needs a type + name/id)
 *  readings : array of reading docs  (sensor_id, timestamp, raw_value, trusted_value)
 *  loading, error, onRefresh : optional
 */
export default function Surface3D({ sensors = [], readings = [], loading = false, error = null, onRefresh }) {
  const gdRef = useRef(null);
  const types = useMemo(() => [...new Set(sensors.map(sensorType))], [sensors]);
  const [type, setType] = useState('');
  const [range, setRange] = useState(RANGES[2].ms);
  const [mode, setMode] = useState('trusted');
  const [drag, setDrag] = useState('orbit');

  const activeType = type || types.find((t) => sensors.filter((s) => sensorType(s) === t).length >= 2) || types[0] || '';
  const typed = useMemo(() => sensors.filter((s) => sensorType(s) === activeType), [sensors, activeType]);
  const surface = useMemo(() => buildSurface({ readings, sensors: typed, mode, rangeMs: range }), [readings, typed, mode, range]);

  const unit = typed.map(sensorUnit).find(Boolean) || '';
  const label = activeType ? activeType.charAt(0).toUpperCase() + activeType.slice(1) : 'Value';
  const zTitle = unit ? `${label} (${unit})` : label;

  const fig = useMemo(() => {
    if (!surface.ok) return null;
    const { z, times, sensors: cols, stats } = surface;
    const pad = stats.max === stats.min ? 1 : (stats.max - stats.min) * 0.08;
    const cmin = stats.max === stats.min ? stats.min - 1 : stats.min;
    const cmax = stats.max === stats.min ? stats.max + 1 : stats.max;
    const spanMs = times[times.length - 1] - times[0];
    const unitMs = spanMs < 120e3 ? 1e3 : spanMs < 2 * 3600e3 ? 60e3 : 3600e3;
    const timeLabel = unitMs === 1e3 ? 'Time (Seconds)' : unitMs === 60e3 ? 'Time (Minutes)' : 'Time (Hours)';
    const y = times.map((t) => (t - times[0]) / unitMs);
    const withSec = times[times.length - 1] - times[0] < 30 * 60e3;
    const text = z.map((row, i) => row.map((_, j) => `Sensor: ${sensorName(cols[j])}<br>Time: ${fmtTime(times[i], withSec)}`));
    const step = y.length > 1 ? y[1] - y[0] : 1;

    const axis = ({ title, ...extra }) => ({
      color: TXT, gridcolor: GRID, zerolinecolor: GRID, linecolor: GRID,
      showbackground: true, backgroundcolor: 'rgba(6,24,52,0.55)',
      tickfont: { color: TXT, size: 10 },
      title: { text: title, font: { color: '#d6f4ff', size: 13 } },
      ...extra,
    });

    return {
      data: [{
        type: 'surface', x: cols.map((_, i) => i), y, z, text,
        colorscale: COLORSCALE, cmin, cmax, opacity: 0.97,
        hovertemplate: `%{text}<br>${label}: %{z:.2f}${unit ? ' ' + unit : ''}<extra></extra>`,
        contours: {
          x: { show: true, start: 0, end: cols.length - 1, size: 1, color: 'rgba(255,255,255,0.35)', width: 1 },
          y: { show: true, start: y[0], end: y[y.length - 1], size: step || 1, color: 'rgba(255,255,255,0.35)', width: 1 },
          z: { show: false },
        },
        lighting: { ambient: 0.72, diffuse: 0.85, specular: 0.35, roughness: 0.55, fresnel: 0.2 },
        colorbar: {
          title: { text: zTitle, side: 'top', font: { color: '#d6f4ff', size: 12 } }, thickness: 14, len: 0.8, x: 0.98,
          tickfont: { color: TXT, size: 11 },
          outlinecolor: GRID, bgcolor: 'rgba(0,0,0,0)',
        },
        hoverlabel: { bgcolor: '#06182f', bordercolor: '#22d3ee', font: { color: '#e6f7ff', size: 12 } },
      }],
      layout: {
        autosize: true, paper_bgcolor: 'rgba(0,0,0,0)', margin: { l: 0, r: 0, t: 0, b: 0 },
        font: { color: TXT },
        scene: {
          bgcolor: 'rgba(0,0,0,0)', dragmode: drag, camera: DEFAULT_CAMERA,
          aspectmode: 'manual', aspectratio: { x: 1.5, y: 1.5, z: 0.7 },
          xaxis: axis({ title: 'Sensor', tickvals: cols.map((_, i) => i), ticktext: cols.map(sensorName) }),
          yaxis: axis({ title: timeLabel }),
          zaxis: axis({ title: zTitle, range: [cmin >= 0 ? 0 : cmin - pad, cmax + pad] }),
        },
      },
    };
  }, [surface, label, unit, zTitle, drag]);

  const setDragMode = (m) => {
    setDrag(m);
    if (gdRef.current) Plotly.relayout(gdRef.current, { 'scene.dragmode': m });
  };
  const resetView = () => {
    setDrag('orbit');
    if (gdRef.current) Plotly.relayout(gdRef.current, { 'scene.camera': DEFAULT_CAMERA, 'scene.dragmode': 'orbit' });
  };
  const snapshot = () => gdRef.current && Plotly.downloadImage(gdRef.current, { format: 'png', filename: `surface_${activeType}`, width: 1600, height: 900 });
  const exportCsv = () => {
    if (!surface.ok) return;
    const url = URL.createObjectURL(new Blob([surfaceToCsv(surface)], { type: 'text/csv' }));
    Object.assign(document.createElement('a'), { href: url, download: `surface_${activeType}.csv` }).click();
    URL.revokeObjectURL(url);
  };

  const f = (v) => (v === undefined || v === null ? '—' : `${v.toFixed(1)}${unit ? ' ' + unit : ''}`);
  const st = surface.ok ? surface.stats : {};

  return (
    <div className="s3d">
      <div className="s3d-controls">
        <label>Sensor type
          <select value={activeType} onChange={(e) => setType(e.target.value)}>
            {types.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label>Time range
          <select value={range} onChange={(e) => setRange(Number(e.target.value))}>
            {RANGES.map((r) => <option key={r.label} value={r.ms}>{r.label}</option>)}
          </select>
        </label>
        <label>Values
          <select value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="trusted">Trusted</option>
            <option value="raw">Raw</option>
          </select>
        </label>
        <button className="s3d-primary" onClick={onRefresh} disabled={!onRefresh}>Refresh</button>
        <button onClick={resetView}>Reset view</button>
        <button onClick={exportCsv} disabled={!surface.ok}>Export CSV</button>
      </div>

      <section className="s3d-panel">
        <header>
          <div>
            <h3>Sensor data – 3D surface graph</h3>
            <p>{label} variations across sensors over time · {mode} values</p>
          </div>
          <div className="s3d-tools" role="toolbar" aria-label="3D chart tools">
            <button title="Save image" onClick={snapshot} disabled={!surface.ok}>📷</button>
            <button title="Zoom" className={drag === 'zoom' ? 'on' : ''} onClick={() => setDragMode('zoom')} disabled={!surface.ok}>🔍</button>
            <button title="Pan" className={drag === 'pan' ? 'on' : ''} onClick={() => setDragMode('pan')} disabled={!surface.ok}>✥</button>
            <button title="Rotate" className={drag === 'orbit' ? 'on' : ''} onClick={() => setDragMode('orbit')} disabled={!surface.ok}>⟳</button>
            <button title="Reset view" onClick={resetView} disabled={!surface.ok}>⌂</button>
          </div>
        </header>

        <div className="s3d-stage">
          {error ? (
            <div className="s3d-empty"><strong>Could not load sensor data</strong><span>{String(error.message || error)}</span></div>
          ) : loading && !surface.ok ? (
            <div className="s3d-empty"><strong>Loading sensor data…</strong></div>
          ) : !surface.ok ? (
            <div className="s3d-empty">
              <strong>Insufficient Sensor Data</strong>
              <span>{surface.reason} A 3D surface needs at least 2 sensors of the same type with readings over 2 or more time points.</span>
            </div>
          ) : (
            <Plot
              data={fig.data} layout={fig.layout}
              config={{ displayModeBar: false, responsive: true, displaylogo: false }}
              useResizeHandler style={{ width: '100%', height: '100%' }}
              onInitialized={(_, gd) => { gdRef.current = gd; }}
              onUpdate={(_, gd) => { gdRef.current = gd; }}
            />
          )}
        </div>
      </section>

      <div className="s3d-stats">
        <div className="s3d-stat cur"><span>Current</span><b>{f(st.current)}</b></div>
        <div className="s3d-stat max"><span>Maximum</span><b>{f(st.max)}</b></div>
        <div className="s3d-stat min"><span>Minimum</span><b>{f(st.min)}</b></div>
        <div className="s3d-stat avg"><span>Average</span><b>{f(st.avg)}</b></div>
      </div>
    </div>
  );
}
