import { useEffect, useState } from "react";
import { getAssetMovementsApi, type AssetMovement } from "../api/assetMovements.api";

const errorMessage = (error: unknown) => (error as { response?: { data?: { message?: string } }; message?: string }).response?.data?.message || (error as { message?: string }).message || "Failed to load Asset Movement History.";
const friendly = (value: string) => value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const locationLabel = (location: AssetMovement["fromLocation"]) => location ? `${location.name} (${location.locationCode})` : "-";
const departmentLabel = (department: AssetMovement["fromDepartment"]) => department ? `${department.name} (${department.departmentCode})` : "-";

export function AssetMovementsPage() {
  const [movements, setMovements] = useState<AssetMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
    <div className="table-panel">
      {loading ? <p>Loading asset movement history...</p> : movements.length === 0 ? <p>No asset movement history found.</p> : <table className="data-table">
        <thead><tr><th>Date / Time</th><th>Asset Code</th><th>From Location</th><th>To Location</th><th>Movement Type</th><th>Reason</th><th>Performed By</th><th>From Department</th><th>To Department</th><th>Remarks</th></tr></thead>
        <tbody>{movements.map((movement) => <tr key={movement.id}>
          <td>{new Date(movement.movementDate).toLocaleString()}</td>
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
