import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { User, Mail, Lock, Eye, EyeOff } from "lucide-react";
import AuthLayout from "../../components/AuthLayout.jsx";
import { useAuth } from "../../auth/AuthContext.jsx";
import { useGoogleSignIn } from "../../auth/useGoogleSignIn.js";
import { GOOGLE_BLOCK_REASON, GOOGLE_BLOCK_MESSAGES } from "../../auth/googleOrigin.js";
import { registerAccount, googleLogin } from "../../api/client.js";

export default function Register() {
  const navigate = useNavigate();
  const { applySession } = useAuth();
  const [form, setForm] = useState({ full_name: "", email: "", password: "", confirm: "" });
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);

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

  // Google refuses IP addresses and plain-http names: explain instead of doing nothing.
  function handleGoogleClick() {
    if (GOOGLE_BLOCK_REASON) {
      setError(GOOGLE_BLOCK_MESSAGES[GOOGLE_BLOCK_REASON]);
      return;
    }
    promptSignIn();
  }

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

  const label = "block text-sm font-semibold text-slate-800 mb-1.5";
  const icon = "absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400";
  const eyeBtn = "absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600";

  return (
    <AuthLayout>
      <h1 className="text-3xl md:text-4xl font-extrabold text-slate-900 mb-2">Create Account</h1>
      <p className="text-sm text-slate-500 mb-8">Join to access your self-healing AIoT dashboard</p>

      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 break-words">
            {error}
          </div>
        )}

        <label className="block">
          <span className={label}>Full Name</span>
          <div className="relative">
            <User size={17} className={icon} />
            <input
              required
              autoComplete="name"
              className="auth-input"
              placeholder="Enter your full name"
              value={form.full_name}
              onChange={(e) => set("full_name", e.target.value)}
            />
          </div>
        </label>

        <label className="block">
          <span className={label}>Email Address</span>
          <div className="relative">
            <Mail size={17} className={icon} />
            <input
              type="email"
              required
              autoComplete="email"
              className="auth-input"
              placeholder="Enter your email"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
            />
          </div>
        </label>

        <label className="block">
          <span className={label}>Password</span>
          <div className="relative">
            <Lock size={17} className={icon} />
            <input
              type={showPw ? "text" : "password"}
              required
              minLength={8}
              autoComplete="new-password"
              className="auth-input pr-11"
              placeholder="Create a password"
              value={form.password}
              onChange={(e) => set("password", e.target.value)}
            />
            <button type="button" onClick={() => setShowPw((v) => !v)} className={eyeBtn} aria-label={showPw ? "Hide passwords" : "Show passwords"}>
              {showPw ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>
        </label>

        <label className="block">
          <span className={label}>Confirm Password</span>
          <div className="relative">
            <Lock size={17} className={icon} />
            <input
              type={showPw ? "text" : "password"}
              required
              autoComplete="new-password"
              className="auth-input pr-11"
              placeholder="Confirm your password"
              value={form.confirm}
              onChange={(e) => set("confirm", e.target.value)}
            />
          </div>
        </label>

        <label className="flex items-start gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            required
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-1 accent-auth-blue"
          />
          I agree to the Terms of Service and Privacy Policy
        </label>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 rounded-xl text-sm font-semibold bg-auth-blue text-white hover:bg-auth-blueDark disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
        >
          {loading ? "Creating account…" : "Sign Up"}
        </button>
      </form>

      {googleEnabled ? (
        <>
          <div className="flex items-center gap-3 my-6">
            <div className="h-px flex-1 bg-slate-200" />
            <span className="text-xs text-slate-500">or continue with</span>
            <div className="h-px flex-1 bg-slate-200" />
          </div>
          <button
            type="button"
            onClick={handleGoogleClick}
            disabled={googleLoading}
            className="w-full py-3 rounded-xl text-sm font-semibold bg-white text-slate-800 border border-slate-300 hover:bg-slate-50 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
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

      <p className="text-center text-sm text-slate-500 mt-8">
        Already have an account?{" "}
        <Link to="/login" className="text-auth-blue font-medium hover:underline">
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
