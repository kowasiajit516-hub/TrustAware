import { ShieldCheck, Thermometer, Droplets, Wifi, Cloud } from "lucide-react";

export default function AuthLayout({ children }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-base-bg">
      <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 rounded-2xl overflow-hidden border border-base-border shadow-glow">
        {/* Form panel */}
        <div className="bg-base-panel p-8 md:p-10 flex flex-col justify-center">
          <div className="flex items-center gap-2 mb-8">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-accent-blue to-accent-purple flex items-center justify-center">
              <ShieldCheck size={20} className="text-white" />
            </div>
            <span className="font-bold text-lg text-slate-100">TrustAware</span>
          </div>
          {children}
        </div>

        {/* Illustration panel */}
        <div className="hidden md:flex relative bg-gradient-to-br from-[#0b1330] via-[#0d1a3a] to-[#151033] p-10 flex-col justify-center items-center text-center overflow-hidden">
          <div className="absolute inset-0 opacity-30" style={{
            backgroundImage: "radial-gradient(circle at 30% 20%, rgba(59,130,246,0.35), transparent 40%), radial-gradient(circle at 70% 70%, rgba(139,92,246,0.3), transparent 45%)"
          }} />
          <div className="relative z-10">
            <h2 className="text-xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-accent-cyan to-accent-purple mb-1">
              SELF-HEALING AIoT
            </h2>
            <h2 className="text-xl font-extrabold text-slate-100 mb-4">SENSOR NETWORK</h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              AI-Based Fault Detection
              <br />
              Dynamic Trust
              <br />
              Virtual Sensing
            </p>

            <div className="relative w-48 h-48 mx-auto mt-10">
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-accent-blue/30 to-accent-purple/30 border border-accent-cyan/40 flex items-center justify-center backdrop-blur">
                  <ShieldCheck size={36} className="text-accent-cyan" />
                </div>
              </div>
              <FloatIcon className="top-0 left-4" icon={Thermometer} color="text-orange-400" />
              <FloatIcon className="top-2 right-2" icon={Cloud} color="text-slate-300" />
              <FloatIcon className="bottom-6 left-0" icon={Droplets} color="text-accent-blue" />
              <FloatIcon className="bottom-0 right-6" icon={Wifi} color="text-accent-cyan" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FloatIcon({ className, icon: Icon, color }) {
  return (
    <div
      className={`absolute w-9 h-9 rounded-xl bg-base-card border border-base-border flex items-center justify-center ${className}`}
    >
      <Icon size={16} className={color} />
    </div>
  );
}
