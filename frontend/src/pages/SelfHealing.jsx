import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import Topbar from "../components/Topbar.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import TrustBar from "../components/TrustBar.jsx";
import PipelineFlow from "../components/PipelineFlow.jsx";
import SelfHealingStatus from "../components/SelfHealingStatus.jsx";
import { formatDateTime } from "../utils/format.js";
import { usePolling } from "../hooks/usePolling.js";
import {
  listSensors,
  getSensorHealth,
  getLatestPrediction,
  getLatestTrustedReading,
  getLatestFaultEvent,
  listFaultEvents,
} from "../api/client.js";

export default function SelfHealing() {
  const { data: sensors } = usePolling(() => listSensors(), [], 6000);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [search, setSearch] = useState("");

  const filteredSensors = useMemo(() => {
    if (!sensors) return sensors;
    const q = search.trim().toLowerCase();
    if (!q) return sensors;
    return sensors.filter((s) => s.sensor_id.toLowerCase().includes(q));
  }, [sensors, search]);

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
      const [health, prediction, trusted, faultEvent, events] = await Promise.allSettled([
        getSensorHealth(selected),
        getLatestPrediction(selected),
        getLatestTrustedReading(selected),
        getLatestFaultEvent(selected),
        listFaultEvents({ sensor_id: selected, limit: 12 }),
      ]);
      if (!cancelled) {
        setDetail({
          health: health.status === "fulfilled" ? health.value : null,
          prediction: prediction.status === "fulfilled" ? prediction.value : null,
          trusted: trusted.status === "fulfilled" ? trusted.value : null,
          faultEvent: faultEvent.status === "fulfilled" ? faultEvent.value : null,
          events: events.status === "fulfilled" ? events.value : [],
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
        {/* Phones: horizontally scrollable sensor chips instead of a tall list */}
        <div className="lg:hidden -mx-3 px-3 overflow-x-auto" role="tablist" aria-label="Sensors">
          <div className="flex gap-2 pb-1 w-max">
            {(sensors || []).map((s) => (
              <button
                key={s.sensor_id}
                role="tab"
                aria-selected={selected === s.sensor_id}
                onClick={() => setSelected(s.sensor_id)}
                className={`ta-compact min-h-[44px] px-3 rounded-full border text-xs font-semibold flex items-center gap-2 whitespace-nowrap ${
                  selected === s.sensor_id
                    ? "border-accent-cyan text-accent-cyan bg-accent-cyan/10"
                    : "border-base-border text-[#94A3B8]"
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    s.status === "HEALTHY"
                      ? "bg-status-healthy"
                      : s.status === "FAULTY"
                      ? "bg-status-faulty"
                      : s.status === "RECOVERING"
                      ? "bg-status-recovering"
                      : "bg-status-offline"
                  }`}
                />
                {s.sensor_id}
              </button>
            ))}
            {sensors && sensors.length === 0 && (
              <span className="text-xs text-[#94A3B8] px-1 py-3">No sensors yet.</span>
            )}
          </div>
        </div>

        <div className="hidden lg:block card p-4 h-fit">
          <div className="label-eyebrow mb-3">Sensors</div>
          <div className="relative mb-3">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
            <input
              className="input pl-8 text-xs py-1.5"
              placeholder="Search sensors…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            {filteredSensors?.map((s) => (
              <button
                key={s.sensor_id}
                onClick={() => setSelected(s.sensor_id)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center justify-between ${
                  selected === s.sensor_id
                    ? "bg-accent-cyan/10 text-accent-cyan"
                    : "text-[#94A3B8] hover:bg-base-hover"
                }`}
              >
                <span>{s.sensor_id}</span>
                <StatusBadge status={s.status} />
              </button>
            ))}
            {sensors && sensors.length === 0 && (
              <p className="text-xs text-[#94A3B8] px-3 py-2">No sensors yet.</p>
            )}
            {sensors && sensors.length > 0 && filteredSensors.length === 0 && (
              <p className="text-xs text-[#94A3B8] px-3 py-2">No sensors match "{search}".</p>
            )}
          </div>
        </div>

        <div className="lg:col-span-3 space-y-6">
          {!selected ? (
            <div className="card p-8 text-center text-sm text-[#94A3B8]">Select a sensor.</div>
          ) : loadingDetail && !detail ? (
            <div className="card p-8 text-center text-sm text-[#94A3B8]">Loading…</div>
          ) : (
            <>
              <SelfHealingStatus sensorId={selected} />
              <div className="card p-5">
                <h2 className="font-semibold text-[#F8FAFC] mb-4">{selected} — Current Health</h2>
                {detail?.health ? (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <Stat label="Status" value={<StatusBadge status={detail.health.status} />} />
                    <Stat label="Trust Score" value={`${detail.health.trust_score.toFixed(1)}%`} />
                    <Stat label="Consecutive Faults" value={detail.health.consecutive_faults} />
                    <Stat label="Consecutive Healthy" value={detail.health.consecutive_healthy} />
                  </div>
                ) : (
                  <p className="text-sm text-[#94A3B8]">
                    No health data yet — post a reading for this sensor first.
                  </p>
                )}
                {detail?.health && <div className="mt-4 max-w-xs"><TrustBar score={detail.health.trust_score} /></div>}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="card p-5">
                  <h3 className="text-sm font-semibold text-[#F8FAFC] mb-3">Latest AI Prediction</h3>
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
                    <p className="text-xs text-[#94A3B8]">No predictions yet.</p>
                  )}
                </div>

                <div className="card p-5">
                  <h3 className="text-sm font-semibold text-[#F8FAFC] mb-3">Latest Trusted Value</h3>
                  {detail?.trusted ? (
                    <div className="space-y-2 text-xs">
                      <Row label="Raw Value" value={detail.trusted.raw_value} />
                      <Row label="Trusted Value" value={detail.trusted.trusted_value} />
                      <Row label="Source" value={<StatusBadge status={detail.trusted.source} />} />
                      <Row label="Status At Prediction" value={detail.trusted.status_at_prediction} />
                    </div>
                  ) : (
                    <p className="text-xs text-[#94A3B8]">No trusted readings yet.</p>
                  )}
                </div>
              </div>

              <div className="card p-5">
                <h3 className="text-sm font-semibold text-[#F8FAFC] mb-3">Latest Status Transition</h3>
                {detail?.faultEvent ? (
                  <div className="flex items-center gap-3 text-sm">
                    <StatusBadge status={detail.faultEvent.previous_status} />
                    <span className="text-[#94A3B8]">→</span>
                    <StatusBadge status={detail.faultEvent.new_status} />
                    <span className="text-xs text-[#94A3B8] ml-auto">
                      {new Date(detail.faultEvent.timestamp).toLocaleString()}
                    </span>
                  </div>
                ) : (
                  <p className="text-xs text-[#94A3B8]">
                    No status transitions recorded yet for this sensor.
                  </p>
                )}
              </div>
              <div className="card p-5">
                <h3 className="text-sm font-semibold text-[#F8FAFC] mb-3">Self-Healing Pipeline</h3>
                <PipelineFlow sensorId={selected} />
              </div>

              <div className="card p-5">
                <h3 className="text-sm font-semibold text-[#F8FAFC] mb-3">Recovery Timeline</h3>
                <Timeline events={detail?.events} />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Real status transitions (GET /fault-events?sensor_id=...), newest first.
// "Trust a → b" compares with the previous transition's recorded trust
// score for the same sensor; the first ever transition has no "before".
function Timeline({ events }) {
  if (!events || events.length === 0) {
    return <p className="text-xs text-[#94A3B8]">No status transitions recorded yet for this sensor.</p>;
  }
  const sorted = [...events].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  return (
    <ol className="space-y-3">
      {sorted.map((e, i) => {
        const before = sorted[i + 1]?.trust_score;
        return (
          <li key={e.id} className="flex gap-3">
            <span className="mt-1.5 w-2 h-2 rounded-full bg-accent-cyan shrink-0" />
            <div className="min-w-0 text-xs">
              <div className="flex flex-wrap items-center gap-1.5">
                <StatusBadge status={e.previous_status} />
                <span className="text-[#94A3B8]">→</span>
                <StatusBadge status={e.new_status} />
              </div>
              <div className="text-[#94A3B8] mt-1">
                Trust{" "}
                {before !== undefined ? (
                  <span className="text-[#F8FAFC] font-semibold">
                    {before.toFixed(0)} → {e.trust_score.toFixed(0)}
                  </span>
                ) : (
                  <span className="text-[#F8FAFC] font-semibold">{e.trust_score.toFixed(0)}</span>
                )}{" "}
                · {formatDateTime(e.timestamp)}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <div className="text-[11px] text-[#94A3B8]">{label}</div>
      <div className="font-semibold text-[#F8FAFC] mt-0.5">{value}</div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[#94A3B8]">{label}</span>
      <span className="text-[#F8FAFC] font-medium">{value}</span>
    </div>
  );
}
