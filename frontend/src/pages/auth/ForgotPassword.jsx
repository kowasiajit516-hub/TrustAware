import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthLayout from "../../components/AuthLayout.jsx";
import { forgotPassword } from "../../api/client.js";

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [devToken, setDevToken] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await forgotPassword({ email });
      if (res.dev_reset_token) {
        setDevToken(res.dev_reset_token);
      } else {
        setError("If that email is registered, a reset link would be sent.");
      }
    } catch (err) {
      setError(err.detail || err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout>
      <h1 className="text-xl font-bold text-slate-100 mb-1">Reset Password</h1>
      <p className="text-sm text-slate-500 mb-6">
        Enter your email address and we'll generate a reset link
      </p>

      {devToken ? (
        <div className="space-y-4">
          <div className="text-sm text-status-healthy bg-status-healthy/10 border border-status-healthy/30 rounded-lg px-3 py-3">
            A reset token was generated. This project has no email service
            configured yet, so for development the token is shown here
            directly instead of being emailed.
          </div>
          <div className="text-xs text-slate-400 bg-base-bg border border-base-border rounded-lg px-3 py-2 break-all font-mono">
            {devToken}
          </div>
          <button
            onClick={() => navigate(`/reset-password?token=${encodeURIComponent(devToken)}`)}
            className="w-full py-2.5 rounded-lg text-sm font-semibold bg-gradient-to-r from-accent-blue to-accent-purple text-white hover:opacity-90"
          >
            Continue to Reset Password
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="text-sm text-slate-300 bg-base-bg border border-base-border rounded-lg px-3 py-2">
              {error}
            </div>
          )}
          <label className="block">
            <span className="block text-xs font-medium text-slate-400 mb-1">Email Address</span>
            <input
              type="email"
              required
              className="input"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg text-sm font-semibold bg-gradient-to-r from-accent-blue to-accent-purple text-white hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Sending…" : "Send Reset Link"}
          </button>
        </form>
      )}

      <Link to="/login" className="block text-center text-xs text-accent-cyan hover:underline mt-6">
        ← Back to Sign In
      </Link>
    </AuthLayout>
  );
}
