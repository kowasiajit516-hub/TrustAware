import { useState } from "react";
import { Plus, Trash2, Pencil } from "lucide-react";
import Topbar from "../components/Topbar.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import { usePolling } from "../hooks/usePolling.js";
import { listNodes, createNode, updateNode, deleteNode } from "../api/client.js";

const EMPTY = { node_id: "", name: "", location: "", ip_address: "", enabled: true };

export default function Nodes() {
  const { data: nodes, reload } = usePolling(() => listNodes(), [], 8000);
  const [showForm, setShowForm] = useState(false);
  const [editingNodeId, setEditingNodeId] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(null);
  const isEdit = editingNodeId !== null;

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function openCreateForm() {
    setEditingNodeId(null);
    setForm(EMPTY);
    setError(null);
    setShowForm(true);
  }

  function openEditForm(node) {
    setEditingNodeId(node.node_id);
    setForm({
      node_id: node.node_id,
      name: node.name,
      location: node.location,
      ip_address: node.ip_address || "",
      enabled: node.enabled,
    });
    setError(null);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingNodeId(null);
    setForm(EMPTY);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      if (isEdit) {
        await updateNode(editingNodeId, {
          name: form.name,
          location: form.location,
          ip_address: form.ip_address || null,
          enabled: form.enabled,
        });
      } else {
        await createNode({ ...form, ip_address: form.ip_address || null });
      }
      closeForm();
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
          <p className="text-sm text-[#94A3B8]">
            {nodes ? `${nodes.length} node${nodes.length === 1 ? "" : "s"}` : "Loading…"}
          </p>
          <button
            onClick={openCreateForm}
            className="inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-2 rounded-lg bg-gradient-to-r from-accent-blue to-accent-purple text-white hover:opacity-90"
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
          <form onSubmit={handleSubmit} className="card p-5 grid grid-cols-2 gap-4">
            <label className="block">
              <span className="block text-xs font-medium text-[#94A3B8] mb-1">Node ID</span>
              <input
                className="input"
                value={form.node_id}
                disabled={isEdit}
                onChange={(e) => set("node_id", e.target.value)}
                required
              />
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-[#94A3B8] mb-1">Name</span>
              <input className="input" value={form.name} onChange={(e) => set("name", e.target.value)} required />
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-[#94A3B8] mb-1">Location</span>
              <input className="input" value={form.location} onChange={(e) => set("location", e.target.value)} required />
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-[#94A3B8] mb-1">IP Address (optional)</span>
              <input className="input" value={form.ip_address} onChange={(e) => set("ip_address", e.target.value)} placeholder="192.168.1.50" />
            </label>
            <label className="col-span-2 flex items-center gap-2 text-sm text-[#F8FAFC]">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(e) => set("enabled", e.target.checked)}
                className="accent-accent-cyan"
              />
              Enabled
            </label>
            <div className="col-span-2 flex items-center gap-3">
              <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg text-sm font-semibold bg-gradient-to-r from-accent-blue to-accent-purple text-white hover:opacity-90 disabled:opacity-50">
                {saving ? "Saving…" : isEdit ? "Save Changes" : "Add Node"}
              </button>
              <button type="button" onClick={closeForm} className="px-4 py-2 rounded-lg text-sm font-semibold text-[#94A3B8] hover:text-[#F8FAFC]">
                Cancel
              </button>
            </div>
          </form>
        )}

        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[#94A3B8] text-xs border-b border-base-border bg-base-bg/40">
                <th className="py-2 px-4 font-medium">Node ID</th>
                <th className="py-2 px-4 font-medium">Name</th>
                <th className="py-2 px-4 font-medium">Location</th>
                <th className="py-2 px-4 font-medium">IP Address</th>
                <th className="py-2 px-4 font-medium">Status</th>
                <th className="py-2 px-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {!nodes && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-[#94A3B8]">Loading…</td>
                </tr>
              )}
              {nodes && nodes.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-[#94A3B8]">No nodes registered yet.</td>
                </tr>
              )}
              {nodes?.map((n) => (
                <tr key={n.node_id} className="border-b border-base-border/60 last:border-0 hover:bg-base-hover/50">
                  <td className="py-2 px-4 font-semibold text-[#F8FAFC]">{n.node_id}</td>
                  <td className="py-2 px-4 text-[#F8FAFC]">{n.name}</td>
                  <td className="py-2 px-4 text-[#94A3B8]">{n.location}</td>
                  <td className="py-2 px-4 text-[#94A3B8]">{n.ip_address || "—"}</td>
                  <td className="py-2 px-4">
                    <StatusBadge status={n.status} />
                  </td>
                  <td className="py-2 px-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => openEditForm(n)}
                        className="p-1.5 rounded-md hover:bg-base-hover text-[#94A3B8] hover:text-accent-cyan"
                        title="Edit"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        disabled={busy === n.node_id}
                        onClick={() => handleDelete(n.node_id)}
                        className="p-1.5 rounded-md hover:bg-base-hover text-[#94A3B8] hover:text-status-faulty disabled:opacity-40"
                        title="Delete"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
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
