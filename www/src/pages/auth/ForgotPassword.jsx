import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Mail, ArrowRight, CheckCircle2 } from "lucide-react";
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
      <h1 className="text-3xl font-extrabold text-slate-900 mb-2">Reset Password</h1>
      <p className="text-sm text-slate-500 mb-8">
        Enter your email address and we'll generate a reset link
      </p>

      {devToken ? (
        <div className="space-y-5">
          <div className="flex items-start gap-3 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
            <CheckCircle2 size={18} className="shrink-0 mt-0.5" />
            <span>
              A reset token was generated. This project has no email service
              configured yet, so for development the token is shown here
              directly instead of being emailed.
            </span>
          </div>
          <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 break-all font-mono">
            {devToken}
          </div>
          <button
            onClick={() => navigate(`/reset-password?token=${encodeURIComponent(devToken)}`)}
            className="w-full py-3 rounded-xl text-sm font-semibold bg-auth-blue text-white hover:bg-auth-blueDark flex items-center justify-center gap-2 transition-colors"
          >
            Continue to Reset Password
            <ArrowRight size={16} />
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
              {error}
            </div>
          )}
          <label className="block">
            <span className="block text-sm font-semibold text-slate-800 mb-1.5">Email Address</span>
            <div className="relative">
              <Mail size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="email"
                required
                className="auth-input"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </label>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl text-sm font-semibold bg-auth-blue text-white hover:bg-auth-blueDark disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
          >
            {loading ? "Sending…" : "Send Reset Link"}
            {!loading && <ArrowRight size={16} />}
          </button>
        </form>
      )}

      <Link
        to="/login"
        className="block text-center text-sm text-auth-blue hover:underline mt-8"
      >
        ← Back to Sign In
      </Link>
    </AuthLayout>
  );
}
