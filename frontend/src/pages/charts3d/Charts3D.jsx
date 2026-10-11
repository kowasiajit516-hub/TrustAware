import { useEffect, useMemo, useRef, useState } from 'react';
import Plotly from 'plotly.js-gl3d-dist-min';
import createPlotlyComponent from 'react-plotly.js/factory';
import { buildSurfaces, surfacesToCsv, sensorType, sensorName, sensorUnit } from './surfaceData';
import Chart2D from './Chart2D';
import SensorPicker, { sensorKey } from './SensorPicker';
import { MAIN, ANOM, RAW_RED, TRUST_BLUE, GRID, TXT } from './theme';
import './surface3d.css';

const Plot = createPlotlyComponent(Plotly);

const CAMERA = { eye: { x: 1.7, y: -1.7, z: 0.95 }, center: { x: 0, y: 0, z: -0.1 } };
const RANGES = [
  { label: 'Last 1 Hour', ms: 3600e3 }, { label: 'Last 6 Hours', ms: 6 * 3600e3 },
  { label: 'Last 24 Hours', ms: 24 * 3600e3 }, { label: 'Last 7 Days', ms: 7 * 24 * 3600e3 },
  { label: 'All data', ms: 0 },
];
const fmtTime = (ms, sec) =>
  new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', ...(sec ? { second: '2-digit' } : {}) });
const scaleRange = (min, max) => (max === min ? [min - 1, max + 1] : [min, max]);

function makeFig(kind, s, unit, label, drag) {
  const { zs, times, sensors: cols, stats } = s;
  const spanMs = times[times.length - 1] - times[0];
  const unitMs = spanMs < 120e3 ? 1e3 : spanMs < 2 * 3600e3 ? 60e3 : 3600e3;
  const timeLabel = unitMs === 1e3 ? 'Time (Seconds)' : unitMs === 60e3 ? 'Time (Minutes)' : 'Time (Hours)';
  const y = times.map((t) => (t - times[0]) / unitMs);
  const xs = cols.map((_, i) => i);
  const step = y.length > 1 ? y[1] - y[0] : 1;
  const withSec = spanMs < 30 * 60e3;
  const names = cols.map(sensorName);
  // hover text is precomputed per cell (Plotly's surface hovertemplate can't read %{text})
  const mkText = (z, name, dec) => z.map((row, r) => row.map((v, c) =>
    `Sensor: ${names[c]}<br>Time: ${fmtTime(times[r], withSec)}<br>${name}: ${v.toFixed(dec)}${name === 'Anomaly score' ? '' : unit ? ' ' + unit : ''}`));
  const zTitle = kind === 'anomaly' ? 'Anomaly Score' : unit ? `${label} (${unit})` : label;

  const contours = (c) => ({
    x: { show: true, start: 0, end: cols.length - 1, size: 1, color: c, width: 1 },
    y: { show: true, start: y[0], end: y[y.length - 1], size: step || 1, color: c, width: 1 },
    z: { show: false },
  });
  const common = {
    type: 'surface', x: xs, y, hoverinfo: 'text',
    lighting: { ambient: 0.72, diffuse: 0.85, specular: 0.35, roughness: 0.55, fresnel: 0.2 },
    hoverlabel: { bgcolor: '#06182f', bordercolor: '#22d3ee', font: { color: '#e6f7ff', size: 12 } },
  };
  const bar = { title: { text: kind === 'anomaly' ? 'Score' : zTitle, side: 'top', font: { color: '#d6f4ff', size: 11 } },
    thickness: 12, len: 0.75, x: 1.0, tickfont: { color: TXT, size: 10 }, outlinecolor: GRID, bgcolor: 'rgba(0,0,0,0)' };

  let data, zmin, zmax;
  if (kind === 'compare') {
    zmin = Math.min(stats.raw.min, stats.trusted.min);
    zmax = Math.max(stats.raw.max, stats.trusted.max);
    const [lo, hi] = scaleRange(zmin, zmax);
    data = [
      { ...common, z: zs.raw, colorscale: RAW_RED, cmin: lo, cmax: hi, showscale: false, opacity: 0.92,
        contours: contours('rgba(255,190,190,0.35)'), text: mkText(zs.raw, 'Raw', 2) },
      { ...common, z: zs.trusted, colorscale: TRUST_BLUE, cmin: lo, cmax: hi, showscale: false, opacity: 0.92,
        contours: contours('rgba(170,220,255,0.35)'), text: mkText(zs.trusted, 'Trusted', 2) },
    ];
  } else if (kind === 'anomaly') {
    zmin = 0; zmax = Math.max(1, stats.anomaly.max);
    data = [{ ...common, z: zs.anomaly, colorscale: ANOM, cmin: 0, cmax: zmax, opacity: 0.97, colorbar: bar,
      contours: contours('rgba(255,255,255,0.3)'), text: mkText(zs.anomaly, 'Anomaly score', 3) }];
  } else {
    zmin = stats.raw.min; zmax = stats.raw.max;
    const [lo, hi] = scaleRange(zmin, zmax);
    data = [{ ...common, z: zs.raw, colorscale: MAIN, cmin: lo, cmax: hi, opacity: 0.97, colorbar: bar,
      contours: contours('rgba(255,255,255,0.35)'), text: mkText(zs.raw, 'Value', 2) }];
  }
  const pad = zmax === zmin ? 1 : (zmax - zmin) * 0.08;
  const axis = ({ title, ...e }) => ({
    color: TXT, gridcolor: GRID, zerolinecolor: GRID, linecolor: GRID,
    showbackground: true, backgroundcolor: 'rgba(6,24,52,0.55)', tickfont: { color: TXT, size: 10 },
    title: { text: title, font: { color: '#d6f4ff', size: 12 } }, ...e,
  });
  const layout = {
    autosize: true, paper_bgcolor: 'rgba(0,0,0,0)', margin: { l: 0, r: 0, t: 0, b: 0 }, font: { color: TXT },
    scene: {
      bgcolor: 'rgba(0,0,0,0)', dragmode: drag, camera: CAMERA, aspectmode: 'manual', aspectratio: { x: 1.4, y: 1.4, z: 0.75 },
      xaxis: axis({ title: 'Sensor Index', tickvals: xs, ticktext: xs.map(String) }),
      yaxis: axis({ title: timeLabel }),
      zaxis: axis({ title: zTitle, range: [zmin >= 0 ? 0 : zmin - pad, zmax + pad] }),
    },
  };
  return { data, layout };
}

function Panel({ kind, title, subtitle, icon, surface, unit, label, resetSignal, file, view, filter, note }) {
  const gd = useRef(null);
  const [drag, setDrag] = useState('orbit');
  // on touch screens the 3D canvas would swallow page scrolling, so it starts locked until tapped
  const coarse = typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;
  const [locked, setLocked] = useState(coarse);
  const fig = useMemo(() => (surface.ok ? makeFig(kind, surface, unit, label, drag) : null), [surface, kind, unit, label, drag]);
  const relayout = (o) => gd.current && Plotly.relayout(gd.current, o);
  const setMode = (m) => { setDrag(m); relayout({ 'scene.dragmode': m }); };
  const reset = () => { setDrag('orbit'); relayout({ 'scene.camera': CAMERA, 'scene.dragmode': 'orbit' }); };
  useEffect(() => { if (resetSignal) reset(); }, [resetSignal]); // eslint-disable-line
  const ok = surface.ok;
  const is3d = view === '3d';
  return (
    <section className="s3d-panel">
      <header>
        <div className="s3d-ico">{icon}</div>
        <div className="s3d-ttl"><h3>{title}</h3><p>{subtitle}</p></div>
        {is3d && <div className="s3d-tools" role="toolbar">
          <button title="Rotate" className={drag === 'orbit' ? 'on' : ''} onClick={() => setMode('orbit')} disabled={!ok}>⬡</button>
          <button title="Zoom" className={drag === 'zoom' ? 'on' : ''} onClick={() => setMode('zoom')} disabled={!ok}>🔍</button>
          <button title="Pan" className={drag === 'pan' ? 'on' : ''} onClick={() => setMode('pan')} disabled={!ok}>✥</button>
          <button title="Reset view" onClick={reset} disabled={!ok}>⌂</button>
          <button title="Save image" onClick={() => gd.current && Plotly.downloadImage(gd.current, { format: 'png', filename: file, width: 1600, height: 900 })} disabled={!ok}>📷</button>
        </div>}
      </header>
      <div className="s3d-stage">
        {ok && note && <div className="s3d-badge">{note}</div>}
        {!ok ? (
          <div className="s3d-empty"><strong>Insufficient Sensor Data</strong><span>{surface.reason}</span></div>
        ) : !is3d ? (
          <Chart2D view={view} surface={surface} kind={kind} unit={unit} filter={filter} />
        ) : (
          <>
            {kind === 'compare' && (
              <div className="s3d-legend"><span><i style={{ background: '#ff3b30' }} />Raw Value</span><span><i style={{ background: '#3aa0ff' }} />Trusted Value</span></div>
            )}
            <div className={locked ? 's3d-plotwrap locked' : 's3d-plotwrap'}>
              <Plot data={fig.data} layout={fig.layout} config={{ displayModeBar: false, responsive: true, displaylogo: false }}
                useResizeHandler style={{ width: '100%', height: '100%' }}
                onInitialized={(_, g) => { gd.current = g; }} onUpdate={(_, g) => { gd.current = g; }} />
            </div>
            {coarse && (locked
              ? <button className="s3d-lock" onClick={() => setLocked(false)}>👆 Tap to rotate &amp; zoom</button>
              : <button className="s3d-lock done" onClick={() => setLocked(true)}>Done · scroll page</button>)}
          </>
        )}
      </div>
    </section>
  );
}

export default function Charts3D({ sensors = [], readings = [], loading = false, error = null, onRefresh }) {
  const [range, setRange] = useState(RANGES[2].ms);
  const [resetSignal, setResetSignal] = useState(0);
  const [view, setView] = useState('3d');
  const filter = 'all';
  const [picked, setPicked] = useState(null); // null = automatic default until the user chooses

  // default: the biggest group of same-type sensors (needs >= 2 for a surface)
  const autoKeys = useMemo(() => {
    const m = new Map();
    sensors.forEach((s) => m.set(sensorType(s), [...(m.get(sensorType(s)) || []), sensorKey(s)]));
    const best = [...m.values()].sort((x, y) => y.length - x.length)[0] || [];
    return best;
  }, [sensors]);
  const selected = picked ?? autoKeys;
  const typed = useMemo(() => sensors.filter((s) => selected.includes(sensorKey(s))), [sensors, selected]);
  const types = [...new Set(typed.map(sensorType))];
  const units = [...new Set(typed.map(sensorUnit).filter(Boolean))];
  const mixed = types.length > 1;
  const unit = units.length === 1 && !mixed ? units[0] : '';
  const activeType = mixed ? 'mixed' : (types[0] || 'sensors').toLowerCase();
  const label = mixed || !types[0] ? 'Value' : types[0].charAt(0).toUpperCase() + types[0].slice(1).toLowerCase();

  const build = (fields) => buildSurfaces({ readings, sensors: typed, fields, rangeMs: range });
  const raw = useMemo(() => build(['raw']), [readings, typed, range]);          // eslint-disable-line
  const cmp = useMemo(() => build(['raw', 'trusted']), [readings, typed, range]); // eslint-disable-line
  const droppedNote = (x) => (x.ok && x.dropped?.length ? `${x.dropped.length} sensor${x.dropped.length > 1 ? 's' : ''} left out (no overlapping data): ${x.dropped.slice(0, 3).join(', ')}${x.dropped.length > 3 ? '…' : ''}` : null);
  const cmpFallback = !cmp.ok && raw.ok && /trusted/i.test(cmp.reason || '');
  const anom = useMemo(() => build(['anomaly']), [readings, typed, range]);      // eslint-disable-line

  const exportCsv = () => {
    const s = cmp.ok ? cmp : raw;
    if (!s.ok) return;
    const url = URL.createObjectURL(new Blob([surfacesToCsv(s)], { type: 'text/csv' }));
    Object.assign(document.createElement('a'), { href: url, download: `surface_${activeType}.csv` }).click();
    URL.revokeObjectURL(url);
  };
  const f = (v) => (v === undefined ? '—' : `${v.toFixed(1)}${unit ? ' ' + unit : ''}`);
  const st = raw.ok ? raw.stats.raw : {};

  if (error) return <div className="s3d"><div className="s3d-panel"><div className="s3d-empty"><strong>Could not load sensor data</strong><span>{String(error.message || error)}</span></div></div></div>;

  return (
    <div className="s3d">
      <div className="s3d-controls">
        <SensorPicker sensors={sensors} selected={selected} onChange={setPicked} />
        <label>Time range
          <select value={range} onChange={(e) => setRange(Number(e.target.value))}>
            {RANGES.map((r) => <option key={r.label} value={r.ms}>{r.label}</option>)}
          </select>
        </label>
        <label>View
          <select value={view} onChange={(e) => setView(e.target.value)}>
            <option value="3d">3D Surface</option>
            <option value="lines">2D Lines</option>
            <option value="heat">2D Heatmap</option>
          </select>
        </label>
        <button className="s3d-primary" onClick={onRefresh} disabled={!onRefresh}>{loading ? 'Loading…' : 'Refresh'}</button>
        <button onClick={() => setResetSignal((n) => n + 1)}>Reset view</button>
        <button onClick={exportCsv} disabled={!raw.ok}>Export CSV</button>
      </div>

      {mixed && <div className="s3d-warn">Sensors of different types are selected ({types.join(', ')}), so values are on different scales. Select one type for a comparable surface.</div>}
      <div className="s3d-grid">
        <Panel kind="raw" icon="🌡" title="Raw Sensor Readings (3D)" subtitle="Sensor values over time"
          note={droppedNote(raw)}
          surface={raw} unit={unit} label={label} resetSignal={resetSignal} view={view} filter={filter} file={`raw_${activeType}`} />
        <Panel kind={cmpFallback ? 'raw' : 'compare'} icon="📈" title="Raw vs Trusted Value (3D)" subtitle="Comparison of raw and trusted values"
          note={cmpFallback ? 'No trusted values stored for these sensors yet — showing raw only' : droppedNote(cmp)}
          surface={cmpFallback ? raw : cmp} unit={unit} label={label} resetSignal={resetSignal} view={view} filter={filter} file={`raw_vs_trusted_${activeType}`} />
        <Panel kind="anomaly" icon="⚠" title="Anomaly Score Over Time (3D)" subtitle="AI anomaly detection scores"
          note={droppedNote(anom)}
          surface={anom} unit={unit} label={label} resetSignal={resetSignal} view={view} filter={filter} file={`anomaly_${activeType}`} />
      </div>

      <div className="s3d-stats">
        <div className="s3d-stat cur"><span>Current</span><b>{f(st.current)}</b></div>
        <div className="s3d-stat max"><span>Maximum</span><b>{f(st.max)}</b></div>
        <div className="s3d-stat min"><span>Minimum</span><b>{f(st.min)}</b></div>
        <div className="s3d-stat avg"><span>Average</span><b>{f(st.avg)}</b></div>
      </div>
    </div>
  );
}
