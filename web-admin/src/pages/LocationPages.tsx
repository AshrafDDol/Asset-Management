import { useLocationPagesFunction } from "./functionPages/LocationPagesFunction";
import { useMemo, useState } from "react";
import type { Location } from "../api/locations.api";

type TreeRow = { location: Location; depth: number; hasChildren: boolean };

function locationTreeRows(locations: Location[], collapsed: Set<number>): TreeRow[] {
  const ids = new Set(locations.map((location) => location.id));
  const children = new Map<number | null, Location[]>();
  for (const location of locations) {
    const parentId = location.parentLocationId && ids.has(location.parentLocationId) ? location.parentLocationId : null;
    children.set(parentId, [...(children.get(parentId) || []), location]);
  }
  children.forEach((items) => items.sort((a, b) => a.name.localeCompare(b.name)));
  const rows: TreeRow[] = [];
  const visited = new Set<number>();
  const visit = (location: Location, depth: number) => {
    if (visited.has(location.id)) return;
    visited.add(location.id);
    const childRows = children.get(location.id) || [];
    rows.push({ location, depth, hasChildren: childRows.length > 0 });
    if (!collapsed.has(location.id)) childRows.forEach((child) => visit(child, depth + 1));
  };
  (children.get(null) || []).forEach((root) => visit(root, 0));
  locations.filter((location) => !visited.has(location.id)).forEach((location) => visit(location, 0));
  return rows;
}

export function LocationsPage() {
  const {
    locations,
    departments,
    form,
    loading,
    saving,
    error,
    updateForm,
    loadLocations,
    handleCreateLocation,
    editingId,
    handleEditLocation,
    handleCancelEdit,
  } = useLocationPagesFunction();
  const [collapsed, setCollapsed] = useState<Set<number>>(() => new Set());
  const treeRows = useMemo(() => locationTreeRows(locations, collapsed), [locations, collapsed]);
  const toggle = (id: number) => setCollapsed((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

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
            <label>Location Type</label>
            <select value={form.locationType} onChange={(event) => updateForm("locationType", event.target.value)}>
              {["STORE", "WAREHOUSE", "RACK", "LEVEL", "BIN", "FILE", "PRODUCTION_AREA", "MACHINE_LOCATION", "OTHER"].map((type) => <option key={type} value={type}>{type.replaceAll("_", " ")}</option>)}
            </select>
          </div>

          <div className="form-field">
            <label>Parent Location</label>
            <select value={form.parentLocationId} onChange={(event) => updateForm("parentLocationId", event.target.value)}>
              <option value="">Root location</option>
              {locations.filter((location) => location.id !== editingId && location.isActive !== false).map((location) => <option key={location.id} value={location.id}>{location.displayPath || location.name}</option>)}
            </select>
          </div>

          <div className="form-field">
            <label>Department</label>
            <select value={form.departmentId} onChange={(event) => updateForm("departmentId", event.target.value)}>
              <option value="">Inherit from parent / None</option>
              {departments.filter((department) => department.isActive !== false).map((department) => <option key={department.id} value={department.id}>{department.departmentCode} — {department.name}</option>)}
            </select>
          </div>

          {editingId && <div className="form-field checkbox-field"><label>Status</label><label className="checkbox-row"><input type="checkbox" checked={form.isActive} onChange={(event) => updateForm("isActive", event.target.checked)} />Active</label></div>}

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

        <div className="form-actions"><button className="primary-button" disabled={saving} type="submit">{saving ? "Saving..." : editingId ? "Update Location" : "Create Location"}</button>{editingId && <button type="button" className="secondary-button" onClick={handleCancelEdit}>Cancel</button>}</div>
      </form>

      <div className="table-panel">
        {loading ? (
          <p>Loading locations...</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Location</th>
                <th>Type</th>
                <th>Code</th>
                <th>Department</th>
                <th>Active</th><th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {locations.length === 0 ? (
                <tr>
                  <td colSpan={6}>No locations found.</td>
                </tr>
              ) : (
                treeRows.map(({ location, depth, hasChildren }) => (
                  <tr key={location.id}>
                    <td><div style={{ paddingLeft: `${depth * 24}px`, display: "flex", alignItems: "center", gap: "6px" }}>
                      {hasChildren ? <button type="button" className="table-button" aria-label={`${collapsed.has(location.id) ? "Expand" : "Collapse"} ${location.name}`} onClick={() => toggle(location.id)}>{collapsed.has(location.id) ? "▸" : "▾"}</button> : <span style={{ width: "28px" }} />}
                      <strong>{location.name}</strong>{depth === 0 && <span> (Root)</span>}
                    </div></td>
                    <td>{location.locationType?.replaceAll("_", " ")}</td>
                    <td>{location.locationCode}</td>
                    <td>{location.department ? location.department.name : location.resolvedDepartment ? `${location.resolvedDepartment.name} (Inherited)` : "-"}</td>
                    <td>{location.isActive === false ? "Inactive" : "Active"}</td>
                    <td><button className="table-button" onClick={() => handleEditLocation(location)}>Edit</button></td>
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
