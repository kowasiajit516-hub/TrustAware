import { useEffect, useState } from "react";
import { getHealth } from "../api/client.js";

export default function Topbar({ title, subtitle }) {
  const [online, setOnline] = useState(null);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    let cancelled = false;
    const check = () =>
      getHealth()
        .then(() => !cancelled && setOnline(true))
        .catch(() => !cancelled && setOnline(false));
    check();
    const id = setInterval(check, 10000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="ta-page-topbar flex items-center justify-between px-6 py-5 border-b border-base-border bg-base-bg/70 backdrop-blur sticky top-0 z-10">
      <div>
        <h1 className="text-lg font-bold text-base-ink">{title}</h1>
        {subtitle && <p className="text-xs text-[#94A3B8] mt-0.5">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-4 text-xs text-[#94A3B8]">
        <div className="flex items-center gap-1.5">
          <span
            className={`w-2 h-2 rounded-full ${
              online === null ? "bg-[#94A3B8]" : online ? "bg-status-healthy" : "bg-status-faulty"
            }`}
          />
          {online === null ? "Checking..." : online ? "System Online" : "Backend Unreachable"}
        </div>
        <div className="text-[#94A3B8]">
          {now.toLocaleTimeString()} · {now.toLocaleDateString()}
        </div>
      </div>
    </div>
  );
}
