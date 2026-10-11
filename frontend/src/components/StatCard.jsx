export default function StatCard({ icon: Icon, label, value, sub, tone = "cyan" }) {
  const toneMap = {
    cyan: "text-accent-cyan bg-accent-cyan/10",
    purple: "text-accent-purple bg-accent-purple/10",
    healthy: "text-status-healthy bg-status-healthy/10",
    faulty: "text-status-faulty bg-status-faulty/10",
    recovering: "text-status-recovering bg-status-recovering/10",
    offline: "text-status-offline bg-status-offline/10",
  };
  return (
    <div className="stat-card min-w-[150px]">
      <div>
        <div className="label-eyebrow">{label}</div>
        <div className="text-2xl font-bold text-[#F8FAFC] mt-1">{value}</div>
        {sub && <div className="text-[11px] text-[#94A3B8] mt-0.5">{sub}</div>}
      </div>
      {Icon && (
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${toneMap[tone]}`}>
          <Icon size={18} />
        </div>
      )}
    </div>
  );
}
