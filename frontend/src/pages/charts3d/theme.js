// theme.js — shared colours (same palette for 3D and 2D views)
export const MAIN = [[0, '#0a1cff'], [0.18, '#1f7bff'], [0.36, '#00e5ff'], [0.52, '#00e676'], [0.68, '#f5f500'], [0.84, '#ff9100'], [1, '#ff1a1a']];
export const ANOM = [[0, '#1c14b8'], [0.2, '#2f4bff'], [0.4, '#22d3ee'], [0.6, '#7ee33a'], [0.75, '#facc15'], [0.9, '#ff7a1a'], [1, '#ff1a1a']];
export const RAW_RED = [[0, '#8a1020'], [0.5, '#e0322f'], [1, '#ff6a4d']];
export const TRUST_BLUE = [[0, '#0a2a9a'], [0.5, '#1f7bff'], [1, '#4fc3ff']];
export const DIVERGE = [[0, '#2f8bff'], [0.5, '#0b1a33'], [1, '#ff3b30']];
export const GRID = 'rgba(34,211,238,0.28)';
export const TXT = '#9fdcff';
export const LINE_COLORS = ['#22d3ee', '#a78bfa', '#f472b6', '#fb923c', '#4ade80', '#facc15', '#60a5fa', '#f87171', '#2dd4bf', '#c084fc'];

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
export function colorAt(scale, t) {
  const x = Math.min(1, Math.max(0, t));
  for (let i = 1; i < scale.length; i++) {
    if (x <= scale[i][0]) {
      const [a, b] = [scale[i - 1], scale[i]];
      const k = (x - a[0]) / (b[0] - a[0] || 1);
      const [c1, c2] = [hex(a[1]), hex(b[1])];
      return `rgb(${c1.map((v, j) => Math.round(v + (c2[j] - v) * k)).join(',')})`;
    }
  }
  return scale[scale.length - 1][1];
}
