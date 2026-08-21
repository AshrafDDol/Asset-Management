import { useRolesPagesFunction } from './functionPages/RolesPagesFunction';

export function RolesPages() {
  const {
    form,
    error,
    saving,
    isEditing,
    loading,
    roles,
    updateForm,
    loadRoles,
    handleEditRole,
    handleSubmitRole,
    handleCancelEdit,
  } = useRolesPagesFunction();

  return (
    <div className="page">
      <div className="page-title-row">
        <div>
          <h2>Roles</h2>
          <p>Manage roles for users</p>
        </div>

        <button className="secondary-button" onClick={loadRoles}>
          Refresh
        </button>
      </div>

      {error && <div className="error-box">{error}</div>}

      <form className="form-panel" onSubmit={handleSubmitRole}>
        <div className="form-grid">
          <div className="form-field">
            <label>Role Name</label>
            <input
              value={form.name}
              onChange={(event) =>
                updateForm("name", event.target.value)
              }
              placeholder="Enter role name"
            />
          </div>

          <div className="form-field">
            <label>Role Description</label>
            <input
              value={form.description}
              onChange={(event) =>
                updateForm("description", event.target.value)
              }
              placeholder="Enter role description"
            />
          </div>

          <div className=" form-field checkbox-field">
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
              ? "Update Role"
              : "Create Role"
            }
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
          <p>Loading roles...</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Role Name</th>
                <th>Description</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {roles.length === 0 ? (
                <tr>
                  <td colSpan={5}>No roles found.</td>
                </tr>
              ) : (
                roles.map((role) => (
                  <tr key={role.id}>
                    <td>{role.id}</td>
                    <td>{role.name}</td>
                    <td>{role.description}</td>
                    <td>{role.isActive ? "Active" : "Inactive"}</td>
                    <td>
                      <button
                        className="table-button"
                        type="button"
                        onClick={() => handleEditRole(role)}
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