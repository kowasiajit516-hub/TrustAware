/**
 * utils/format.js
 * ---------------
 * Small presentation helpers shared by the mobile card views.
 * Display only - nothing here changes or recomputes backend data.
 */

// Backend timestamps may arrive without a timezone suffix (naive UTC).
// `new Date("2026-08-22T10:00:05")` would then be read as LOCAL time and
// make "2 sec ago" wrong by the whole UTC offset, so treat a missing
// offset as UTC.
export function parseTs(ts) {
  if (!ts) return null;
  if (ts instanceof Date) return ts;
  const s = String(ts);
  const hasTz = /[zZ]$|[+-]\d\d:?\d\d$/.test(s);
  const d = new Date(hasTz ? s : `${s}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function timeAgo(ts, nowMs = Date.now()) {
  const d = parseTs(ts);
  if (!d) return "never";
  const sec = Math.max(0, Math.round((nowMs - d.getTime()) / 1000));
  if (sec < 5) return "just now";
  if (sec < 60) return `${sec} sec ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} h ago`;
  return `${Math.floor(hr / 24)} d ago`;
}

export function formatTime(ts) {
  const d = parseTs(ts);
  return d ? d.toLocaleTimeString() : "—";
}

export function formatDateTime(ts) {
  const d = parseTs(ts);
  return d ? d.toLocaleString() : "—";
}

// Trims floating point noise (18.393884629 -> 18.39) without touching data.
export function formatValue(value) {
  if (value === null || value === undefined) return "—";
  const num = Number(value);
  if (Number.isNaN(num)) return String(value);
  return Number.isInteger(num) ? String(num) : num.toFixed(2);
}

export const CONDITION_SYMBOL = {
  GREATER_THAN: ">",
  GREATER_THAN_OR_EQUAL: "≥",
  LESS_THAN: "<",
  LESS_THAN_OR_EQUAL: "≤",
  EQUAL: "=",
};

export function conditionSymbol(condition) {
  return CONDITION_SYMBOL[condition] || condition;
}
