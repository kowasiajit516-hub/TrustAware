import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { KeyRound, Lock, ArrowRight, Check } from "lucide-react";
import AuthLayout from "../../components/AuthLayout.jsx";
import { resetPassword } from "../../api/client.js";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [token, setToken] = useState(searchParams.get("token") || "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const strength = password.length >= 12 ? "Strong" : password.length >= 8 ? "Medium" : "Weak";
  const strengthColor =
    strength === "Strong" ? "bg-emerald-500" : strength === "Medium" ? "bg-amber-500" : "bg-red-500";
  const strengthWidth = strength === "Strong" ? "100%" : strength === "Medium" ? "60%" : "25%";

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      await resetPassword({ token, new_password: password });
      setDone(true);
    } catch (err) {
      setError(err.detail || err.message);
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <AuthLayout>
        <div className="text-center py-6">
          <div className="w-16 h-16 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center mx-auto mb-5 text-emerald-600">
            <Check size={28} />
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900 mb-2">Password Reset</h1>
          <p className="text-sm text-slate-500 mb-8">
            Your password has been changed successfully. You can sign in now.
          </p>
          <button
            onClick={() => navigate("/login")}
            className="w-full py-3 rounded-xl text-sm font-semibold bg-auth-blue text-white hover:bg-auth-blueDark flex items-center justify-center gap-2 transition-colors"
          >
            Go to Sign In
            <ArrowRight size={16} />
          </button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <h1 className="text-3xl font-extrabold text-slate-900 mb-2">Create New Password</h1>
      <p className="text-sm text-slate-500 mb-8">Please enter your new password below.</p>

      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </div>
        )}
        <label className="block">
          <span className="block text-sm font-semibold text-slate-800 mb-1.5">Reset Token</span>
          <div className="relative">
            <KeyRound size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              required
              className="auth-input font-mono text-xs"
              placeholder="Paste the token from the previous step"
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
          </div>
        </label>
        <label className="block">
          <span className="block text-sm font-semibold text-slate-800 mb-1.5">New Password</span>
          <div className="relative">
            <Lock size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="password"
              required
              minLength={8}
              className="auth-input"
              placeholder="Enter new password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {password && (
            <div className="mt-2">
              <div className="h-1 rounded-full bg-slate-200 overflow-hidden">
                <div className={`h-full rounded-full ${strengthColor}`} style={{ width: strengthWidth }} />
              </div>
              <span className="text-[11px] text-slate-400">Password strength: {strength}</span>
            </div>
          )}
        </label>
        <label className="block">
          <span className="block text-sm font-semibold text-slate-800 mb-1.5">Confirm New Password</span>
          <div className="relative">
            <Lock size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="password"
              required
              className="auth-input"
              placeholder="Confirm new password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
        </label>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 rounded-xl text-sm font-semibold bg-auth-blue text-white hover:bg-auth-blueDark disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
        >
          {loading ? "Resetting…" : "Reset Password"}
          {!loading && <ArrowRight size={16} />}
        </button>
      </form>

      <Link to="/login" className="block text-center text-sm text-auth-blue hover:underline mt-8">
        ← Back to Sign In
      </Link>
    </AuthLayout>
  );
}
