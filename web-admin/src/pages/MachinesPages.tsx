import { useEffect, useState, type FormEvent } from "react";
import { createMachineApi, getMachinesApi, updateMachineApi, type Machine } from "../api/machines.api";

const emptyForm = { machineCode: "", machineName: "", description: "", isActive: true };
const errorMessage = (error: unknown, fallback: string) => {
  const value = error as { response?: { data?: { message?: string } }; message?: string };
  return value.response?.data?.message || value.message || fallback;
};
export function MachinesPages() {
  const [items, setItems] = useState<Machine[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  async function load() { try { setError(""); const data = await getMachinesApi(); setItems(Array.isArray(data) ? data : []); } catch (error: unknown) { setError(errorMessage(error, "Failed to load machines.")); } }
  useEffect(() => {
    // Existing pages use mount-time loading; this keeps the same application pattern.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, []);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!form.machineCode.trim() || !form.machineName.trim()) return setError("Machine code and name are required.");
    try { setSaving(true); setError(""); if (editingId) await updateMachineApi(editingId, form); else await createMachineApi(form); setEditingId(null); setForm(emptyForm); await load(); }
    catch (error: unknown) { setError(errorMessage(error, "Failed to save machine.")); } finally { setSaving(false); }
  }
  function edit(item: Machine) { setEditingId(item.id); setForm({ machineCode: item.machineCode, machineName: item.machineName, description: item.description || "", isActive: item.isActive }); }
  return <div className="page"><div className="page-title-row"><div><h2>Machines</h2><p>Manage the minimal Production machine master.</p></div><button className="secondary-button" onClick={load}>Refresh</button></div>{error && <div className="error-box">{error}</div>}
    <form className="form-panel" onSubmit={submit}><div className="form-grid"><div className="form-field"><label>Machine Code</label><input value={form.machineCode} onChange={(e) => setForm({ ...form, machineCode: e.target.value })} /></div><div className="form-field"><label>Machine Name</label><input value={form.machineName} onChange={(e) => setForm({ ...form, machineName: e.target.value })} /></div><div className="form-field"><label>Description</label><input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>{editingId && <div className="form-field checkbox-field"><label>Status</label><label className="checkbox-row"><input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />Active</label></div>}</div><div className="form-actions"><button className="primary-button" disabled={saving}>{saving ? "Saving..." : editingId ? "Update Machine" : "Create Machine"}</button>{editingId && <button type="button" className="secondary-button" onClick={() => { setEditingId(null); setForm(emptyForm); }}>Cancel</button>}</div></form>
    <div className="table-panel"><table className="data-table"><thead><tr><th>Code</th><th>Name</th><th>Description</th><th>Status</th><th>Action</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td>{item.machineCode}</td><td>{item.machineName}</td><td>{item.description || "-"}</td><td>{item.isActive ? "Active" : "Inactive"}</td><td><button className="table-button" onClick={() => edit(item)}>Edit</button></td></tr>)}</tbody></table></div>
  </div>;
}
