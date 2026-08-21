import { useDepartmentPagesFunction } from "./functionPages/DepartmentPagesFunction";

export function DepartmentsPages() {
  const {
    error,
    form,
    saving,
    loading,
    departments,
    updateForm,
    loadDepartments,
    handleCreateDepartment,
  } = useDepartmentPagesFunction();

  return (
    <div className="page">
      <div className="page-title-row">
        <div>
          <h2>Departments</h2>
          <p>Manage company departments for ownership</p>
        </div>

        <button className="secondary-button" onClick={loadDepartments}>
          Refresh
        </button>
      </div>

      {error && <div className="error-box">{error}</div>}

      <form className="form-panel" onSubmit={handleCreateDepartment}>
        <div className="form-grid">
          <div className="form-field">
            <label>Department Code</label>
            <input
              value={form.departmentCode}
              onChange={(event) => 
                updateForm("departmentCode", event.target.value)
              }
              placeholder="Enter department code"
            />
          </div>

          <div className="form-field">
            <label>Department Name</label>
            <input
              value={form.name}
              onChange={(event) =>
                updateForm("name", event.target.value)
              }
              placeholder="Enter department name"
            />
          </div>

          <div className="form-field">
            <label>Description</label>
            <input
              value={form.description}
              onChange={(event) =>
                updateForm("description", event.target.value)
              }
              placeholder="Enter department description"
            />
          </div>
        </div>

        <button className="primary-button" disabled={saving} type="submit">
          {saving ? "Saving..." : "Create Department"}
        </button>
      </form>

      <div className="table-panel">
        {loading ? (
          <p>Loading...</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Department Code</th>
                <th>Department Name</th>
                <th>Description</th>
                <th>Status</th>
              </tr>
            </thead>

            <tbody>
              {departments.length === 0 ? (
                <tr>
                  <td colSpan={5}>No departments available</td>
                </tr>
              ) : (
                departments.map((department) => (
                  <tr key={department.id}>
                    <td>{department.id}</td>
                    <td>{department.departmentCode}</td>
                    <td>{department.name}</td>
                    <td>{department.description || "N/A"}</td>
                    <td>{department.isActive ? "Active" : "Inactive"}</td>
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