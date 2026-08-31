import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthLayout from "../../components/AuthLayout.jsx";
import { useAuth } from "../../auth/AuthContext.jsx";
import { login as loginApi } from "../../api/client.js";

export default function Login() {
  const navigate = useNavigate();
  const { applySession } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await loginApi({ email, password });
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
      <h1 className="text-xl font-bold text-slate-100 mb-1">Welcome Back!</h1>
      <p className="text-sm text-slate-500 mb-6">
        Sign in to continue to your Self-Healing AIoT Dashboard
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="text-sm text-status-faulty bg-status-faulty/10 border border-status-faulty/30 rounded-lg px-3 py-2">
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
        <label className="block">
          <span className="block text-xs font-medium text-slate-400 mb-1">Password</span>
          <div className="relative">
            <input
              type={showPw ? "text" : "password"}
              required
              className="input pr-16"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 hover:text-slate-300"
            >
              {showPw ? "Hide" : "Show"}
            </button>
          </div>
        </label>

        <div className="flex items-center justify-end text-xs">
          <Link to="/forgot-password" className="text-accent-cyan hover:underline">
            Forgot password?
          </Link>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 rounded-lg text-sm font-semibold bg-gradient-to-r from-accent-blue to-accent-purple text-white hover:opacity-90 disabled:opacity-50"
        >
          {loading ? "Signing in…" : "Sign In"}
        </button>
      </form>

      <p className="text-center text-xs text-slate-500 mt-6">
        Don't have an account?{" "}
        <Link to="/register" className="text-accent-cyan hover:underline">
          Sign up
        </Link>
      </p>
    </AuthLayout>
  );
}
