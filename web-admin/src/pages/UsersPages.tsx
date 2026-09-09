import { useMemo, useState } from "react";
import { ConfirmDeleteDialog, MasterDataModal } from "../components/MasterDataModal";
import { useUserPagesFunction } from "./functionPages/userPagesFunction";
import { chronological, type ListOrder } from "../utils/listOrder";

export function UsersPages() {
  const { users, roles, departments, form, loading, saving, error, isEditing, editingUserId, updateForm, loadPageData, handleEditUser, handleCancelEdit, handleSubmitUser, handleDeactivateUser } = useUserPagesFunction();
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [filters, setFilters] = useState({ search: "", role: "", department: "", status: "" });
  const [order, setOrder] = useState<ListOrder>("LATEST");
  const editing = users.find((user) => user.id === editingUserId);
  const visible = useMemo(() => {
    const search = filters.search.toLowerCase();
    return chronological(users.filter((user) =>
      (!search || [user.fullName, user.username, user.email].some((value) => value?.toLowerCase().includes(search))) &&
      (!filters.role || String(user.roleId ?? "") === filters.role) &&
      (!filters.department || String(user.departmentId ?? "") === filters.department) &&
      (!filters.status || String(user.isActive !== false) === filters.status)
    ), (user) => user.createdAt, order);
  }, [users, filters, order]);
  const close = () => { handleCancelEdit(); setModalOpen(false); setConfirmingDelete(false); };

  return <div className="page">
    <div className="page-title-row"><div><h2>Users</h2><p>Manage system Users and role assignments.</p></div><div className="form-actions"><button className="primary-button" onClick={() => { handleCancelEdit(); setModalOpen(true); }}>+ Register User</button><button className="secondary-button" onClick={loadPageData}>Refresh</button></div></div>
    {!modalOpen && error && <div className="error-box">{error}</div>}
    <div className="form-panel list-filter-panel"><strong>Search / Filters</strong><div className="form-grid"><label className="form-field">Name / Username / Email<input value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} /></label><label className="form-field">Role<select value={filters.role} onChange={(event) => setFilters({ ...filters, role: event.target.value })}><option value="">All roles</option>{roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></label><label className="form-field">Department<select value={filters.department} onChange={(event) => setFilters({ ...filters, department: event.target.value })}><option value="">All departments</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label><label className="form-field">Active Status<select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}><option value="">All</option><option value="true">Active</option><option value="false">Inactive</option></select></label><label className="form-field">Order<select value={order} onChange={(event) => setOrder(event.target.value as ListOrder)}><option value="LATEST">Latest</option><option value="OLDEST">Oldest</option></select></label></div><button className="secondary-button" onClick={() => setFilters({ search: "", role: "", department: "", status: "" })}>Clear Filters</button></div>
    <div className="table-panel">{loading ? <p>Loading users...</p> : <table className="data-table"><thead><tr><th>No.</th><th>Username</th><th>Full Name</th><th>Email</th><th>Role</th><th>Department</th><th>Status</th><th>Action</th></tr></thead><tbody>
      {visible.length === 0 ? <tr><td colSpan={8}>No Users match the current filters.</td></tr> : visible.map((user, index) => <tr key={user.id}><td>{index + 1}</td><td>{user.username}</td><td>{user.fullName}</td><td>{user.email || "-"}</td><td>{user.role?.name || "-"}</td><td>{user.department?.name || "-"}</td><td>{user.isActive === false ? "Inactive" : "Active"}</td><td><button className="table-button" onClick={() => { handleEditUser(user); setModalOpen(true); }}>Edit</button></td></tr>)}
    </tbody></table>}</div>
    {modalOpen && <MasterDataModal title={isEditing ? "Edit User" : "Register User"} busy={saving} onClose={close}>
      {error && <div className="error-box">{error}</div>}
      <form className="form-panel" onSubmit={async (event) => { if (await handleSubmitUser(event)) close(); }}><div className="form-grid">
        <div className="form-field"><label>Username *</label><input value={form.username} onChange={(event) => updateForm("username", event.target.value)} /></div>
        <div className="form-field"><label>Password{isEditing ? "" : " *"}</label><input type="password" value={form.password} onChange={(event) => updateForm("password", event.target.value)} placeholder={isEditing ? "Leave blank to keep password" : "Enter password"} /></div>
        <div className="form-field"><label>Full Name *</label><input value={form.fullName} onChange={(event) => updateForm("fullName", event.target.value)} /></div>
        <div className="form-field"><label>Email *</label><input type="email" value={form.email} onChange={(event) => updateForm("email", event.target.value)} /></div>
        <div className="form-field"><label>Role *</label><select value={form.roleId} onChange={(event) => updateForm("roleId", event.target.value)}><option value="">Select role</option>{roles.filter((role) => role.isActive !== false || String(role.id) === form.roleId).map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></div>
        <div className="form-field"><label>Department</label><select value={form.departmentId} onChange={(event) => updateForm("departmentId", event.target.value)}><option value="">No department</option>{departments.filter((department) => department.isActive !== false || String(department.id) === form.departmentId).map((department) => <option key={department.id} value={department.id}>{department.departmentCode} — {department.name}</option>)}</select></div>
        <div className="form-field checkbox-field"><label>Status</label><label className="checkbox-row"><input type="checkbox" checked={form.isActive} onChange={(event) => updateForm("isActive", event.target.checked)} />Active</label></div>
      </div><div className="form-actions">{isEditing && <button type="button" className="danger-button" onClick={() => setConfirmingDelete(true)}>Deactivate User</button>}<button type="button" className="secondary-button" onClick={close}>Cancel</button><button className="primary-button" disabled={saving} type="submit">{saving ? "Saving..." : isEditing ? "Save Changes" : "Register"}</button></div></form>
      {confirmingDelete && editing && <ConfirmDeleteDialog title="Deactivate User?" recordLabel={`Username: ${editing.username}`} actionLabel="Deactivate" message="The User will be unable to sign in, while operational audit history remains intact." busy={saving} onCancel={() => setConfirmingDelete(false)} onConfirm={async () => { if (await handleDeactivateUser()) close(); else setConfirmingDelete(false); }} />}
    </MasterDataModal>}
  </div>;
}
