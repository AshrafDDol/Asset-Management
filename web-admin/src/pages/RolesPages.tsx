import { useMemo, useState } from "react";
import { ConfirmDeleteDialog, MasterDataModal } from "../components/MasterDataModal";
import { useRolesPagesFunction } from "./functionPages/RolesPagesFunction";
import { chronological, type ListOrder } from "../utils/listOrder";

export function RolesPages() {
  const { form, error, saving, isEditing, editingRoleId, loading, roles, updateForm, loadRoles, handleEditRole, handleSubmitRole, handleCancelEdit, handleDeleteRole } = useRolesPagesFunction();
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [filters, setFilters] = useState({ name: "", status: "" });
  const [order, setOrder] = useState<ListOrder>("LATEST");
  const editing = roles.find((role) => role.id === editingRoleId);
  const visible = useMemo(() => chronological(roles.filter((role) =>
    (!filters.name || role.name.toLowerCase().includes(filters.name.toLowerCase())) &&
    (!filters.status || String(role.isActive !== false) === filters.status)
  ), (role) => role.createdAt, order), [roles, filters, order]);
  const close = () => { handleCancelEdit(); setModalOpen(false); setConfirmingDelete(false); };

  return <div className="page">
    <div className="page-title-row"><div><h2>Roles</h2><p>Manage roles assigned to system Users.</p></div><div className="form-actions"><button className="primary-button" onClick={() => { handleCancelEdit(); setModalOpen(true); }}>+ Register Role</button><button className="secondary-button" onClick={loadRoles}>Refresh</button></div></div>
    {!modalOpen && error && <div className="error-box">{error}</div>}
    <div className="form-panel list-filter-panel"><strong>Search / Filters</strong><div className="form-grid"><label className="form-field">Role Name<input value={filters.name} onChange={(event) => setFilters({ ...filters, name: event.target.value })} /></label><label className="form-field">Active Status<select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}><option value="">All</option><option value="true">Active</option><option value="false">Inactive</option></select></label><label className="form-field">Order<select value={order} onChange={(event) => setOrder(event.target.value as ListOrder)}><option value="LATEST">Latest</option><option value="OLDEST">Oldest</option></select></label></div><button className="secondary-button" onClick={() => setFilters({ name: "", status: "" })}>Clear Filters</button></div>
    <div className="table-panel">{loading ? <p>Loading roles...</p> : <table className="data-table"><thead><tr><th>No.</th><th>Role</th><th>Description</th><th>Status</th><th>Action</th></tr></thead><tbody>
      {visible.length === 0 ? <tr><td colSpan={5}>No roles match the current filters.</td></tr> : visible.map((role, index) => <tr key={role.id}><td>{index + 1}</td><td>{role.name}</td><td>{role.description || "-"}</td><td>{role.isActive === false ? "Inactive" : "Active"}</td><td><button className="table-button" onClick={() => { handleEditRole(role); setModalOpen(true); }}>Edit</button></td></tr>)}
    </tbody></table>}</div>
    {modalOpen && <MasterDataModal title={isEditing ? "Edit Role" : "Register Role"} busy={saving} onClose={close}>
      {error && <div className="error-box">{error}</div>}
      <form className="form-panel" onSubmit={async (event) => { if (await handleSubmitRole(event)) close(); }}><div className="form-grid">
        <div className="form-field"><label>Role Name *</label><input value={form.name} onChange={(event) => updateForm("name", event.target.value)} /></div>
        <div className="form-field"><label>Description</label><input value={form.description} onChange={(event) => updateForm("description", event.target.value)} /></div>
        {isEditing && <div className="form-field checkbox-field"><label>Status</label><label className="checkbox-row"><input type="checkbox" checked={form.isActive} onChange={(event) => updateForm("isActive", event.target.checked)} />Active</label></div>}
      </div><div className="form-actions">{isEditing && <button type="button" className="danger-button" onClick={() => setConfirmingDelete(true)}>Delete Role</button>}<button type="button" className="secondary-button" onClick={close}>Cancel</button><button className="primary-button" disabled={saving} type="submit">{saving ? "Saving..." : isEditing ? "Save Changes" : "Register"}</button></div></form>
      {confirmingDelete && editing && <ConfirmDeleteDialog title="Delete Role?" recordLabel={`Role: ${editing.name}`} busy={saving} onCancel={() => setConfirmingDelete(false)} onConfirm={async () => { if (await handleDeleteRole()) close(); else setConfirmingDelete(false); }} />}
    </MasterDataModal>}
  </div>;
}
