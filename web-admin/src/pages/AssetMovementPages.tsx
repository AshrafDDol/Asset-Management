import { useEffect, useMemo, useState } from "react";
import { getAssetMovementsApi, type AssetMovement } from "../api/assetMovements.api";
import { chronological, type ListOrder } from "../utils/listOrder";

const errorMessage = (error: unknown) => (error as { response?: { data?: { message?: string } }; message?: string }).response?.data?.message || (error as { message?: string }).message || "Failed to load Asset Movement History.";
const friendly = (value: string) => value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const locationLabel = (location: AssetMovement["fromLocation"]) => location ? `${location.name} (${location.locationCode})` : "-";
const departmentLabel = (department: AssetMovement["fromDepartment"]) => department ? `${department.name} (${department.departmentCode})` : "-";
const movementJobNo = (movement: AssetMovement) => movement.issueBatchItem?.issueBatch.jobNo?.trim() || "";
const initialFilters = { asset: "", jobNo: "", fromLocation: "", toLocation: "", fromDepartment: "", toDepartment: "", type: "", performer: "", fromDate: "", toDate: "" };
const startOfDay = (value: string) => new Date(`${value}T00:00:00`).getTime();
const startOfNextDay = (value: string) => { const date = new Date(`${value}T00:00:00`); date.setDate(date.getDate() + 1); return date.getTime(); };

export function AssetMovementsPage() {
  const [movements, setMovements] = useState<AssetMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState(initialFilters);
  const [order, setOrder] = useState<ListOrder>("LATEST");
  const choices = useMemo(() => ({
    fromLocations: [...new Map(movements.flatMap((item) => item.fromLocation ? [[item.fromLocation.id, item.fromLocation] as const] : [])).values()],
    toLocations: [...new Map(movements.flatMap((item) => item.toLocation ? [[item.toLocation.id, item.toLocation] as const] : [])).values()],
    fromDepartments: [...new Map(movements.flatMap((item) => item.fromDepartment ? [[item.fromDepartment.id, item.fromDepartment] as const] : [])).values()],
    toDepartments: [...new Map(movements.flatMap((item) => item.toDepartment ? [[item.toDepartment.id, item.toDepartment] as const] : [])).values()],
    types: [...new Set(movements.map((item) => item.movementType))].sort(),
    performers: [...new Map(movements.map((item) => [item.movedByUser.id, item.movedByUser] as const)).values()],
  }), [movements]);
  const dateError = filters.fromDate && filters.toDate && filters.fromDate > filters.toDate ? "From Date cannot be later than To Date." : "";
  const visible = useMemo(() => chronological((dateError ? [] : movements.filter((movement) =>
    (!filters.asset || movement.asset.assetCode.toLowerCase().includes(filters.asset.toLowerCase())) &&
    (!filters.jobNo || movementJobNo(movement).toLowerCase().includes(filters.jobNo.trim().toLowerCase())) &&
    (!filters.fromLocation || String(movement.fromLocationId ?? "") === filters.fromLocation) &&
    (!filters.toLocation || String(movement.toLocationId ?? "") === filters.toLocation) &&
    (!filters.fromDepartment || String(movement.fromDepartmentId ?? "") === filters.fromDepartment) &&
    (!filters.toDepartment || String(movement.toDepartmentId ?? "") === filters.toDepartment) &&
    (!filters.type || movement.movementType === filters.type) &&
    (!filters.performer || String(movement.movedByUserId) === filters.performer) &&
    (!filters.fromDate || new Date(movement.movementDate).getTime() >= startOfDay(filters.fromDate)) &&
    (!filters.toDate || new Date(movement.movementDate).getTime() < startOfNextDay(filters.toDate))
  )), (movement) => movement.movementDate, order), [movements, filters, order, dateError]);

  async function loadMovements() {
    try {
      setLoading(true);
      setError("");
      const data = await getAssetMovementsApi();
      setMovements(Array.isArray(data) ? data : []);
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Existing admin pages use mount-time loading.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadMovements();
  }, []);

  return <div className="page">
    <div className="page-title-row">
      <div><h2>Asset Movement History</h2><p>Physical Asset movements recorded after successful verification.</p></div>
      <button className="secondary-button" type="button" onClick={loadMovements}>Refresh</button>
    </div>
    {error && <div className="error-box">{error}</div>}
    <div className="form-panel list-filter-panel"><strong>Search / Filters</strong><div className="form-grid">
      <label className="form-field">Asset Code<input value={filters.asset} onChange={(event) => setFilters({ ...filters, asset: event.target.value })} /></label>
      <label className="form-field">Job No.<input value={filters.jobNo} onChange={(event) => setFilters({ ...filters, jobNo: event.target.value })} /></label>
      <label className="form-field">From Date<input type="date" value={filters.fromDate} max={filters.toDate || undefined} onChange={(event) => setFilters({ ...filters, fromDate: event.target.value })} /></label>
      <label className="form-field">To Date<input type="date" value={filters.toDate} min={filters.fromDate || undefined} onChange={(event) => setFilters({ ...filters, toDate: event.target.value })} /></label>
      <label className="form-field">From Location<select value={filters.fromLocation} onChange={(event) => setFilters({ ...filters, fromLocation: event.target.value })}><option value="">All</option>{choices.fromLocations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="form-field">To Location<select value={filters.toLocation} onChange={(event) => setFilters({ ...filters, toLocation: event.target.value })}><option value="">All</option>{choices.toLocations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="form-field">From Department<select value={filters.fromDepartment} onChange={(event) => setFilters({ ...filters, fromDepartment: event.target.value })}><option value="">All</option>{choices.fromDepartments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="form-field">To Department<select value={filters.toDepartment} onChange={(event) => setFilters({ ...filters, toDepartment: event.target.value })}><option value="">All</option>{choices.toDepartments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="form-field">Movement Type<select value={filters.type} onChange={(event) => setFilters({ ...filters, type: event.target.value })}><option value="">All</option>{choices.types.map((type) => <option key={type} value={type}>{friendly(type)}</option>)}</select></label>
      <label className="form-field">Performed By<select value={filters.performer} onChange={(event) => setFilters({ ...filters, performer: event.target.value })}><option value="">All</option>{choices.performers.map((user) => <option key={user.id} value={user.id}>{user.fullName || user.username}</option>)}</select></label>
      <label className="form-field">Order<select value={order} onChange={(event) => setOrder(event.target.value as ListOrder)}><option value="LATEST">Latest</option><option value="OLDEST">Oldest</option></select></label>
    </div>{dateError && <div className="error-box">{dateError}</div>}<button className="secondary-button" onClick={() => { setFilters(initialFilters); setOrder("LATEST"); }}>Clear Filters</button></div>
    <div className="table-panel">
      {loading ? <p>Loading asset movement history...</p> : visible.length === 0 ? <p>No Asset movements match the current filters.</p> : <table className="data-table">
        <thead><tr><th>No.</th><th>Date / Time</th><th>Job No.</th><th>Asset Code</th><th>From Location</th><th>To Location</th><th>Movement Type</th><th>Reason</th><th>Performed By</th><th>From Department</th><th>To Department</th><th>Remarks</th></tr></thead>
        <tbody>{visible.map((movement, index) => <tr key={movement.id}>
          <td>{index + 1}</td>
          <td>{new Date(movement.movementDate).toLocaleString()}</td>
          <td>{movementJobNo(movement) || "—"}</td>
          <td>{movement.asset?.assetCode || movement.assetId}</td>
          <td>{locationLabel(movement.fromLocation)}</td>
          <td>{locationLabel(movement.toLocation)}</td>
          <td>{friendly(movement.movementType)}</td>
          <td>{movement.reason || "-"}</td>
          <td>{movement.movedByUser?.fullName || movement.movedByUser?.username || movement.movedByUserId}</td>
          <td>{departmentLabel(movement.fromDepartment)}</td>
          <td>{departmentLabel(movement.toDepartment)}</td>
          <td>{movement.remarks || "-"}</td>
        </tr>)}</tbody>
      </table>}
    </div>
  </div>;
}
