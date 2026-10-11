import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Mail, Lock, Eye, EyeOff, ArrowRight } from "lucide-react";
import AuthLayout from "../../components/AuthLayout.jsx";
import GoogleSignInButton from "../../components/GoogleSignInButton.jsx";
import { useAuth } from "../../auth/AuthContext.jsx";
import { login as loginApi, googleLogin } from "../../api/client.js";

export default function Login() {
  const navigate = useNavigate();
  const { applySession } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [googleNote, setGoogleNote] = useState(false);

  // Auto-dismiss the Google note after a few seconds so it never sits
  // permanently in the layout (Google OAuth isn't wired up on the
  // backend yet - this is an honest, temporary heads-up, not a fake
  // login flow).
  useEffect(() => {
    if (!googleNote) return;
    const id = setTimeout(() => setGoogleNote(false), 3200);
    return () => clearTimeout(id);
  }, [googleNote]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await loginApi({ email, password });
      applySession(res.access_token, res.user);
      navigate("/");
    } catch (err) {
      // 401 (bad credentials) always shows this exact message, regardless
      // of the backend's raw detail string.
      setError(err.status === 401 ? "Invalid email or password" : err.detail || err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleCredential(idToken) {
    setError(null);
    setLoading(true);
    try {
      const res = await googleLogin(idToken);
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
      <h1 className="text-3xl md:text-4xl font-extrabold text-slate-900 mb-2">Welcome Back!</h1>
      <p className="text-sm text-slate-500 mb-8">
        Sign in to continue to your
        <br />
        Self-Healing AIoT Dashboard
      </p>

      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
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
              autoComplete="email"
              className="auth-input"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
        </label>

        <label className="block">
          <span className="block text-sm font-semibold text-slate-800 mb-1.5">Password</span>
          <div className="relative">
            <Lock size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type={showPw ? "text" : "password"}
              required
              autoComplete="current-password"
              className="auth-input pr-11"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              {showPw ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>
        </label>

        <div className="flex items-center justify-end -mt-2">
          <Link to="/forgot-password" className="text-sm text-auth-blue hover:underline">
            Forgot password?
          </Link>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 rounded-xl text-sm font-semibold bg-auth-blue text-white hover:bg-auth-blueDark disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
        >
          {loading ? "Signing in…" : "Sign In"}
          {!loading && <ArrowRight size={16} />}
        </button>

        <div className="flex items-center gap-3 py-1">
          <div className="flex-1 h-px bg-slate-200" />
          <span className="text-xs text-slate-400">or continue with</span>
          <div className="flex-1 h-px bg-slate-200" />
        </div>

        <GoogleSignInButton
          onCredential={handleGoogleCredential}
          onUnavailableClick={() => setGoogleNote(true)}
        />
      </form>

      {/* Fixed toast - anchored to the viewport, not the button, so it
          can never overlap nearby content regardless of panel height.
          Auto-dismisses; doesn't fake a real Google login. */}
      {googleNote && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 max-w-[320px] text-center text-xs text-white bg-slate-800 rounded-lg px-4 py-2.5 shadow-xl z-50">
          Google sign-in isn't connected yet — please use email &amp; password.
        </div>
      )}

      <p className="text-center text-sm text-slate-500 mt-8">
        Don't have an account?{" "}
        <Link to="/register" className="text-auth-blue font-medium hover:underline">
          Sign up
        </Link>
      </p>
    </AuthLayout>
  );
}
