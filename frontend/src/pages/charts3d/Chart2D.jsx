import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { MAIN, ANOM, DIVERGE, GRID, TXT, LINE_COLORS, colorAt } from './theme';
import { sensorName } from './surfaceData';

const fmtClock = (ms, sec) =>
  new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', ...(sec ? { second: '2-digit' } : {}) });
const num = (v) => Number(Number(v).toPrecision(4)).toString();

function niceTicks(min, max, n = 5) {
  if (min === max) { min -= 1; max += 1; }
  const s0 = (max - min) / n, mag = 10 ** Math.floor(Math.log10(s0)), r = s0 / mag;
  const step = (r < 1.5 ? 1 : r < 3 ? 2 : r < 7 ? 5 : 10) * mag;
  const out = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(+v.toFixed(10));
  return out;
}
function useWidth() {
  const ref = useRef(null);
  const [w, setW] = useState(600);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => setW(Math.max(240, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}
const Empty = () => <div className="s3d-empty"><strong>Insufficient Sensor Data</strong></div>;

/* ------------------------------ 2D LINES ------------------------------ */
function Lines({ surface, kind, unit, filter }) {
  const [ref, w] = useWidth();
  const [hov, setHov] = useState(null);
  const H = 316, m = { l: 54, r: 14, t: 12, b: 34 };
  const { times, zs, sensors } = surface;
  const fields = kind === 'compare' ? ['raw', 'trusted'] : [kind === 'anomaly' ? 'anomaly' : 'raw'];
  const idx = sensors.map((_, j) => j).filter((j) => filter === 'all' || sensorName(sensors[j]) === filter);
  if (!idx.length) return <Empty />;

  const vals = fields.flatMap((f) => zs[f].flatMap((r) => idx.map((j) => r[j]))).filter((v) => v !== null);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (kind === 'anomaly') { lo = 0; hi = Math.max(1, hi); } else if (lo >= 0) lo = Math.min(lo, Math.max(0, lo - (hi - lo) * 0.05));
  if (lo === hi) { lo -= 1; hi += 1; }
  const pw = w - m.l - m.r, ph = H - m.t - m.b;
  const t0 = times[0], t1 = times[times.length - 1];
  const X = (t) => m.l + ((t - t0) / (t1 - t0 || 1)) * pw;
  const Y = (v) => m.t + (1 - (v - lo) / (hi - lo)) * ph;
  const yT = niceTicks(lo, hi), sec = t1 - t0 < 30 * 60e3;
  const xT = [0, 1, 2, 3, 4].map((k) => t0 + ((t1 - t0) * k) / 4);
  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.round(((e.clientX - r.left - m.l) / pw) * (times.length - 1));
    setHov(i < 0 || i > times.length - 1 ? null : i);
  };
  return (
    <div className="s3d-2d">
      <div ref={ref} style={{ position: 'relative', height: H }}>
        <svg width={w} height={H} onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHov(null)} style={{ touchAction: 'pan-y' }}>
          {yT.map((v) => (
            <g key={v}><line x1={m.l} x2={w - m.r} y1={Y(v)} y2={Y(v)} stroke={GRID} strokeDasharray="2 4" />
              <text x={m.l - 8} y={Y(v) + 4} fill={TXT} fontSize="11" textAnchor="end">{num(v)}</text></g>
          ))}
          {xT.map((t) => (
            <g key={t}><line x1={X(t)} x2={X(t)} y1={m.t} y2={H - m.b} stroke={GRID} strokeDasharray="2 4" />
              <text x={X(t)} y={H - 12} fill={TXT} fontSize="11" textAnchor="middle">{fmtClock(t, sec)}</text></g>
          ))}
          <text transform={`translate(13 ${m.t + ph / 2}) rotate(-90)`} fill="#d6f4ff" fontSize="11" textAnchor="middle">
            {kind === 'anomaly' ? 'Anomaly Score' : unit || 'Value'}</text>
          {idx.map((j, k) => fields.map((f) => (
            <path key={`${f}${j}`} fill="none" stroke={LINE_COLORS[k % LINE_COLORS.length]} strokeWidth="1.8"
              strokeDasharray={f === 'trusted' ? '6 4' : undefined} opacity={f === 'trusted' ? 0.95 : 1}
              d={times.map((t, i) => `${i ? 'L' : 'M'}${X(t).toFixed(1)},${Y(zs[f][i][j]).toFixed(1)}`).join('')} />
          )))}
          {hov !== null && <line x1={X(times[hov])} x2={X(times[hov])} y1={m.t} y2={H - m.b} stroke="#22d3ee" strokeOpacity=".7" />}
        </svg>
        {hov !== null && (
          <div className="s3d-tip" style={{ left: X(times[hov]) > w * 0.6 ? X(times[hov]) - 210 : X(times[hov]) + 12, top: 14 }}>
            <b>{fmtClock(times[hov], true)}</b>
            {idx.slice(0, 8).map((j, k) => (
              <div key={j}><i style={{ background: LINE_COLORS[k % LINE_COLORS.length] }} />{sensorName(sensors[j])}:{' '}
                {fields.map((f) => `${f[0].toUpperCase()}${f.slice(1)} ${zs[f][hov][j].toFixed(kind === 'anomaly' ? 3 : 2)}`).join(' · ')}</div>
            ))}
          </div>
        )}
      </div>
      <div className="s3d-chips">
        {kind === 'compare' && <span className="s3d-note">solid = Raw · dashed = Trusted</span>}
        {idx.map((j, k) => <span key={j}><i style={{ background: LINE_COLORS[k % LINE_COLORS.length] }} />{sensorName(sensors[j])}</span>)}
      </div>
    </div>
  );
}

/* ------------------------------ 2D HEATMAP ------------------------------ */
function Heat({ surface, kind, unit }) {
  const [ref, w] = useWidth();
  const [hov, setHov] = useState(null);
  const gid = useId().replace(/:/g, '');
  const H = 380, m = { l: 46, r: 84, t: 14, b: 34 };
  const { times, zs, sensors } = surface;
  const isDiff = kind === 'compare';
  const grid = useMemo(() => (isDiff ? zs.raw.map((r, i) => r.map((v, j) => v - zs.trusted[i][j])) : zs[kind === 'anomaly' ? 'anomaly' : 'raw']), [zs, kind, isDiff]);
  const flat = grid.flat();
  let lo = Math.min(...flat), hi = Math.max(...flat), scale = MAIN;
  if (kind === 'anomaly') { scale = ANOM; lo = 0; hi = Math.max(1, hi); }
  if (isDiff) { scale = DIVERGE; const a = Math.max(Math.abs(lo), Math.abs(hi)) || 1; lo = -a; hi = a; }
  if (lo === hi) { lo -= 1; hi += 1; }
  const n = times.length, k = sensors.length;
  const pw = w - m.l - m.r, ph = H - m.t - m.b, cw = pw / n, ch = ph / k;
  const sec = times[n - 1] - times[0] < 30 * 60e3;
  const xT = [0, 1, 2, 3, 4].map((q) => Math.round(((n - 1) * q) / 4));
  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.floor((e.clientX - r.left - m.l) / cw), j = Math.floor((e.clientY - r.top - m.t) / ch);
    setHov(i >= 0 && i < n && j >= 0 && j < k ? { i, j } : null);
  };
  const bar = { x: w - m.r + 18, y: m.t, w: 14, h: ph };
  return (
    <div className="s3d-2d">
      <div ref={ref} style={{ position: 'relative', height: H }}>
        <svg width={w} height={H} onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHov(null)} style={{ touchAction: 'pan-y' }}>
          <defs><linearGradient id={gid} x1="0" y1="1" x2="0" y2="0">
            {scale.map(([o, c]) => <stop key={o} offset={`${o * 100}%`} stopColor={c} />)}</linearGradient></defs>
          {grid.map((row, i) => row.map((v, j) => (
            <rect key={`${i}-${j}`} x={m.l + i * cw} y={m.t + j * ch} width={cw + 0.6} height={ch + 0.6} fill={colorAt(scale, (v - lo) / (hi - lo))} />
          )))}
          <rect x={m.l} y={m.t} width={pw} height={ph} fill="none" stroke={GRID} />
          {sensors.map((_, j) => <text key={j} x={m.l - 8} y={m.t + j * ch + ch / 2 + 4} fill={TXT} fontSize="11" textAnchor="end">{j}</text>)}
          {xT.map((i) => <text key={i} x={m.l + i * cw + cw / 2} y={H - 12} fill={TXT} fontSize="11" textAnchor="middle">{fmtClock(times[i], sec)}</text>)}
          <text transform={`translate(11 ${m.t + ph / 2}) rotate(-90)`} fill="#d6f4ff" fontSize="11" textAnchor="middle">Sensor Index</text>
          <rect x={bar.x} y={bar.y} width={bar.w} height={bar.h} fill={`url(#${gid})`} stroke={GRID} />
          {[0, 0.25, 0.5, 0.75, 1].map((q) => (
            <text key={q} x={bar.x + bar.w + 6} y={bar.y + bar.h * (1 - q) + 4} fill={TXT} fontSize="10">{num(lo + (hi - lo) * q)}</text>
          ))}
          <text x={bar.x} y={bar.y - 3} fill="#d6f4ff" fontSize="10">{isDiff ? `Raw − Trusted${unit ? ' (' + unit + ')' : ''}` : kind === 'anomaly' ? 'Score' : unit || 'Value'}</text>
          {hov && <rect x={m.l + hov.i * cw} y={m.t + hov.j * ch} width={cw} height={ch} fill="none" stroke="#fff" />}
        </svg>
        {hov && (
          <div className="s3d-tip" style={{ left: m.l + hov.i * cw > w * 0.55 ? m.l + hov.i * cw - 190 : m.l + hov.i * cw + 16, top: m.t + hov.j * ch }}>
            <b>{sensorName(sensors[hov.j])}</b>
            <div>Time: {fmtClock(times[hov.i], true)}</div>
            <div>{isDiff ? 'Raw − Trusted' : kind === 'anomaly' ? 'Score' : 'Value'}: {grid[hov.i][hov.j].toFixed(kind === 'anomaly' ? 3 : 2)}{!isDiff && kind !== 'anomaly' && unit ? ' ' + unit : ''}</div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Chart2D({ view, ...props }) {
  return view === 'heat' ? <Heat {...props} /> : <Lines {...props} />;
}
