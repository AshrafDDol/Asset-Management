import { useMemo, useState } from "react";
import type { Location } from "../api/locations.api";
import { ConfirmDeleteDialog, MasterDataModal } from "../components/MasterDataModal";
import { useLocationPagesFunction } from "./functionPages/LocationPagesFunction";
import { chronological, type ListOrder } from "../utils/listOrder";

type TreeRow = { location: Location; depth: number; hasChildren: boolean; isOpen: boolean; filterForced: boolean };
type LocationFilters = { name: string; type: string; code: string; department: string };

function locationTreeRows(locations: Location[], expanded: Set<number>, filters: LocationFilters, order: ListOrder): TreeRow[] {
  const byId = new Map(locations.map((location) => [location.id, location]));
  const children = new Map<number | null, Location[]>();
  locations.forEach((location) => {
    const parent = location.parentLocationId ?? null;
    children.set(parent, [...(children.get(parent) || []), location]);
  });
  children.forEach((items, parent) => children.set(parent, chronological(items, (location) => location.createdAt, order)));

  const name = filters.name.trim().toLowerCase();
  const code = filters.code.trim().toLowerCase();
  const filtering = !!(name || code || filters.type || filters.department);
  const included = new Set<number>();
  const forcedOpen = new Set<number>();
  if (filtering) {
    locations.filter((location) =>
      (!name || location.name.toLowerCase().includes(name)) &&
      (!code || location.locationCode.toLowerCase().includes(code)) &&
      (!filters.type || location.locationType === filters.type) &&
      (!filters.department || String(location.resolvedDepartment?.id ?? location.departmentId ?? "") === filters.department)
    ).forEach((match) => {
      const visited = new Set<number>();
      let current: Location | undefined = match;
      while (current && !visited.has(current.id)) {
        visited.add(current.id);
        included.add(current.id);
        const parent: Location | undefined = current.parentLocationId ? byId.get(current.parentLocationId) : undefined;
        if (parent) forcedOpen.add(parent.id);
        current = parent;
      }
    });
  }

  const rows: TreeRow[] = [];
  const visited = new Set<number>();
  const visit = (location: Location, depth: number) => {
    if (visited.has(location.id) || (filtering && !included.has(location.id))) return;
    visited.add(location.id);
    const nested = (children.get(location.id) || []).filter((child) => !filtering || included.has(child.id));
    const filterForced = forcedOpen.has(location.id);
    const isOpen = expanded.has(location.id) || filterForced;
    rows.push({ location, depth, hasChildren: nested.length > 0, isOpen, filterForced });
    if (isOpen) nested.forEach((child) => visit(child, depth + 1));
  };
  (children.get(null) || []).forEach((root) => visit(root, 0));
  return rows;
}

export function LocationsPage() {
  const { locations, departments, form, loading, saving, error, updateForm, loadLocations, handleCreateLocation, editingId, handleEditLocation, handleCancelEdit, handleDeleteLocation } = useLocationPagesFunction();
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set());
  const [filters, setFilters] = useState<LocationFilters>({ name: "", type: "", code: "", department: "" });
  const [order, setOrder] = useState<ListOrder>("LATEST");
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const treeRows = useMemo(() => locationTreeRows(locations, expanded, filters, order), [locations, expanded, filters, order]);
  const locationTypes = useMemo(() => [...new Set(locations.map((location) => location.locationType))].sort(), [locations]);
  const editing = locations.find((item) => item.id === editingId);
  const close = () => { handleCancelEdit(); setModalOpen(false); setConfirmingDelete(false); };
  const toggle = (id: number) => setExpanded((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const setFilter = (key: keyof LocationFilters, value: string) => setFilters((current) => ({ ...current, [key]: value }));

  return <div className="page">
    <div className="page-title-row"><div><h2>Locations</h2><p>Manage the physical Location hierarchy for company Assets.</p></div><div className="form-actions"><button className="primary-button" onClick={() => { handleCancelEdit(); setModalOpen(true); }}>+ Register Location</button><button className="secondary-button" onClick={loadLocations}>Refresh</button></div></div>
    {!modalOpen && error && <div className="error-box">{error}</div>}
    <div className="form-panel location-filter-panel"><strong>Location Search</strong><div className="form-grid">
      <label className="form-field">Location Name<input value={filters.name} onChange={(event) => setFilter("name", event.target.value)} placeholder="Search by name" /></label>
      <label className="form-field">Type<select value={filters.type} onChange={(event) => setFilter("type", event.target.value)}><option value="">All types</option>{locationTypes.map((type) => <option key={type} value={type}>{type.replaceAll("_", " ")}</option>)}</select></label>
      <label className="form-field">Code<input value={filters.code} onChange={(event) => setFilter("code", event.target.value)} placeholder="Search by code" /></label>
      <label className="form-field">Department<select value={filters.department} onChange={(event) => setFilter("department", event.target.value)}><option value="">All departments</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.departmentCode} — {department.name}</option>)}</select></label>
      <label className="form-field">Order<select value={order} onChange={(event) => setOrder(event.target.value as ListOrder)}><option value="LATEST">Latest</option><option value="OLDEST">Oldest</option></select></label>
    </div><div className="location-filter-summary"><span>{treeRows.length} visible row{treeRows.length === 1 ? "" : "s"}</span><button type="button" className="secondary-button" onClick={() => setFilters({ name: "", type: "", code: "", department: "" })}>Clear filters</button></div></div>
    <div className="table-panel">{loading ? <p>Loading locations...</p> : <table className="data-table"><thead><tr><th>No.</th><th>Location</th><th>Type</th><th>Code</th><th>Department</th><th>Active</th><th>Action</th></tr></thead><tbody>
      {treeRows.length === 0 ? <tr><td colSpan={7}>No locations match the current filters.</td></tr> : treeRows.map(({ location, depth, hasChildren, isOpen, filterForced }, index) => <tr key={location.id}>
        <td>{index + 1}</td>
        <td><div className="location-tree-cell" style={{ paddingLeft: `${depth * 24}px` }}>{hasChildren ? <button type="button" className="location-tree-toggle" disabled={filterForced} title={filterForced ? "Expanded to show a filter match" : undefined} aria-label={`${isOpen ? "Collapse" : "Expand"} ${location.name}`} aria-expanded={isOpen} onClick={() => toggle(location.id)}>{isOpen ? "−" : "+"}</button> : <span className="location-tree-spacer" />}<strong>{location.name}</strong>{depth === 0 && <span className="location-root-label">Root</span>}</div></td>
        <td>{location.locationType?.replaceAll("_", " ")}</td><td>{location.locationCode}</td><td>{location.department ? location.department.name : location.resolvedDepartment ? `${location.resolvedDepartment.name} (Inherited)` : "-"}</td><td>{location.isActive === false ? "Inactive" : "Active"}</td><td><button className="table-button" onClick={() => { handleEditLocation(location); setModalOpen(true); }}>Edit</button></td>
      </tr>)}
    </tbody></table>}</div>
    {modalOpen && <MasterDataModal title={editingId ? "Edit Location" : "Register Location"} busy={saving} onClose={close}>
      {error && <div className="error-box">{error}</div>}
      <form className="form-panel" onSubmit={async (event) => { if (await handleCreateLocation(event)) close(); }}><div className="form-grid">
        <div className="form-field"><label>Location Code *</label><input value={form.locationCode} onChange={(event) => updateForm("locationCode", event.target.value)} /></div>
        <div className="form-field"><label>Location Name *</label><input value={form.name} onChange={(event) => updateForm("name", event.target.value)} /></div>
        <div className="form-field"><label>Location Type</label><select value={form.locationType} onChange={(event) => updateForm("locationType", event.target.value)}>{["STORE", "WAREHOUSE", "RACK", "LEVEL", "BIN", "FILE", "PRODUCTION_AREA", "MACHINE_LOCATION", "OTHER"].map((type) => <option key={type} value={type}>{type.replaceAll("_", " ")}</option>)}</select></div>
        <div className="form-field"><label>Parent Location</label><select value={form.parentLocationId} onChange={(event) => updateForm("parentLocationId", event.target.value)}><option value="">Root location</option>{locations.filter((location) => location.id !== editingId && location.isActive !== false).map((location) => <option key={location.id} value={location.id}>{location.displayPath || location.name}</option>)}</select></div>
        <div className="form-field"><label>Department</label><select value={form.departmentId} onChange={(event) => updateForm("departmentId", event.target.value)}><option value="">Inherit from parent / None</option>{departments.filter((department) => department.isActive !== false).map((department) => <option key={department.id} value={department.id}>{department.departmentCode} — {department.name}</option>)}</select></div>
        <div className="form-field"><label>Description</label><input value={form.description} onChange={(event) => updateForm("description", event.target.value)} /></div>
        {editingId && <div className="form-field checkbox-field"><label>Status</label><label className="checkbox-row"><input type="checkbox" checked={form.isActive} onChange={(event) => updateForm("isActive", event.target.checked)} />Active</label></div>}
      </div><div className="form-actions">{editingId && <button type="button" className="danger-button" onClick={() => setConfirmingDelete(true)}>Delete Location</button>}<button type="button" className="secondary-button" onClick={close}>Cancel</button><button className="primary-button" disabled={saving} type="submit">{saving ? "Saving..." : editingId ? "Save Changes" : "Register"}</button></div></form>
      {confirmingDelete && editing && <ConfirmDeleteDialog title="Delete Location?" recordLabel={`${editing.locationCode} — ${editing.name}`} busy={saving} onCancel={() => setConfirmingDelete(false)} onConfirm={async () => { if (await handleDeleteLocation()) close(); else setConfirmingDelete(false); }} />}
    </MasterDataModal>}
  </div>;
}
