import { useEffect, useState, type FormEvent } from "react";
import { getAssetCategoriesApi, type AssetCategory } from "../api/assetCategories.api";
import { createBladeSkuApi, getBladeSkusApi, updateBladeSkuApi, type BladeSku } from "../api/bladeSkus.api";

const emptyForm = { skuCode: "", name: "", categoryId: "", bladeType: "", specification: "", remarks: "", isActive: true };
const errorMessage = (error: unknown, fallback: string) => {
  const value = error as { response?: { data?: { message?: string } }; message?: string };
  return value.response?.data?.message || value.message || fallback;
};

export function BladeSkusPages() {
  const [items, setItems] = useState<BladeSku[]>([]);
  const [categories, setCategories] = useState<AssetCategory[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      setError("");
      const [skus, categoryData] = await Promise.all([getBladeSkusApi(), getAssetCategoriesApi()]);
      setItems(Array.isArray(skus) ? skus : []);
      setCategories(Array.isArray(categoryData) ? categoryData : []);
    } catch (error: unknown) { setError(errorMessage(error, "Failed to load Blade SKUs.")); }
  }
  useEffect(() => {
    // Existing pages use mount-time loading; this keeps the same application pattern.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, []);
  const update = (key: keyof typeof form, value: string | boolean) => setForm((old) => ({ ...old, [key]: value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!form.skuCode.trim() || !form.name.trim() || !form.categoryId) return setError("SKU code, name and category are required.");
    try {
      setSaving(true); setError("");
      const payload = { ...form, categoryId: Number(form.categoryId), bladeType: form.bladeType || undefined, specification: form.specification || undefined, remarks: form.remarks || undefined };
      if (editingId) await updateBladeSkuApi(editingId, payload); else await createBladeSkuApi(payload);
      setEditingId(null); setForm(emptyForm); await load();
    } catch (error: unknown) { setError(errorMessage(error, "Failed to save Blade SKU.")); }
    finally { setSaving(false); }
  }

  function edit(item: BladeSku) {
    setEditingId(item.id);
    setForm({ skuCode: item.skuCode, name: item.name, categoryId: String(item.categoryId), bladeType: item.bladeType || "", specification: item.specification || "", remarks: item.remarks || "", isActive: item.isActive });
  }

  return <div className="page">
    <div className="page-title-row"><div><h2>Blade SKUs</h2><p>Manage blade specifications used for physical asset registration.</p></div><button className="secondary-button" onClick={load}>Refresh</button></div>
    {error && <div className="error-box">{error}</div>}
    <form className="form-panel" onSubmit={submit}><div className="form-grid">
      <div className="form-field"><label>SKU Code</label><input value={form.skuCode} onChange={(e) => update("skuCode", e.target.value)} /></div>
      <div className="form-field"><label>Name</label><input value={form.name} onChange={(e) => update("name", e.target.value)} /></div>
      <div className="form-field"><label>Category</label><select value={form.categoryId} onChange={(e) => update("categoryId", e.target.value)}><option value="">Select category</option>{categories.filter((x) => x.isActive !== false).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
      <div className="form-field"><label>Blade Type</label><input value={form.bladeType} onChange={(e) => update("bladeType", e.target.value)} /></div>
      <div className="form-field"><label>Specification</label><input value={form.specification} onChange={(e) => update("specification", e.target.value)} /></div>
      <div className="form-field"><label>Remarks</label><input value={form.remarks} onChange={(e) => update("remarks", e.target.value)} /></div>
      {editingId && <div className="form-field checkbox-field"><label>Status</label><label className="checkbox-row"><input type="checkbox" checked={form.isActive} onChange={(e) => update("isActive", e.target.checked)} />Active</label></div>}
    </div><div className="form-actions"><button className="primary-button" disabled={saving}>{saving ? "Saving..." : editingId ? "Update SKU" : "Create SKU"}</button>{editingId && <button type="button" className="secondary-button" onClick={() => { setEditingId(null); setForm(emptyForm); }}>Cancel</button>}</div></form>
    <div className="table-panel"><table className="data-table"><thead><tr><th>SKU</th><th>Name</th><th>Category</th><th>Type</th><th>Specification</th><th>Status</th><th>Action</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td>{item.skuCode}</td><td>{item.name}</td><td>{item.category?.name || item.categoryId}</td><td>{item.bladeType || "-"}</td><td>{item.specification || "-"}</td><td>{item.isActive ? "Active" : "Inactive"}</td><td><button className="table-button" onClick={() => edit(item)}>Edit</button></td></tr>)}</tbody></table></div>
  </div>;
}
