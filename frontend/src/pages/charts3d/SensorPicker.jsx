import { useEffect, useMemo, useRef, useState } from 'react';
import { sensorAliases, sensorName, sensorType } from './surfaceData';

export const sensorKey = (s) => sensorAliases(s)[0];

/** Multi-select of individual sensors. `selected` is an array of sensorKey values. */
export default function SensorPicker({ sensors, selected, onChange }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const box = useRef(null);
  useEffect(() => {
    const close = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const sel = useMemo(() => new Set(selected), [selected]);
  const groups = useMemo(() => {
    const m = new Map();
    sensors.forEach((s) => m.set(sensorType(s), [...(m.get(sensorType(s)) || []), sensorKey(s)]));
    return [...m.entries()];
  }, [sensors]);
  const shown = sensors.filter((s) => `${sensorKey(s)} ${sensorName(s)} ${sensorType(s)}`.toLowerCase().includes(q.toLowerCase()));
  const activeGroup = groups.find(([, keys]) => keys.length === selected.length && keys.every((k) => sel.has(k)));
  const label = !selected.length
    ? 'Select sensors'
    : `${activeGroup ? activeGroup[0] + ' · ' : ''}${selected.length} sensor${selected.length > 1 ? 's' : ''}`;
  const toggle = (k) => onChange(sel.has(k) ? selected.filter((x) => x !== k) : [...selected, k]);

  return (
    <div className="s3d-pick" ref={box}>
      <span className="s3d-pick-l">Sensors</span>
      <button type="button" className="s3d-pick-btn" onClick={() => setOpen((o) => !o)}>
        {label} ▾
      </button>
      {open && (
        <div className="s3d-pick-pop">
          <input placeholder="Search sensors…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          <div className="s3d-pick-quick">
            <button type="button" onClick={() => onChange(sensors.map(sensorKey))}>All</button>
            <button type="button" onClick={() => onChange([])}>Clear</button>
            {groups.map(([t, keys]) => (
              <button type="button" key={t} className={activeGroup && activeGroup[0] === t ? 'on' : ''}
                onClick={() => { onChange(keys); setOpen(false); }}>{t} ({keys.length})</button>
            ))}
          </div>
          <div className="s3d-pick-list">
            {shown.map((s) => (
              <label key={sensorKey(s)}>
                <input type="checkbox" checked={sel.has(sensorKey(s))} onChange={() => toggle(sensorKey(s))} />
                <b>{sensorKey(s)}</b>
                <span>{sensorName(s)}</span>
                <em>{sensorType(s)}</em>
              </label>
            ))}
            {!shown.length && <p>No sensors match.</p>}
          </div>
          <button type="button" className="s3d-pick-done" onClick={() => setOpen(false)}>
            Show graphs ({selected.length} selected)
          </button>
        </div>
      )}
    </div>
  );
}
