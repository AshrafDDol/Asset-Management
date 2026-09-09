import { useMemo, useState } from "react";
import { ConfirmDeleteDialog, MasterDataModal } from "../components/MasterDataModal";
import { useDepartmentPagesFunction } from "./functionPages/DepartmentPagesFunction";
import { chronological, type ListOrder } from "../utils/listOrder";

export function DepartmentsPages() {
  const { error, form, saving, loading, departments, editingId, updateForm, loadDepartments, handleSubmitDepartment, handleEditDepartment, handleCancelEdit, handleDeleteDepartment } = useDepartmentPagesFunction();
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [filters, setFilters] = useState({ name: "", code: "", status: "" });
  const [order, setOrder] = useState<ListOrder>("LATEST");
  const editing = departments.find((item) => item.id === editingId);
  const visible = useMemo(() => chronological(departments.filter((department) =>
    (!filters.name || department.name.toLowerCase().includes(filters.name.toLowerCase())) &&
    (!filters.code || department.departmentCode.toLowerCase().includes(filters.code.toLowerCase())) &&
    (!filters.status || String(department.isActive !== false) === filters.status)
  ), (department) => department.createdAt, order), [departments, filters, order]);
  const close = () => { handleCancelEdit(); setModalOpen(false); setConfirmingDelete(false); };

  return <div className="page">
    <div className="page-title-row"><div><h2>Departments</h2><p>Manage company departments for ownership.</p></div><div className="form-actions"><button className="primary-button" onClick={() => { handleCancelEdit(); setModalOpen(true); }}>+ Register Department</button><button className="secondary-button" onClick={loadDepartments}>Refresh</button></div></div>
    {!modalOpen && error && <div className="error-box">{error}</div>}
    <div className="form-panel list-filter-panel"><strong>Search / Filters</strong><div className="form-grid"><label className="form-field">Department Name<input value={filters.name} onChange={(event) => setFilters({ ...filters, name: event.target.value })} /></label><label className="form-field">Department Code<input value={filters.code} onChange={(event) => setFilters({ ...filters, code: event.target.value })} /></label><label className="form-field">Active Status<select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}><option value="">All</option><option value="true">Active</option><option value="false">Inactive</option></select></label><label className="form-field">Order<select value={order} onChange={(event) => setOrder(event.target.value as ListOrder)}><option value="LATEST">Latest</option><option value="OLDEST">Oldest</option></select></label></div><button className="secondary-button" onClick={() => setFilters({ name: "", code: "", status: "" })}>Clear Filters</button></div>
    <div className="table-panel">{loading ? <p>Loading...</p> : <table className="data-table"><thead><tr><th>No.</th><th>Department</th><th>Code</th><th>Active</th><th>Action</th></tr></thead><tbody>
      {visible.length === 0 ? <tr><td colSpan={5}>No departments match the current filters.</td></tr> : visible.map((department, index) => <tr key={department.id}><td>{index + 1}</td><td>{department.name}</td><td>{department.departmentCode}</td><td>{department.isActive === false ? "Inactive" : "Active"}</td><td><button className="table-button" onClick={() => { handleEditDepartment(department); setModalOpen(true); }}>Edit</button></td></tr>)}
    </tbody></table>}</div>
    {modalOpen && <MasterDataModal title={editingId ? "Edit Department" : "Register Department"} busy={saving} onClose={close}>
      {error && <div className="error-box">{error}</div>}
      <form className="form-panel" onSubmit={async (event) => { if (await handleSubmitDepartment(event)) close(); }}><div className="form-grid">
        <div className="form-field"><label>Department Code *</label><input value={form.departmentCode} onChange={(event) => updateForm("departmentCode", event.target.value)} /></div>
        <div className="form-field"><label>Department Name *</label><input value={form.name} onChange={(event) => updateForm("name", event.target.value)} /></div>
        <div className="form-field"><label>Description</label><input value={form.description} onChange={(event) => updateForm("description", event.target.value)} /></div>
        {editingId && <div className="form-field checkbox-field"><label>Status</label><label className="checkbox-row"><input type="checkbox" checked={form.isActive} onChange={(event) => updateForm("isActive", event.target.checked)} />Active</label></div>}
      </div><div className="form-actions">{editingId && <button type="button" className="danger-button" onClick={() => setConfirmingDelete(true)}>Delete Department</button>}<button type="button" className="secondary-button" onClick={close}>Cancel</button><button className="primary-button" disabled={saving} type="submit">{saving ? "Saving..." : editingId ? "Save Changes" : "Register"}</button></div></form>
      {confirmingDelete && editing && <ConfirmDeleteDialog title="Delete Department?" recordLabel={`${editing.departmentCode} — ${editing.name}`} busy={saving} onCancel={() => setConfirmingDelete(false)} onConfirm={async () => { if (await handleDeleteDepartment()) close(); else setConfirmingDelete(false); }} />}
    </MasterDataModal>}
  </div>;
}
