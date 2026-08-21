import { useUserPagesFunction } from './functionPages/userPagesFunction';

export function UsersPages() {
  const {
    users,
    roles,
    form,
    loading,
    saving,
    error,
    isEditing,
    updateForm,
    loadPageData,
    handleEditUser,
    handleCancelEdit,
    handleSubmitUser,
  } = useUserPagesFunction();

  return (
    <div className="page">
      <div className="page-title-row">
        <div>
          <h2>Users</h2>
          <p>Manage system users and role assignment.</p>
        </div>

        <button className="secondary-button" onClick={loadPageData}>
          Refresh
        </button>
      </div>

      {error && <div className="error-box">{error}</div>}

      <form className="form-panel" onSubmit={handleSubmitUser}>
        <div className="form-grid">
          <div className="form-field">
            <label>Username</label>
            <input
              value={form.username}
              onChange={(event) => updateForm("username", event.target.value)}
              placeholder="Insert Username"
            />
          </div>

          <div className="form-field">
            <label>Password</label>
            <input
              type="password"
              value={form.password}
              onChange={(event) => updateForm("password", event.target.value)}
              placeholder={
                isEditing 
                ? "Leave blank to keep password" 
                : "Insert Password"
              }
            />
          </div>

          <div className="form-field">
            <label>Full Name</label>
            <input
              value={form.fullName}
              onChange={(event) => updateForm("fullName", event.target.value)}
              placeholder="Insert Full Name"
            />
          </div>

          <div className="form-field">
            <label>Email</label>
            <input
              value={form.email}
              onChange={(event) => updateForm("email", event.target.value)}
              placeholder="Insert Email"
            />
          </div>

          <div className="form-field">
            <label>Role</label>
            <select
              value={form.roleId}
              onChange={(event) => updateForm("roleId", event.target.value)}
            >
              <option value="">No role selected</option>

              {roles.map((role) => (
                <option 
                  key={role.id} 
                  value={role.id}
                >
                  {role.name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-field checkbox-field">
            <label>Status</label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(event) =>
                  updateForm("isActive", event.target.checked)
                }
              />
              Active
            </label>
          </div>
        </div>

        <div className="form-actions">
          <button className="primary-button" disabled={saving} type="submit">
            {saving
              ? "Saving..."
              : isEditing
              ? "Update User"
              : "Create User"}
          </button>

          {isEditing && (
            <button
              className="secondary-button"
              type="button"
              onClick={handleCancelEdit}
            >
              Cancel
            </button>
          )}
        </div>
      </form>

      <div className="table-panel">
        {loading ? (
          <p>Loading users...</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Username</th>
                <th>Full Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>

            <tbody>
              {users.length === 0 ? (
                <tr>
                  <td colSpan={7}>No users found.</td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.id}>
                    <td>{user.id}</td>
                    <td>{user.username}</td>
                    <td>{user.fullName}</td>
                    <td>{user.email || "-"}</td>
                    <td>{user.role?.name || "-"}</td>
                    <td>{user.isActive === false ? "Inactive" : "Active"}</td>
                    <td>
                      <button
                        className="table-button"
                        type="button"
                        onClick={() => handleEditUser(user)}
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}