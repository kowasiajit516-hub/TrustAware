import { useEffect, useState } from "react";
import Topbar from "../components/Topbar.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import TrustBar from "../components/TrustBar.jsx";
import { usePolling } from "../hooks/usePolling.js";
import {
  listSensors,
  getSensorHealth,
  getLatestPrediction,
  getLatestTrustedReading,
  getLatestFaultEvent,
} from "../api/client.js";

export default function SelfHealing() {
  const { data: sensors } = usePolling(() => listSensors(), [], 6000);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    if (sensors && sensors.length && !selected) {
      setSelected(sensors[0].sensor_id);
    }
  }, [sensors, selected]);

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    async function load() {
      setLoadingDetail(true);
      const [health, prediction, trusted, faultEvent] = await Promise.allSettled([
        getSensorHealth(selected),
        getLatestPrediction(selected),
        getLatestTrustedReading(selected),
        getLatestFaultEvent(selected),
      ]);
      if (!cancelled) {
        setDetail({
          health: health.status === "fulfilled" ? health.value : null,
          prediction: prediction.status === "fulfilled" ? prediction.value : null,
          trusted: trusted.status === "fulfilled" ? trusted.value : null,
          faultEvent: faultEvent.status === "fulfilled" ? faultEvent.value : null,
        });
        setLoadingDetail(false);
      }
    }
    load();
    const id = setInterval(load, 4000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [selected]);

  return (
    <div>
      <Topbar
        title="Self-Healing Status"
        subtitle="Fault detection → trust score → virtual sensing → trusted value, per sensor"
      />
      <div className="p-6 grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="card p-4 h-fit">
          <div className="label-eyebrow mb-3">Sensors</div>
          <div className="space-y-1">
            {sensors?.map((s) => (
              <button
                key={s.sensor_id}
                onClick={() => setSelected(s.sensor_id)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center justify-between ${
                  selected === s.sensor_id
                    ? "bg-accent-cyan/10 text-accent-cyan"
                    : "text-slate-400 hover:bg-base-hover"
                }`}
              >
                <span>{s.sensor_id}</span>
                <StatusBadge status={s.status} />
              </button>
            ))}
            {sensors && sensors.length === 0 && (
              <p className="text-xs text-slate-500 px-3 py-2">No sensors yet.</p>
            )}
          </div>
        </div>

        <div className="lg:col-span-3 space-y-6">
          {!selected ? (
            <div className="card p-8 text-center text-sm text-slate-500">Select a sensor.</div>
          ) : loadingDetail && !detail ? (
            <div className="card p-8 text-center text-sm text-slate-500">Loading…</div>
          ) : (
            <>
              <div className="card p-5">
                <h2 className="font-semibold text-slate-200 mb-4">{selected} — Current Health</h2>
                {detail?.health ? (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <Stat label="Status" value={<StatusBadge status={detail.health.status} />} />
                    <Stat label="Trust Score" value={`${detail.health.trust_score.toFixed(1)}%`} />
                    <Stat label="Consecutive Faults" value={detail.health.consecutive_faults} />
                    <Stat label="Consecutive Healthy" value={detail.health.consecutive_healthy} />
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">
                    No health data yet — post a reading for this sensor first.
                  </p>
                )}
                {detail?.health && <div className="mt-4 max-w-xs"><TrustBar score={detail.health.trust_score} /></div>}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="card p-5">
                  <h3 className="text-sm font-semibold text-slate-300 mb-3">Latest AI Prediction</h3>
                  {detail?.prediction ? (
                    <div className="space-y-2 text-xs">
                      <Row label="Value" value={detail.prediction.value} />
                      <Row label="Anomaly Score" value={detail.prediction.anomaly_score.toFixed(4)} />
                      <Row
                        label="Is Fault"
                        value={
                          <StatusBadge status={detail.prediction.is_fault ? "FAULTY" : "HEALTHY"} />
                        }
                      />
                      <Row label="Model Version" value={detail.prediction.model_version} />
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500">No predictions yet.</p>
                  )}
                </div>

                <div className="card p-5">
                  <h3 className="text-sm font-semibold text-slate-300 mb-3">Latest Trusted Value</h3>
                  {detail?.trusted ? (
                    <div className="space-y-2 text-xs">
                      <Row label="Raw Value" value={detail.trusted.raw_value} />
                      <Row label="Trusted Value" value={detail.trusted.trusted_value} />
                      <Row label="Source" value={<StatusBadge status={detail.trusted.source} />} />
                      <Row label="Status At Prediction" value={detail.trusted.status_at_prediction} />
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500">No trusted readings yet.</p>
                  )}
                </div>
              </div>

              <div className="card p-5">
                <h3 className="text-sm font-semibold text-slate-300 mb-3">Latest Status Transition</h3>
                {detail?.faultEvent ? (
                  <div className="flex items-center gap-3 text-sm">
                    <StatusBadge status={detail.faultEvent.previous_status} />
                    <span className="text-slate-500">→</span>
                    <StatusBadge status={detail.faultEvent.new_status} />
                    <span className="text-xs text-slate-500 ml-auto">
                      {new Date(detail.faultEvent.timestamp).toLocaleString()}
                    </span>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">
                    No status transitions recorded yet for this sensor.
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className="font-semibold text-slate-100 mt-0.5">{value}</div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-500">{label}</span>
      <span className="text-slate-200 font-medium">{value}</span>
    </div>
  );
}
