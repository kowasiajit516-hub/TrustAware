import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
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
    strength === "Strong" ? "bg-status-healthy" : strength === "Medium" ? "bg-status-recovering" : "bg-status-faulty";
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
          <div className="w-14 h-14 rounded-full bg-status-healthy/10 border border-status-healthy/30 flex items-center justify-center mx-auto mb-4 text-status-healthy text-2xl">
            ✓
          </div>
          <h1 className="text-xl font-bold text-slate-100 mb-1">Password Reset</h1>
          <p className="text-sm text-slate-500 mb-6">
            Your password has been changed successfully. You can sign in now.
          </p>
          <button
            onClick={() => navigate("/login")}
            className="w-full py-2.5 rounded-lg text-sm font-semibold bg-gradient-to-r from-accent-blue to-accent-purple text-white hover:opacity-90"
          >
            Go to Sign In
          </button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <h1 className="text-xl font-bold text-slate-100 mb-1">Create New Password</h1>
      <p className="text-sm text-slate-500 mb-6">Please enter your new password below.</p>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="text-sm text-status-faulty bg-status-faulty/10 border border-status-faulty/30 rounded-lg px-3 py-2">
            {error}
          </div>
        )}
        <label className="block">
          <span className="block text-xs font-medium text-slate-400 mb-1">Reset Token</span>
          <input
            required
            className="input font-mono text-xs"
            placeholder="Paste the token from the previous step"
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-slate-400 mb-1">New Password</span>
          <input
            type="password"
            required
            minLength={8}
            className="input"
            placeholder="Enter new password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {password && (
            <div className="mt-1.5">
              <div className="h-1 rounded-full bg-base-border overflow-hidden">
                <div className={`h-full rounded-full ${strengthColor}`} style={{ width: strengthWidth }} />
              </div>
              <span className="text-[10px] text-slate-500">Password strength: {strength}</span>
            </div>
          )}
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-slate-400 mb-1">Confirm New Password</span>
          <input
            type="password"
            required
            className="input"
            placeholder="Confirm new password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </label>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 rounded-lg text-sm font-semibold bg-gradient-to-r from-accent-blue to-accent-purple text-white hover:opacity-90 disabled:opacity-50"
        >
          {loading ? "Resetting…" : "Reset Password"}
        </button>
      </form>

      <Link to="/login" className="block text-center text-xs text-accent-cyan hover:underline mt-6">
        ← Back to Sign In
      </Link>
    </AuthLayout>
  );
}
