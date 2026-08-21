import { useLocationPagesFunction } from "./functionPages/LocationPagesFunction";


export function LocationsPage() {
  const {
    locations,
    form,
    loading,
    saving,
    error,
    updateForm,
    loadLocations,
    handleCreateLocation,
  } = useLocationPagesFunction();

  return (
    <div className="page">
      <div className="page-title-row">
        <div>
          <h2>Locations</h2>
          <p>Manage physical locations for company assets.</p>
        </div>

        <button className="secondary-button" onClick={loadLocations}>
          Refresh
        </button>
      </div>

      {error && <div className="error-box">{error}</div>}

      <form className="form-panel" onSubmit={handleCreateLocation}>
        <div className="form-grid">
          <div className="form-field">
            <label>Location Code</label>
            <input
              value={form.locationCode}
              onChange={(event) =>
                updateForm("locationCode", event.target.value)
              }
              placeholder="Example: LOC-HQ-001"
            />
          </div>

          <div className="form-field">
            <label>Location Name</label>
            <input
              value={form.name}
              onChange={(event) => updateForm("name", event.target.value)}
              placeholder="Example: HQ Store Room"
            />
          </div>

          <div className="form-field">
            <label>Description</label>
            <input
              value={form.description}
              onChange={(event) =>
                updateForm("description", event.target.value)
              }
              placeholder="Optional"
            />
          </div>
        </div>

        <button className="primary-button" disabled={saving} type="submit">
          {saving ? "Saving..." : "Create Location"}
        </button>
      </form>

      <div className="table-panel">
        {loading ? (
          <p>Loading locations...</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Location Code</th>
                <th>Name</th>
                <th>Description</th>
                <th>Status</th>
              </tr>
            </thead>

            <tbody>
              {locations.length === 0 ? (
                <tr>
                  <td colSpan={5}>No locations found.</td>
                </tr>
              ) : (
                locations.map((location) => (
                  <tr key={location.id}>
                    <td>{location.id}</td>
                    <td>{location.locationCode}</td>
                    <td>{location.name}</td>
                    <td>{location.description || "-"}</td>
                    <td>
                      {location.isActive === false ? "Inactive" : "Active"}
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