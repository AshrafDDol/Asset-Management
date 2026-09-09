import { useEffect, useState, type FormEvent } from "react";
import { useLocation } from "react-router-dom";
import {
  cancelBatchIssueApi,
  cancelIssueBatchApi,
  compareBatchScansApi,
  confirmBatchItemIssueApi,
  getIssueBatchesApi,
  returnScanApi,
  scanAllJobsApi,
  type IssueBatch,
  type IssueBatchItem,
  type ReturnScanResult,
  type ScanResult,
} from "../api/issueBatches.api";
import { chronological, type ListOrder } from "../utils/listOrder";

const errorText = (error: unknown) => (error as { response?: { data?: { message?: string } }; message?: string }).response?.data?.message || (error as { message?: string }).message || "Operation failed";
const measurement = (item: IssueBatchItem) => item.asset.measurementHeight == null || item.asset.measurementWidth == null ? "—" : `${item.asset.measurementHeight} × ${item.asset.measurementWidth} mm`;
const issueItems = (batch: IssueBatch) => batch.items.filter((item) => ["ISSUED", "CONFIRMED"].includes(item.status));
const scanResultLabel = (classification: string) => ({
  MATCHED_CONFIRMED: "Confirmed",
  EXPECTED_ALREADY_CONFIRMED: "Already Confirmed",
  UNEXPECTED_NOT_PREPARED: "Not Prepared",
  INVALID_OR_INACTIVE_EPC: "Invalid or Inactive EPC",
  DUPLICATE_SCAN: "Duplicate Scan",
}[classification] || classification.toLowerCase().replaceAll("_", " "));
const progressCounts = (batches: IssueBatch[]) => {
  const items = batches
    .filter((batch) => ["PREPARING", "PROCESSING"].includes(batch.status))
    .flatMap((batch) => batch.items);
  const prepared = items.filter((item) => item.status !== "CANCELLED");
  const successfullyIssued = prepared.filter((item) => ["CONFIRMED", "RETURNED"].includes(item.status));
  return {
    issue: { completed: successfullyIssued.length, total: prepared.length },
    returning: {
      completed: successfullyIssued.filter((item) => item.status === "RETURNED").length,
      total: successfullyIssued.length,
    },
  };
};

export function IssueBatchesPages() {
  const location = useLocation();
  const navigationMessage = (location.state as { message?: string } | null)?.message || "";
  const [tab, setTab] = useState<"ISSUE" | "RETURNING">("ISSUE");
  const [batches, setBatches] = useState<IssueBatch[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(navigationMessage);
  const [error, setError] = useState("");
  const [scanBatch, setScanBatch] = useState<IssueBatch | null>(null);
  const [scanItem, setScanItem] = useState<IssueBatchItem | null>(null);
  const [scanText, setScanText] = useState("");
  const [scanRemarks, setScanRemarks] = useState("");
  const [scanResults, setScanResults] = useState<ScanResult[]>([]);
  const [scanAllJobsOpen, setScanAllJobsOpen] = useState(false);
  const [allJobsScanText, setAllJobsScanText] = useState("");
  const [allJobsRemarks, setAllJobsRemarks] = useState("");
  const [allJobsResults, setAllJobsResults] = useState<ScanResult[]>([]);
  const [returnScanOpen, setReturnScanOpen] = useState(false);
  const [returnScanText, setReturnScanText] = useState("");
  const [returnRemarks, setReturnRemarks] = useState("");
  const [returnResults, setReturnResults] = useState<ReturnScanResult[]>([]);
  const [order, setOrder] = useState<ListOrder>("LATEST");

  async function refresh() { setBatches(await getIssueBatchesApi()); }
  useEffect(() => { void getIssueBatchesApi().then(setBatches).catch((caught) => setError(errorText(caught))); }, []);

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true); setError(""); setMessage("");
    try { await action(); await refresh(); setMessage(success); }
    catch (caught) { setError(errorText(caught)); }
    finally { setBusy(false); }
  }

  function openScan(batch: IssueBatch, item: IssueBatchItem | null = null) {
    setScanBatch(batch); setScanItem(item); setScanText(""); setScanRemarks(""); setScanResults([]);
  }

  async function submitScan(event: FormEvent) {
    event.preventDefault();
    if (!scanBatch) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const results = scanItem
        ? (await confirmBatchItemIssueApi(scanItem.id, scanText.trim(), scanRemarks), [{ epc: scanText.trim().toUpperCase(), classification: "MATCHED_CONFIRMED", assetId: scanItem.assetId, itemId: scanItem.id }])
        : (await compareBatchScansApi(scanBatch.id, scanText.split(/[\s,;]+/).filter(Boolean), scanRemarks)).results;
      setScanResults(results); await refresh();
      const confirmed = results.filter((item) => item.classification === "MATCHED_CONFIRMED").length;
      setMessage(`${confirmed} Asset${confirmed === 1 ? "" : "s"} confirmed. Unexpected EPCs made no changes.`);
    } catch (caught) { setError(errorText(caught)); }
    finally { setBusy(false); }
  }

  async function cancelBatch(batch: IssueBatch) {
    if (!window.confirm("Cancel all unconfirmed items in this batch? Confirmed Assets will remain IN_USE.")) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await cancelIssueBatchApi(batch.id); await refresh();
      setMessage(`${result.cancelledCount} unconfirmed item${result.cancelledCount === 1 ? "" : "s"} cancelled. ${result.confirmedCount} confirmed item${result.confirmedCount === 1 ? "" : "s"} remain active or returned.`);
    } catch (caught) { setError(errorText(caught)); }
    finally { setBusy(false); }
  }

  async function submitReturnScan(event: FormEvent) {
    event.preventDefault();
    const epcs = returnScanText.split(/[\s,;]+/).filter(Boolean);
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await returnScanApi(epcs, returnRemarks);
      setReturnResults(response.results); await refresh();
      const returned = response.results.filter((result) => result.classification === "RETURNED").length;
      setMessage(`${returned} Asset${returned === 1 ? "" : "s"} returned successfully. Each EPC was processed independently.`);
    } catch (caught) { setError(errorText(caught)); }
    finally { setBusy(false); }
  }

  async function submitAllJobsScan(event: FormEvent) {
    event.preventDefault();
    const epcs = allJobsScanText.split(/[\s,;]+/).filter(Boolean);
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await scanAllJobsApi(epcs, allJobsRemarks);
      setAllJobsResults(response.results); await refresh();
      const confirmed = response.results.filter((result) => result.classification === "MATCHED_CONFIRMED").length;
      setMessage(`${confirmed} Asset${confirmed === 1 ? "" : "s"} confirmed across active Jobs. Unexpected EPCs made no changes.`);
    } catch (caught) { setError(errorText(caught)); }
    finally { setBusy(false); }
  }

  const orderedBatches = chronological(batches, (batch) => batch.createdAt, order);
  const progress = progressCounts(orderedBatches);
  const activeIssueBatches = orderedBatches.filter((batch) => issueItems(batch).length > 0);
  const allJobsAwaitingCount = orderedBatches
    .filter((batch) => ["PREPARING", "PROCESSING"].includes(batch.status))
    .flatMap((batch) => batch.items)
    .filter((item) => item.status === "ISSUED" && item.asset.status === "PENDING_CONFIRMATION").length;
  const returningItems = orderedBatches.flatMap((batch) => batch.items.filter((item) => item.status === "CONFIRMED").map((item) => ({ batch, item })));

  return <div className="page issue-batch-workspace">
    <div className="page-title-row"><div><h2>Issue Batches</h2><p>Verify prepared Assets before physical issue and return.</p></div><div className="form-actions"><label className="compact-order-control">Order<select value={order} onChange={(event) => setOrder(event.target.value as ListOrder)}><option value="LATEST">Latest</option><option value="OLDEST">Oldest</option></select></label><button className="secondary-button" onClick={() => void refresh()}>Refresh</button></div></div>
    {error && <div className="error-box">{error}</div>}{message && <div className="success-box">{message}</div>}
    <div className="issue-tabs">
      <button className={tab === "ISSUE" ? "active" : ""} onClick={() => setTab("ISSUE")}>
        Issue &amp; Confirmation
        <span className="issue-tab-progress" title={`${progress.issue.completed} of ${progress.issue.total} Assets confirmed in active batches`}>{progress.issue.completed}/{progress.issue.total}</span>
      </button>
      <button className={tab === "RETURNING" ? "active" : ""} onClick={() => setTab("RETURNING")}>
        Returning
        <span className="issue-tab-progress" title={`${progress.returning.completed} of ${progress.returning.total} issued Assets returned in active batches`}>{progress.returning.completed}/{progress.returning.total}</span>
      </button>
    </div>

    {tab === "ISSUE" && <div className="issue-global-actions"><button className="primary-button" disabled={busy || allJobsAwaitingCount === 0} title={allJobsAwaitingCount === 0 ? "No Assets are awaiting EPC confirmation" : `Scan EPCs across ${allJobsAwaitingCount} awaiting Assets`} onClick={() => { setScanAllJobsOpen(true); setAllJobsScanText(""); setAllJobsRemarks(""); setAllJobsResults([]); }}>Scan All Jobs</button><span>{allJobsAwaitingCount} Awaiting EPC Confirmation</span></div>}
    {tab === "ISSUE" && (activeIssueBatches.length === 0 ? <div className="table-panel">No Assets are awaiting confirmation or currently in use.</div> : activeIssueBatches.map((batch) => {
      const items = issueItems(batch); const awaiting = items.filter((item) => item.status === "ISSUED"); const confirmed = items.filter((item) => item.status === "CONFIRMED");
      return <section className="issue-batch-card" key={batch.id}>
        <header className="issue-batch-header"><div><h3>{batch.batchNo}</h3>{batch.jobNo && <p>Job No: {batch.jobNo}</p>}<strong>{awaiting.length} Awaiting Confirmation</strong>{confirmed.length > 0 && <span> · {confirmed.length} In Use</span>}</div><div className="form-actions"><button className="primary-button" disabled={busy || awaiting.length === 0} onClick={() => openScan(batch)}>Scan All</button><button className="secondary-button" disabled={busy || awaiting.length === 0} onClick={() => void cancelBatch(batch)}>Cancel Batch</button></div></header>
        <div className="request-table-scroll"><table className="data-table"><thead><tr><th>Asset</th><th>Item / Category</th><th>Measurement</th><th>EPC</th><th>Recipient</th><th>To Location</th><th>State</th><th>Action</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td>{item.asset.assetCode}</td><td>{item.asset.itemName}<small>{item.asset.category?.name}</small></td><td>{measurement(item)}</td><td>{item.asset.epc?.epcCode || "Missing"}</td><td>{item.recipient?.fullName || item.recipient?.username || "—"}</td><td>{item.toLocation?.displayPath || item.toLocation?.name || "—"}</td><td>{item.status === "CONFIRMED" ? "In Use" : "Awaiting EPC Confirmation"}</td><td>{item.status === "ISSUED" ? <><button className="table-button" disabled={busy} onClick={() => openScan(batch, item)}>Confirm EPC</button><button className="table-button" disabled={busy} onClick={() => { if (window.confirm(`Cancel ${item.asset.assetCode}? The Asset will become AVAILABLE.`)) void run(() => cancelBatchIssueApi(item.id), "Unconfirmed item cancelled; Asset is AVAILABLE."); }}>Cancel</button></> : "—"}</td></tr>)}</tbody></table></div>
      </section>;
    }))}

    {tab === "RETURNING" && <section className="table-panel">
      <div className="page-title-row"><div><h3>Assets Currently In Use</h3><p>Scan returned EPCs from any Issue Batch. Verified Assets return directly to their registered home location.</p></div><button className="primary-button" onClick={() => { setReturnScanOpen(true); setReturnScanText(""); setReturnRemarks(""); setReturnResults([]); }}>Return Scan</button></div>
      <div className="request-table-scroll"><table className="data-table"><thead><tr><th>Batch / Job</th><th>Asset</th><th>Recipient</th><th>Current Location</th><th>Home Location</th><th>Issued Time</th><th>State</th></tr></thead><tbody>{returningItems.length === 0 ? <tr><td colSpan={7}>No confirmed Assets are currently in use.</td></tr> : returningItems.map(({ batch, item }) => <tr key={item.id}><td>{batch.batchNo}<small>{batch.jobNo || "No Job No."}</small></td><td>{item.asset.assetCode}<small>{item.asset.itemName}</small></td><td>{item.recipient?.fullName || item.recipient?.username || "—"}</td><td>{item.asset.locationPath || item.asset.location?.name || "—"}</td><td>{item.asset.homeLocation?.displayPath || item.asset.homeLocation?.name || "Unresolved"}</td><td>{item.assignment?.issuedAt ? new Date(item.assignment.issuedAt).toLocaleString() : "—"}</td><td>In Use</td></tr>)}</tbody></table></div>
    </section>}

    {scanBatch && <div className="modal-backdrop"><form className="modal-card" onSubmit={submitScan}><div className="page-title-row"><div><h3>{scanItem ? "Confirm EPC" : "Scan All"}</h3><p>{scanItem ? `${scanItem.asset.assetCode} · Expected EPC verification` : `${scanBatch.batchNo} · Compare pasted EPCs with expected Assets`}</p></div><button type="button" className="secondary-button" onClick={() => { setScanBatch(null); setScanItem(null); }}>Close</button></div><label className="form-field">{scanItem ? "Paste / Enter EPC" : "Paste EPCs"}{scanItem ? <input autoFocus required value={scanText} onChange={(event) => setScanText(event.target.value)} /> : <textarea autoFocus rows={6} required value={scanText} onChange={(event) => setScanText(event.target.value)} placeholder="One EPC per line, or comma-separated" />}</label><label className="form-field">Remarks<input value={scanRemarks} onChange={(event) => setScanRemarks(event.target.value)} /></label><button className="primary-button" disabled={busy}>{busy ? "Confirming..." : scanItem ? "Confirm EPC" : "Compare and Confirm Matches"}</button>{scanResults.length > 0 && <ul>{scanResults.map((result, index) => <li key={`${result.epc}-${index}`}><code>{result.epc || "(blank)"}</code> — {result.classification.toLowerCase().replaceAll("_", " ")}</li>)}</ul>}</form></div>}

    {returnScanOpen && <div className="modal-backdrop"><form className="modal-card return-scan-modal" onSubmit={submitReturnScan}><div className="page-title-row"><div><h3>Return Scan</h3><p>Paste EPCs from one or more Issue Batches. Each EPC is validated and returned independently.</p></div><button type="button" className="secondary-button" onClick={() => setReturnScanOpen(false)}>Close</button></div><label className="form-field">Paste / Enter EPCs<textarea autoFocus rows={7} required value={returnScanText} onChange={(event) => setReturnScanText(event.target.value)} placeholder="One EPC per line, or separated by commas" /></label><label className="form-field">Remarks (optional)<input value={returnRemarks} onChange={(event) => setReturnRemarks(event.target.value)} /></label><button className="primary-button" disabled={busy}>{busy ? "Processing..." : "Process Return Scan"}</button>{returnResults.length > 0 && <div className="request-table-scroll"><table className="data-table"><thead><tr><th>Asset</th><th>EPC</th><th>Previous Location</th><th>Home Location</th><th>Result</th></tr></thead><tbody>{returnResults.map((result, index) => <tr key={`${result.epc}-${index}`}><td>{result.assetCode || "—"}</td><td><code>{result.epc || "(blank)"}</code></td><td>{result.previousLocation || "—"}</td><td>{result.homeLocation || "—"}</td><td>{result.classification.toLowerCase().replaceAll("_", " ")}</td></tr>)}</tbody></table></div>}</form></div>}
    {scanAllJobsOpen && <div className="modal-backdrop"><form className="modal-card scan-all-jobs-modal" onSubmit={submitAllJobsScan}><div className="page-title-row"><div><h3>Scan All Jobs</h3><p>Paste EPCs from any active Issue Batch. Expected Assets are matched to their prepared Job.</p></div><button type="button" className="secondary-button" onClick={() => setScanAllJobsOpen(false)}>Close</button></div><label className="form-field">Paste / Enter EPCs<textarea autoFocus rows={7} required value={allJobsScanText} onChange={(event) => setAllJobsScanText(event.target.value)} placeholder="One EPC per line, or separated by commas" /></label><label className="form-field">Remarks (optional)<input value={allJobsRemarks} onChange={(event) => setAllJobsRemarks(event.target.value)} /></label><button className="primary-button" disabled={busy}>{busy ? "Confirming..." : "Compare and Confirm Across Jobs"}</button>{allJobsResults.length > 0 && <div className="request-table-scroll"><table className="data-table"><thead><tr><th>Asset</th><th>Batch / Job</th><th>EPC</th><th>To Location</th><th>Result</th></tr></thead><tbody>{allJobsResults.map((result, index) => <tr key={`${result.epc}-${index}`}><td>{result.assetCode || "—"}</td><td>{result.batchNo || "—"}<small>{result.jobNo || (result.batchNo ? "No Job No." : "")}</small></td><td><code>{result.epc || "(blank)"}</code></td><td>{result.toLocation || "—"}</td><td>{scanResultLabel(result.classification)}</td></tr>)}</tbody></table></div>}</form></div>}
  </div>;
}
