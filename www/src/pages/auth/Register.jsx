import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthLayout from "../../components/AuthLayout.jsx";
import { useAuth } from "../../auth/AuthContext.jsx";
import { useGoogleSignIn } from "../../auth/useGoogleSignIn.js";
import { registerAccount, googleLogin } from "../../api/client.js";

export default function Register() {
  const navigate = useNavigate();
  const { applySession } = useAuth();
  const [form, setForm] = useState({ full_name: "", email: "", password: "", confirm: "" });
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleGoogleCredential(idToken) {
    setError(null);
    setGoogleLoading(true);
    try {
      const res = await googleLogin(idToken);
      applySession(res.access_token, res.user);
      navigate("/");
    } catch (err) {
      setError(err.detail || err.message);
    } finally {
      setGoogleLoading(false);
    }
  }

  const { promptSignIn, enabled: googleEnabled } = useGoogleSignIn(handleGoogleCredential);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (form.password !== form.confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (form.password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setLoading(true);
    try {
      const res = await registerAccount({
        full_name: form.full_name,
        email: form.email,
        password: form.password,
      });
      applySession(res.access_token, res.user);
      navigate("/");
    } catch (err) {
      setError(err.detail || err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout>
      <h1 className="text-xl font-bold text-slate-100 mb-1">Create Account</h1>
      <p className="text-sm text-slate-500 mb-6">Join to access your self-healing AIoT dashboard</p>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="text-sm text-status-faulty bg-status-faulty/10 border border-status-faulty/30 rounded-lg px-3 py-2">
            {error}
          </div>
        )}
        <label className="block">
          <span className="block text-xs font-medium text-slate-400 mb-1">Full Name</span>
          <input
            required
            className="input"
            placeholder="Enter your full name"
            value={form.full_name}
            onChange={(e) => set("full_name", e.target.value)}
          />
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-slate-400 mb-1">Email Address</span>
          <input
            type="email"
            required
            className="input"
            placeholder="Enter your email"
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
          />
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-slate-400 mb-1">Password</span>
          <input
            type="password"
            required
            minLength={8}
            className="input"
            placeholder="Create a password"
            value={form.password}
            onChange={(e) => set("password", e.target.value)}
          />
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-slate-400 mb-1">Confirm Password</span>
          <input
            type="password"
            required
            className="input"
            placeholder="Confirm your password"
            value={form.confirm}
            onChange={(e) => set("confirm", e.target.value)}
          />
        </label>

        <label className="flex items-start gap-2 text-xs text-slate-400">
          <input
            type="checkbox"
            required
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5 accent-accent-cyan"
          />
          I agree to the Terms of Service and Privacy Policy
        </label>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 rounded-lg text-sm font-semibold bg-gradient-to-r from-accent-blue to-accent-purple text-white hover:opacity-90 disabled:opacity-50"
        >
          {loading ? "Creating account…" : "Sign Up"}
        </button>
      </form>

      {googleEnabled ? (
        <>
          <div className="flex items-center gap-3 my-6">
            <div className="h-px flex-1 bg-slate-700/60" />
            <span className="text-xs text-slate-500">or continue with</span>
            <div className="h-px flex-1 bg-slate-700/60" />
          </div>
          <button
            type="button"
            onClick={promptSignIn}
            disabled={googleLoading}
            className="w-full py-2.5 rounded-lg text-sm font-semibold bg-white text-slate-800 hover:bg-slate-100 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
              <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.91c1.7-1.57 2.69-3.88 2.69-6.62z" />
              <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.81.54-1.84.86-3.05.86-2.34 0-4.33-1.58-5.04-3.71H.96v2.33A9 9 0 0 0 9 18z" />
              <path fill="#FBBC05" d="M3.96 10.71a5.4 5.4 0 0 1 0-3.42V4.96H.96a9 9 0 0 0 0 8.08l3-2.33z" />
              <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.96l3 2.33C4.67 5.16 6.66 3.58 9 3.58z" />
            </svg>
            {googleLoading ? "Signing in…" : "Continue with Google"}
          </button>
        </>
      ) : (
        <p className="text-center text-xs text-slate-600 mt-6">
          Google sign-in isn't configured on this server — use email &amp; password for now.
        </p>
      )}

      <p className="text-center text-xs text-slate-500 mt-6">
        Already have an account?{" "}
        <Link to="/login" className="text-accent-cyan hover:underline">
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
