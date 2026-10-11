// surfaceData.js — turns REAL readings into rectangular Plotly surface grids.
// No fake / random data. Gaps are filled ONLY by linear interpolation between two real readings.

const pick = (o, keys) => {
  for (const k of keys) if (o && o[k] !== undefined && o[k] !== null) return o[k];
  return undefined;
};

// >>> If your API uses different field names, add them here (only place to change). <<<
export const FIELDS = {
  readingSensor: ['sensor_id', 'sensorId', 'sensor'],
  readingTime: ['timestamp', 'time', 'created_at', 'ts'],
  values: {
    raw: ['raw_value', 'value', 'raw'],
    trusted: ['trusted_value', 'trusted'],
    anomaly: ['anomaly_score', 'score', 'if_score'],
  },
  sensorAliases: ['sensor_id', 'id', '_id', 'name'],
  sensorName: ['name', 'sensor_id', 'id'],
  sensorType: ['type', 'sensor_type'],
  sensorUnit: ['unit'],
};

export const sensorAliases = (s) =>
  FIELDS.sensorAliases.map((k) => s?.[k]).filter((v) => v !== undefined && v !== null).map(String);
export const sensorType = (s) => String(pick(s, FIELDS.sensorType) ?? 'unknown');
export const sensorName = (s) => String(pick(s, FIELDS.sensorName) ?? '?');
export const sensorUnit = (s) => pick(s, FIELDS.sensorUnit);

/**
 * fields: e.g. ['raw'], ['raw','trusted'], ['anomaly'] — all returned grids share ONE sensor/time grid.
 */
export function buildSurfaces({ readings, sensors, fields, rangeMs = 24 * 3600e3, maxBuckets = 48 }) {
  const empty = (reason) => ({ ok: false, reason });
  if (!sensors?.length) return empty('No sensors of this type.');

  const aliasToCol = new Map();
  sensors.forEach((s, i) => sensorAliases(s).forEach((a) => aliasToCol.set(a, i)));

  const pts = [];
  for (const r of readings || []) {
    const col = aliasToCol.get(String(pick(r, FIELDS.readingSensor)));
    if (col === undefined) continue;
    const t = new Date(pick(r, FIELDS.readingTime)).getTime();
    if (!Number.isFinite(t)) continue;
    for (const f of fields) {
      const n = Number(pick(r, FIELDS.values[f]));
      if (pick(r, FIELDS.values[f]) !== undefined && Number.isFinite(n)) pts.push({ col, t, f, v: n });
    }
  }
  for (const f of fields) {
    if (!pts.some((p) => p.f === f)) return empty(`No ${f} values found in the readings.`);
  }
  if (pts.length < 4) return empty('Not enough readings yet.');

  const end = Math.max(...pts.map((p) => p.t));
  const inRange0 = rangeMs ? pts.filter((p) => p.t >= end - rangeMs) : pts;

  // Sensors may cover different periods. Find the time window shared by the LARGEST group of sensors
  // (then the longest window), and bucket only inside it so a far-away sensor can't flatten the others.
  const nColsAll = sensors.length;
  const tmin = {}, tmax = {};
  for (const f of fields) { tmin[f] = Array(nColsAll).fill(Infinity); tmax[f] = Array(nColsAll).fill(-Infinity); }
  inRange0.forEach((p) => {
    tmin[p.f][p.col] = Math.min(tmin[p.f][p.col], p.t);
    tmax[p.f][p.col] = Math.max(tmax[p.f][p.col], p.t);
  });
  // a sensor only counts for a window if it has data for EVERY requested field there
  const colMin = (j) => Math.max(...fields.map((f) => tmin[f][j]));
  const colMax = (j) => Math.min(...fields.map((f) => tmax[f][j]));
  const live = [...Array(nColsAll).keys()].filter((j) => colMax(j) > colMin(j) || (colMax(j) === colMin(j) && colMax(j) > -Infinity));
  let win = null;
  for (const a of live.map(colMin)) {
    for (const b of live.map(colMax)) {
      if (b <= a) continue;
      const cols_ = live.filter((j) => colMin(j) <= a && colMax(j) >= b);
      if (cols_.length < 2) continue;
      if (!win || cols_.length > win.cols.length || (cols_.length === win.cols.length && b - a > win.b - win.a)) win = { a, b, cols: cols_ };
    }
  }
  if (!win) return empty('The selected sensors have no overlapping time period. Try "All data" or sensors from the same source.');
  const inRange = inRange0.filter((p) => win.cols.includes(p.col) && p.t >= win.a && p.t <= win.b);
  const t0 = win.a;
  const span = Math.max(win.b - t0, 1);
  const bucketMs = Math.max(1000, Math.ceil(span / maxBuckets));
  const nRows = Math.floor(span / bucketMs) + 1;
  const nCols = sensors.length;

  const zs = {};
  for (const f of fields) {
    const sum = Array.from({ length: nRows }, () => Array(nCols).fill(0));
    const cnt = Array.from({ length: nRows }, () => Array(nCols).fill(0));
    for (const p of inRange) {
      if (p.f !== f) continue;
      const row = Math.floor((p.t - t0) / bucketMs);
      sum[row][p.col] += p.v;
      cnt[row][p.col] += 1;
    }
    const z = sum.map((r, i) => r.map((s, j) => (cnt[i][j] ? s / cnt[i][j] : null)));
    for (let j = 0; j < nCols; j++) {           // interpolate interior gaps only
      let prev = -1;
      for (let i = 0; i < nRows; i++) {
        if (z[i][j] === null) continue;
        if (prev >= 0 && i - prev > 1)
          for (let k = prev + 1; k < i; k++) z[k][j] = z[prev][j] + ((z[i][j] - z[prev][j]) * (k - prev)) / (i - prev);
        prev = i;
      }
    }
    zs[f] = z;
  }

  // Sensors can have data in different time periods. Instead of failing when they don't all overlap,
  // pick the time window shared by the largest group of sensors and leave the others out (reported in `dropped`).
  const span_ = [];   // per column: [firstRow, lastRow] where ALL requested fields have real (or interpolated) data
  for (let j = 0; j < nCols; j++) {
    let f = -1, l = nRows;
    for (const fld of fields) {
      const fi = zs[fld].findIndex((r) => r[j] !== null);
      let li = -1;
      for (let i = nRows - 1; i >= 0; i--) if (zs[fld][i][j] !== null) { li = i; break; }
      if (fi < 0) { f = -1; l = nRows; break; }
      f = Math.max(f, fi); l = Math.min(l, li);
    }
    span_.push(f >= 0 && l >= f ? [f, l] : null);
  }
  const valid = span_.map((x, j) => (x ? j : -1)).filter((j) => j >= 0);
  if (valid.length < 2) return empty('Fewer than 2 selected sensors have readings.');
  const cnt2 = Array(nRows).fill(0);
  valid.forEach((j) => { for (let i = span_[j][0]; i <= span_[j][1]; i++) cnt2[i] += 1; });
  let best = null;
  for (let c = Math.max(...cnt2); c >= 2; c--) {
    let i = 0;
    while (i < nRows) {
      if (cnt2[i] < c) { i++; continue; }
      let e = i;
      while (e + 1 < nRows && cnt2[e + 1] >= c) e++;
      if (e - i >= 1) {
        const cols_ = valid.filter((j) => span_[j][0] <= i && span_[j][1] >= e);
        const score = cols_.length * (e - i + 1);
        if (cols_.length >= 2 && (!best || score > best.score)) best = { score, a: i, b: e, cols: cols_ };
      }
      i = e + 1;
    }
  }
  if (!best) return empty('The selected sensors have no overlapping time period. Try "All data" or sensors from the same source.');
  const keepCols = best.cols;
  const firstRow = best.a, lastRow = best.b;
  const dropped = sensors.filter((_, j) => !keepCols.includes(j)).map(sensorName);
  const rowIdx = [];
  for (let i = firstRow; i <= lastRow; i++) rowIdx.push(i);
  const times = rowIdx.map((i) => t0 + i * bucketMs);
  const out = { ok: true, times, sensors: keepCols.map((j) => sensors[j]), zs: {}, stats: {}, dropped };
  for (const f of fields) {
    out.zs[f] = rowIdx.map((i) => keepCols.map((j) => zs[f][i][j]));
    const flat = out.zs[f].flat().filter((v) => v !== null);
    const latestPts = inRange.filter((p) => p.f === f);
    const latest = latestPts.length ? latestPts.reduce((a, b) => (b.t >= a.t ? b : a)) : null;
    out.stats[f] = {
      current: latest ? latest.v : undefined, min: Math.min(...flat), max: Math.max(...flat),
      avg: flat.reduce((a, b) => a + b, 0) / flat.length,
    };
  }
  return out;
}

export function surfacesToCsv(s) {
  const fields = Object.keys(s.zs);
  const head = ['time', ...fields.flatMap((f) => s.sensors.map((x) => `${sensorName(x)} [${f}]`))].join(',');
  const rows = s.times.map((t, i) =>
    [new Date(t).toISOString(), ...fields.flatMap((f) => s.zs[f][i].map((v) => v ?? ''))].join(','));
  return [head, ...rows].join('\n');
}
