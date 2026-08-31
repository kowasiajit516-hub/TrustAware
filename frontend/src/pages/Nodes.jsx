import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import Topbar from "../components/Topbar.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import { usePolling } from "../hooks/usePolling.js";
import { listNodes, createNode, deleteNode } from "../api/client.js";

const EMPTY = { node_id: "", name: "", location: "", ip_address: "", enabled: true };

export default function Nodes() {
  const { data: nodes, reload } = usePolling(() => listNodes(), [], 8000);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(null);

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleCreate(e) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await createNode({ ...form, ip_address: form.ip_address || null });
      setForm(EMPTY);
      setShowForm(false);
      await reload();
    } catch (err) {
      setError(err.detail || err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(nodeId) {
    if (!confirm(`Delete node ${nodeId}?`)) return;
    setBusy(nodeId);
    try {
      await deleteNode(nodeId);
      await reload();
    } catch (err) {
      setError(err.detail || err.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <Topbar
        title="Nodes (ESP32)"
        subtitle="Physical devices hosting sensors/actuators. Real ESP32 comms ship in Phase 8 — this is CRUD only."
      />
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-500">
            {nodes ? `${nodes.length} node${nodes.length === 1 ? "" : "s"}` : "Loading…"}
          </p>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg bg-gradient-to-r from-accent-blue to-accent-purple text-white hover:opacity-90"
          >
            <Plus size={16} /> Add Node
          </button>
        </div>

        {error && (
          <div className="text-sm text-status-faulty bg-status-faulty/10 border border-status-faulty/30 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        {showForm && (
          <form onSubmit={handleCreate} className="card p-5 grid grid-cols-2 gap-4">
            <label className="block">
              <span className="block text-xs font-medium text-slate-400 mb-1">Node ID</span>
              <input className="input" value={form.node_id} onChange={(e) => set("node_id", e.target.value)} required />
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-slate-400 mb-1">Name</span>
              <input className="input" value={form.name} onChange={(e) => set("name", e.target.value)} required />
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-slate-400 mb-1">Location</span>
              <input className="input" value={form.location} onChange={(e) => set("location", e.target.value)} required />
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-slate-400 mb-1">IP Address (optional)</span>
              <input className="input" value={form.ip_address} onChange={(e) => set("ip_address", e.target.value)} placeholder="192.168.1.50" />
            </label>
            <div className="col-span-2 flex items-center gap-3">
              <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg text-sm font-medium bg-gradient-to-r from-accent-blue to-accent-purple text-white hover:opacity-90 disabled:opacity-50">
                {saving ? "Saving…" : "Add Node"}
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-slate-200">
                Cancel
              </button>
            </div>
          </form>
        )}

        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 text-xs border-b border-base-border bg-base-bg/40">
                <th className="py-3 px-4 font-medium">Node ID</th>
                <th className="py-3 px-4 font-medium">Name</th>
                <th className="py-3 px-4 font-medium">Location</th>
                <th className="py-3 px-4 font-medium">IP Address</th>
                <th className="py-3 px-4 font-medium">Status</th>
                <th className="py-3 px-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {!nodes && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">Loading…</td>
                </tr>
              )}
              {nodes && nodes.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-500">No nodes registered yet.</td>
                </tr>
              )}
              {nodes?.map((n) => (
                <tr key={n.node_id} className="border-b border-base-border/60 last:border-0 hover:bg-base-hover/50">
                  <td className="py-3 px-4 font-semibold text-slate-100">{n.node_id}</td>
                  <td className="py-3 px-4 text-slate-300">{n.name}</td>
                  <td className="py-3 px-4 text-slate-400">{n.location}</td>
                  <td className="py-3 px-4 text-slate-400">{n.ip_address || "—"}</td>
                  <td className="py-3 px-4">
                    <StatusBadge status={n.status} />
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button
                      disabled={busy === n.node_id}
                      onClick={() => handleDelete(n.node_id)}
                      className="p-1.5 rounded-md hover:bg-base-hover text-slate-400 hover:text-status-faulty disabled:opacity-40"
                    >
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
