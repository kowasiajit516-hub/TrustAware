import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthLayout from "../../components/AuthLayout.jsx";
import { useAuth } from "../../auth/AuthContext.jsx";
import { registerAccount } from "../../api/client.js";

export default function Register() {
  const navigate = useNavigate();
  const { applySession } = useAuth();
  const [form, setForm] = useState({ full_name: "", email: "", password: "", confirm: "" });
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
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

      <p className="text-center text-xs text-slate-500 mt-6">
        Already have an account?{" "}
        <Link to="/login" className="text-accent-cyan hover:underline">
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
