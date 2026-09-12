import { useEffect, useRef, useState, type FormEvent } from 'react';
import { assignOrReplaceAssetEpcApi, type Asset } from '../api/assets.api';
import { addAssetsToIssueBatchApi, createIssueBatchApi, getIssueBatchesApi, swapIssueBatchAssetApi, type IssueBatch, type IssueBatchItem } from '../api/issueBatches.api';
import { getUsersApi, type User } from '../api/users.api';
import type { Location } from '../api/locations.api';
import { useAssetsPagesFunction } from './functionPages/AssetsPagesFunction';
import { useNavigate } from 'react-router-dom';
import { ConfirmDeleteDialog } from '../components/MasterDataModal';
import { LocationTreeSelect } from '../components/LocationTreeSelect';
import { chronological, type ListOrder } from '../utils/listOrder';
import { locationDisplayName } from '../utils/locationDisplay';
import { AssetColumnSelector } from '../components/AssetColumnSelector';
import { AssetDetailsModal } from '../components/AssetDetailsModal';
import { displayValue, formatBladeDetails, formatGap, formatMeasurement, formatPurchaseDate, formatRadius } from '../utils/assetDisplay';
import { ASSET_COLUMN_OPTIONS, DEFAULT_ASSET_COLUMNS, normalizeAssetColumns, type AssetColumnId } from '../utils/assetColumns';

const hasActiveEpc = (asset: Asset) => !!asset.epc?.isActive && asset.epc.status === "ACTIVE";
const epcMutable = (asset: Asset) => asset.isActive !== false && ["AVAILABLE", "RESERVED"].includes(asset.status || "");
const apiError = (error: unknown) => (error as { response?: { data?: { message?: string } }; message?: string }).response?.data?.message || (error as { message?: string }).message || "Failed to save EPC.";
const operational = (location: Location) => !!location.isActive && ["PRODUCTION_AREA", "MACHINE_LOCATION"].includes(location.locationType);
const storageLocation = (location: Location) => !!location.isActive && ["STORE", "WAREHOUSE", "RACK", "LEVEL", "BIN", "FILE"].includes(location.locationType);
const ASSET_COLUMNS_KEY = "ims-assets-table-columns";
const assetColumnLabel = new Map(ASSET_COLUMN_OPTIONS.map((option) => [option.id, option.label]));
const activeBatch = (batch: IssueBatch) => ["PREPARING", "PROCESSING"].includes(batch.status);
const normalizedJob = (value?: string | null) => value?.trim().toLowerCase() || "";
const batchCounts = (batch: IssueBatch) => ({ awaiting: batch.items.filter((item) => item.status === "ISSUED").length, inUse: batch.items.filter((item) => item.status === "CONFIRMED").length, returned: batch.items.filter((item) => item.status === "RETURNED").length });
const batchState = (batch: IssueBatch) => { const counts = batchCounts(batch); if (batch.status === "COMPLETED") return "Completed"; if (batch.status === "CANCELLED") return "Cancelled"; if (counts.returned && counts.inUse) return "Partially Returned"; if (counts.awaiting) return "Awaiting Confirmation"; if (counts.inUse) return "In Use"; return "Preparing"; };
const eligibility = (asset: Asset) => {
  if (asset.isActive === false) return "Asset is inactive";
  if (asset.status !== "AVAILABLE") return `Status is ${asset.status}`;
  if (!hasActiveEpc(asset)) return "Active EPC is missing";
  if (!asset.homeLocationId || !asset.homeLocation?.isActive) return "Active home location is unresolved";
  return "";
};

function PrepareIssueDialog({ assets, locations, close, complete }: { assets: Asset[]; locations: Location[]; close: () => void; complete: (count: number, message?: string) => Promise<void> }) {
  const ref = useRef<HTMLDialogElement>(null); const [users, setUsers] = useState<User[]>([]); const [batches, setBatches] = useState<IssueBatch[]>([]); const [jobNo, setJobNo] = useState(""); const [selectedBatchId, setSelectedBatchId] = useState<number | null>(null); const [remarks, setRemarks] = useState("");
  const [recipient, setRecipient] = useState(""); const [destination, setDestination] = useState(""); const [rows, setRows] = useState<Record<number, { recipient: string; destination: string }>>({}); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const [swapOpen, setSwapOpen] = useState(false); const [swapTarget, setSwapTarget] = useState<IssueBatchItem | null>(null); const [swapEpc, setSwapEpc] = useState(""); const [swapRemarks, setSwapRemarks] = useState("");
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); void Promise.all([getUsersApi(), getIssueBatchesApi()]).then(([loadedUsers, loadedBatches]) => { setUsers(loadedUsers); setBatches(loadedBatches); }).catch((caught) => setError(apiError(caught))); return () => dialog?.close(); }, []);
  const apply = (field: "recipient" | "destination", value: string) => { if (field === "recipient") setRecipient(value); else setDestination(value); setRows(Object.fromEntries(assets.map((asset) => [asset.id, { recipient: field === "recipient" ? value : rows[asset.id]?.recipient || recipient, destination: field === "destination" ? value : rows[asset.id]?.destination || destination }]))); };
  const jobMatches = jobNo.trim() ? batches.filter((batch) => normalizedJob(batch.jobNo).includes(normalizedJob(jobNo))) : [];
  const exactMatches = batches.filter((batch) => normalizedJob(batch.jobNo) === normalizedJob(jobNo) && normalizedJob(jobNo));
  const selectedBatch = batches.find((batch) => batch.id === selectedBatchId) || null;
  const isAmbiguous = (batch: IssueBatch) => batches.filter((candidate) => activeBatch(candidate) && normalizedJob(candidate.jobNo) === normalizedJob(batch.jobNo)).length > 1;
  const swapCandidates = selectedBatch?.items.filter((item) => (item.status === "ISSUED" && item.asset.status === "PENDING_CONFIRMATION") || (item.status === "CONFIRMED" && item.asset.status === "IN_USE")) || [];
  async function performSwap(target: IssueBatchItem) { if (!selectedBatch || assets.length !== 1) return; setBusy(true); setError(""); try { await swapIssueBatchAssetApi(selectedBatch.id, { replacementAssetId: assets[0].id, targetItemId: target.id, epc: target.status === "CONFIRMED" ? swapEpc.trim() : undefined, remarks: swapRemarks || undefined }); await complete(1, `${target.asset.assetCode} replaced by ${assets[0].assetCode}.`); } catch (caught) { setError(apiError(caught)); setSwapOpen(false); setSwapTarget(null); } finally { setBusy(false); } }
  async function submit(event: FormEvent) { event.preventDefault(); const normalizedJobNo = jobNo.trim(); if (!normalizedJobNo) { setError("Job No. is required."); return; } if (!selectedBatch && exactMatches.length) { setError(exactMatches.filter(activeBatch).length > 1 ? `Job No. "${normalizedJobNo}" has multiple active Issue Batches and must be resolved before Assets can be added.` : activeBatch(exactMatches[0]) ? "Select the existing Job to add Assets." : exactMatches[0].status === "COMPLETED" ? `${exactMatches[0].jobNo} is already completed.` : `${exactMatches[0].jobNo} was cancelled.`); return; } setBusy(true); setError(""); try { const items = assets.map((asset) => ({ assetId: asset.id, recipientUserId: Number(rows[asset.id]?.recipient || recipient) || undefined, toLocationId: Number(rows[asset.id]?.destination || destination) || undefined })); const payload = { assetIds: assets.map((asset) => asset.id), jobNo: normalizedJobNo, defaultRecipientUserId: Number(recipient) || undefined, defaultToLocationId: Number(destination) || undefined, remarks: remarks || undefined, items }; if (selectedBatch) await addAssetsToIssueBatchApi(selectedBatch.id, payload); else await createIssueBatchApi(payload); await complete(assets.length); } catch (caught) { setError(apiError(caught)); } finally { setBusy(false); } }
  return <dialog ref={ref} className="asset-prepare-dialog" onCancel={(e) => { e.preventDefault(); if (!busy) close(); }}><div className="page-title-row"><div><h3>Prepare Issue Batch</h3><p>{assets.length} exact physical Assets selected</p></div><button className="secondary-button" onClick={close}>Close</button></div>{error && <div className="error-box">{error}</div>}<form onSubmit={submit}>
    <div className="form-grid"><label className="form-field job-combobox">Job No. *<input required role="combobox" aria-expanded={!selectedBatch && jobMatches.length > 0} value={jobNo} onChange={(e) => { setJobNo(e.target.value); setSelectedBatchId(null); setError(""); }} />{!selectedBatch && jobNo.trim() && (jobMatches.length ? <div className="job-combobox-results">{jobMatches.map((batch) => { const counts = batchCounts(batch); const ambiguous = isAmbiguous(batch); return <button type="button" key={batch.id} disabled={!activeBatch(batch) || ambiguous} onClick={() => { setSelectedBatchId(batch.id); setJobNo(batch.jobNo || ""); setError(""); }}><strong>{batch.jobNo}</strong><span>{batchState(batch)} · {batch.batchNo}</span><small>{counts.awaiting} Awaiting · {counts.inUse} In Use · {counts.returned} Returned · {new Date(batch.createdAt).toLocaleDateString()}{ambiguous ? " · Multiple active batches" : ""}</small></button>; })}</div> : <span className="job-new-hint">No existing Job found. A new Job will be created.</span>)}</label><label className="form-field">Apply Recipient to all<select value={recipient} onChange={(e) => apply("recipient", e.target.value)}><option value="">Not set</option>{users.filter((u) => u.isActive !== false).map((u) => <option key={u.id} value={u.id}>{u.fullName || u.username}</option>)}</select></label><label className="form-field">Apply To Location to all<LocationTreeSelect locations={locations} selectedLocationId={destination} onChange={(id) => apply("destination", String(id))} allowedLocation={operational} placeholder="Not set" /></label><label className="form-field">Remarks<input value={remarks} onChange={(e) => setRemarks(e.target.value)} /></label></div>
    {selectedBatch && <div className="job-selected-summary"><strong>Existing Job · {selectedBatch.jobNo}</strong><span>Issue Batch: {selectedBatch.batchNo} · Status: {batchState(selectedBatch)}</span><span>Awaiting Confirmation: {batchCounts(selectedBatch).awaiting} · In Use: {batchCounts(selectedBatch).inUse} · Returned: {batchCounts(selectedBatch).returned}</span></div>}
    <div className="table-panel"><table className="data-table"><thead><tr><th>Asset</th><th>Item / Category</th><th>Measurement</th><th>EPC</th><th>Current Location</th><th>Recipient</th><th>To Location</th><th>State</th></tr></thead><tbody>{assets.map((asset) => <tr key={asset.id}><td>{asset.assetCode}</td><td>{asset.itemName}<small>{asset.category?.name}</small></td><td>{asset.measurementHeight ?? "-"} × {asset.measurementWidth ?? "-"}</td><td>{asset.epc?.epcCode}</td><td>{locationDisplayName(asset.location)}</td><td><select value={rows[asset.id]?.recipient || recipient} onChange={(e) => setRows({ ...rows, [asset.id]: { recipient: e.target.value, destination: rows[asset.id]?.destination || destination } })}><option value="">Not set yet</option>{users.filter((u) => u.isActive !== false).map((u) => <option key={u.id} value={u.id}>{u.fullName || u.username}</option>)}</select></td><td><LocationTreeSelect locations={locations} selectedLocationId={rows[asset.id]?.destination || destination} onChange={(id) => setRows({ ...rows, [asset.id]: { recipient: rows[asset.id]?.recipient || recipient, destination: String(id) } })} allowedLocation={operational} placeholder="Not set yet" /></td><td>Ready to reserve</td></tr>)}</tbody></table></div><div className="form-actions"><button className="primary-button" disabled={busy}>{busy ? "Saving..." : selectedBatch ? "Add to Job" : "Create Issue Batch"}</button>{selectedBatch && <button type="button" className="secondary-button" disabled={busy || assets.length !== 1} title={assets.length !== 1 ? "Swap Asset requires exactly one replacement Asset." : "Replace an awaiting or in-use Job Asset"} onClick={() => { setSwapOpen(true); setSwapTarget(null); setSwapEpc(""); setSwapRemarks(""); }}>Swap Asset</button>}{selectedBatch && assets.length !== 1 && <span>Swap Asset requires exactly one replacement Asset.</span>}</div>
  </form>{swapOpen && selectedBatch && assets.length === 1 && <div className="modal-backdrop"><div className="modal-card swap-asset-modal"><div className="page-title-row"><div><h3>Swap Asset - {selectedBatch.jobNo}</h3><p>The selected Asset is the replacement and will await normal EPC confirmation.</p></div><button type="button" className="secondary-button" disabled={busy} onClick={() => { setSwapOpen(false); setSwapTarget(null); }}>Close</button></div><section className="swap-replacement-summary"><strong>Replacement Asset</strong><span>{assets[0].assetCode} · {assets[0].itemName} / {assets[0].category?.name || "—"}</span><span>{assets[0].measurementHeight ?? "—"} × {assets[0].measurementWidth ?? "—"} mm · EPC: {assets[0].epc?.epcCode || "—"}</span><span>Current Location: {locationDisplayName(assets[0].location)}</span></section>{swapTarget ? <form onSubmit={(event) => { event.preventDefault(); void performSwap(swapTarget); }}><h4>Scan Asset to Replace</h4><p>Returning: <strong>{swapTarget.asset.assetCode}</strong></p><label className="form-field">Paste / Enter old Asset EPC<input autoFocus required value={swapEpc} onChange={(event) => setSwapEpc(event.target.value)} /></label><label className="form-field">Remarks (optional)<input value={swapRemarks} onChange={(event) => setSwapRemarks(event.target.value)} /></label><div className="form-actions"><button type="button" className="secondary-button" onClick={() => { setSwapTarget(null); setSwapEpc(""); }}>Back</button><button className="primary-button" disabled={busy}>{busy ? "Replacing..." : "Verify EPC and Replace"}</button></div></form> : <><h4>Select Asset to Replace</h4>{swapCandidates.length === 0 ? <p>No awaiting-confirmation or in-use Assets are eligible in this Job.</p> : <div className="request-table-scroll"><table className="data-table"><thead><tr><th>Asset</th><th>Item / Category</th><th>Measurement</th><th>EPC</th><th>Current Location</th><th>Recipient</th><th>To Location</th><th>State</th><th>Action</th></tr></thead><tbody>{swapCandidates.map((item) => <tr key={item.id}><td>{item.asset.assetCode}</td><td>{item.asset.itemName}<small>{item.asset.category?.name || "—"}</small></td><td>{item.asset.measurementHeight ?? "—"} × {item.asset.measurementWidth ?? "—"} mm</td><td>{item.asset.epc?.epcCode || "—"}</td><td>{locationDisplayName(item.asset.location)}</td><td>{item.recipient?.fullName || item.recipient?.username || "—"}</td><td>{item.toLocation?.displayPath || item.toLocation?.name || "—"}</td><td><strong>{item.status === "ISSUED" ? "Awaiting EPC Confirmation" : "In Use"}</strong></td><td><button type="button" className="table-button" disabled={busy} onClick={() => item.status === "ISSUED" ? void performSwap(item) : setSwapTarget(item)}>{item.status === "ISSUED" ? "Replace" : "Scan & Replace"}</button></td></tr>)}</tbody></table></div>}</>}</div></div>}</dialog>;
}

function AssetEpcDialog({ asset, close, refresh }: { asset: Asset; close: () => void; refresh: () => Promise<void> }) {
  const ref = useRef<HTMLDialogElement>(null);
  const replacing = hasActiveEpc(asset);
  const [autoGenerate, setAutoGenerate] = useState(true);
  const [epcCode, setEpcCode] = useState("");
  const [remarks, setRemarks] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [savedEpc, setSavedEpc] = useState("");
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setSavedEpc("");
    try {
      const result = await assignOrReplaceAssetEpcApi(asset.id, { autoGenerateEpc: autoGenerate, epcCode: autoGenerate ? undefined : epcCode, remarks });
      setSavedEpc(result.epcCode); await refresh();
    } catch (caught) { setError(apiError(caught)); } finally { setBusy(false); }
  }
  return <dialog ref={ref} className="asset-epc-dialog" aria-label={replacing ? "Replace EPC" : "Assign EPC"} onCancel={(event) => { event.preventDefault(); if (!busy) close(); }}>
    <div className="page-title-row"><div><h3>{replacing ? "Replace EPC" : "Assign EPC"}</h3><p>{asset.assetCode} · {asset.itemName}</p></div><button type="button" className="secondary-button" disabled={busy} onClick={close}>Close</button></div>
    <div className="epc-current"><strong>Current EPC</strong><span>{replacing ? asset.epc?.epcCode : "Not Assigned"}</span><small>Status: {replacing ? "Active" : "Not Assigned"}</small></div>
    {error && <div className="error-box" role="alert">{error}</div>}{savedEpc && <div className="success-box" role="status">EPC saved successfully: <strong>{savedEpc}</strong></div>}
    <form onSubmit={submit}><label className="checkbox-row"><input type="checkbox" disabled={!!savedEpc} checked={autoGenerate} onChange={(event) => setAutoGenerate(event.target.checked)} />Auto Generate EPC</label>
      <label className="form-field">{autoGenerate ? "EPC (generated by server)" : "Manual EPC Entry *"}<input autoFocus={!autoGenerate} disabled={autoGenerate || !!savedEpc} required={!autoGenerate} minLength={24} maxLength={24} pattern="[0-9A-Fa-f]{24}" value={epcCode} onChange={(event) => setEpcCode(event.target.value)} placeholder={autoGenerate ? "24-character EPC generated after save" : "Enter 24 hexadecimal characters"} /></label>
      <label className="form-field">Remarks<input disabled={!!savedEpc} maxLength={191} value={remarks} onChange={(event) => setRemarks(event.target.value)} placeholder="Optional" /></label>
      <div className="form-actions"><button className="primary-button" disabled={busy || !!savedEpc}>{busy ? "Saving..." : savedEpc ? "Saved" : replacing ? "Replace EPC" : "Assign EPC"}</button></div>
    </form>
  </dialog>;
}

export function AssetsPages() {
  const navigate = useNavigate();
  const {
    assets,
    assetCategories,
    locations,
    form,
    loading,
    saving,
    error,
    createdEpc,
    isEditing,
    editingAssetId,
    locationLocked,
    homeNeedsVerification,
    updateForm,
    loadPageData,
    handleEditAsset,
    handleCancelEdit,
    handleSubmitAsset,
    handleDeleteAsset,
  } = useAssetsPagesFunction();
  const [epcAsset, setEpcAsset] = useState<Asset | null>(null);
  const [viewAsset, setViewAsset] = useState<Asset | null>(null);
  const [columnSelectorOpen, setColumnSelectorOpen] = useState(false);
  const [columns, setColumns] = useState<AssetColumnId[]>(() => { try { return normalizeAssetColumns(JSON.parse(localStorage.getItem(ASSET_COLUMNS_KEY) || "null")); } catch { return DEFAULT_ASSET_COLUMNS; } });
  const [assetFormOpen, setAssetFormOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [preparing, setPreparing] = useState(false);
  const [filters, setFilters] = useState({ assetCode: "", itemName: "", category: "", height: "", width: "", gridUp: "", radius: "", gapMm: "", current: "", epc: "", condition: "", status: "" });
  const [order, setOrder] = useState<ListOrder>("LATEST");
  const visible = chronological(assets.filter((asset) => (!filters.assetCode || asset.assetCode.toLowerCase().includes(filters.assetCode.toLowerCase())) && (!filters.itemName || asset.itemName.toLowerCase().includes(filters.itemName.toLowerCase())) && (!filters.category || String(asset.categoryId) === filters.category) && (!filters.height || Number(asset.measurementHeight) === Number(filters.height)) && (!filters.width || Number(asset.measurementWidth) === Number(filters.width)) && (!filters.gridUp || Number(asset.gridUp) === Number(filters.gridUp)) && (!filters.radius || Number(asset.radius) === Number(filters.radius)) && (!filters.gapMm || Number(asset.gapMm) === Number(filters.gapMm)) && (!filters.current || String(asset.locationId) === filters.current) && (!filters.epc || asset.epc?.epcCode.includes(filters.epc.toUpperCase())) && (!filters.condition || asset.condition === filters.condition) && (!filters.status || asset.status === filters.status)), (asset) => asset.createdAt, order);
  const selectedAssets = assets.filter((asset) => selected.has(asset.id));
  const editingAsset = assets.find((asset) => asset.id === editingAssetId);
  const setFilter = (name: keyof typeof filters, value: string) => setFilters((old) => ({ ...old, [name]: value }));
  const applyColumns = (next: AssetColumnId[]) => { setColumns(next); localStorage.setItem(ASSET_COLUMNS_KEY, JSON.stringify(next)); setColumnSelectorOpen(false); };
  const renderAssetCell = (asset: Asset, column: AssetColumnId) => {
    switch (column) {
      case "assetCode": return <button className="asset-code-link" type="button" onClick={() => setViewAsset(asset)} aria-label={`View details for ${asset.assetCode}`}>{asset.assetCode}</button>;
      case "itemName": return asset.itemName;
      case "category": return asset.category?.name || asset.categoryId;
      case "measurement": return formatMeasurement(asset);
      case "bladeDetails": return formatBladeDetails(asset);
      case "gridUp": return asset.gridUp == null ? "—" : `${asset.gridUp} UP`;
      case "radius": return formatRadius(asset.radius) || "—";
      case "gapMm": return formatGap(asset.gapMm) || "—";
      case "epc": return <>{hasActiveEpc(asset) ? asset.epc?.epcCode : "Not Assigned"}<small className={hasActiveEpc(asset) ? "epc-active" : "epc-missing"}>{hasActiveEpc(asset) ? "Active" : "Not Assigned"}</small></>;
      case "currentLocation": return locationDisplayName(asset.location);
      case "homeLocation": return locationDisplayName(asset.homeLocation);
      case "status": return asset.status ? asset.status.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) : "—";
      case "condition": return asset.condition || "—";
      case "brand": return displayValue(asset.brand);
      case "model": return displayValue(asset.model);
      case "serialNumber": return displayValue(asset.serialNumber);
      case "purchaseDate": return formatPurchaseDate(asset.purchaseDate);
      case "purchaseCost": return displayValue(asset.purchaseCost);
      case "action": return <button className="table-button" type="button" onClick={() => { handleEditAsset(asset); setAssetFormOpen(true); }}>Edit</button>;
    }
  };

  return (
    <div className="page">
      <div className="page-title-row">
        <div>
          <h2>Assets</h2>
          <p>Manage and prepare Assets for issue.</p>
        </div>
        <div className="form-actions"><button className="primary-button" onClick={() => { handleCancelEdit(); setAssetFormOpen(true); }}>+ Register Asset</button><button className="secondary-button" onClick={loadPageData}>Refresh</button></div>
      </div>

      {!assetFormOpen && error && <div className="error-box">{error}</div>}
      {createdEpc && <div className="success-box">Asset registered successfully. Generated EPC: <strong>{createdEpc}</strong></div>}

      <div className="form-panel asset-search-panel"><strong>Operational Asset Search</strong><div className="asset-filter-row"><label className="form-field">Asset Code<input value={filters.assetCode} onChange={(e) => setFilter("assetCode", e.target.value)} /></label><label className="form-field">Item Name<input value={filters.itemName} onChange={(e) => setFilter("itemName", e.target.value)} /></label><label className="form-field">Category<select value={filters.category} onChange={(e) => setFilter("category", e.target.value)}><option value="">All</option>{assetCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label></div><fieldset className="asset-detail-filter-group"><legend>Measurement / Blade Details</legend><div className="asset-filter-row"><label className="form-field">Height (mm)<input type="number" min="0" step="0.01" value={filters.height} onChange={(e) => setFilter("height", e.target.value)} /></label><label className="form-field">Width (mm)<input type="number" min="0" step="0.01" value={filters.width} onChange={(e) => setFilter("width", e.target.value)} /></label><label className="form-field">Grid / Up<input type="number" min="1" step="1" value={filters.gridUp} onChange={(e) => setFilter("gridUp", e.target.value)} /></label><label className="form-field">Radius<input type="number" min="0" step="0.01" value={filters.radius} onChange={(e) => setFilter("radius", e.target.value)} /></label><label className="form-field">Gap (mm)<input type="number" min="0" step="0.01" value={filters.gapMm} onChange={(e) => setFilter("gapMm", e.target.value)} /></label></div></fieldset><div className="asset-filter-row"><label className="form-field">EPC<input value={filters.epc} onChange={(e) => setFilter("epc", e.target.value)} /></label><label className="form-field">Current Location<LocationTreeSelect locations={locations} selectedLocationId={filters.current} onChange={(id) => setFilter("current", String(id))} allowClear clearLabel="All Locations" onClear={() => setFilter("current", "")} placeholder="All Locations" /></label><label className="form-field">Condition<select value={filters.condition} onChange={(e) => setFilter("condition", e.target.value)}><option value="">All</option>{["NEW", "GOOD", "FAIR", "POOR", "DAMAGED"].map((v) => <option key={v}>{v}</option>)}</select></label><label className="form-field">Status<select value={filters.status} onChange={(e) => setFilter("status", e.target.value)}><option value="">All</option>{["AVAILABLE", "RESERVED", "PENDING_CONFIRMATION", "IN_USE"].map((v) => <option key={v}>{v}</option>)}</select></label><label className="form-field">Order<select value={order} onChange={(event) => setOrder(event.target.value as ListOrder)}><option value="LATEST">Latest</option><option value="OLDEST">Oldest</option></select></label></div><button type="button" className="secondary-button" onClick={() => { setFilters({ assetCode: "", itemName: "", category: "", height: "", width: "", gridUp: "", radius: "", gapMm: "", current: "", epc: "", condition: "", status: "" }); setOrder("LATEST"); }}>Clear Filters</button></div>

      <div className="asset-selection-tray"><strong>{selected.size} selected</strong><button className="secondary-button" disabled={!visible.some((a) => !eligibility(a))} onClick={() => setSelected((old) => new Set([...old, ...visible.filter((a) => !eligibility(a)).map((a) => a.id)]))}>Select eligible visible rows</button><button className="secondary-button" disabled={!selected.size} onClick={() => setSelected(new Set())}>Clear selection</button><button className="primary-button" disabled={!selected.size} onClick={() => setPreparing(true)}>Prepare Issue</button></div>

      {assetFormOpen && <div className="modal-backdrop" role="presentation"><div className="asset-registration-modal" role="dialog" aria-modal="true" aria-labelledby="asset-form-title">
      <div className="page-title-row"><div><h3 id="asset-form-title">{isEditing ? "Edit Asset" : "Register Asset"}</h3><p>{isEditing ? "Update Asset master information." : "Register a physical Asset and its storage location."}</p></div><button className="secondary-button" type="button" disabled={saving} onClick={() => { handleCancelEdit(); setAssetFormOpen(false); }}>Close</button></div>
      {error && <div className="error-box">{error}</div>}
      <form className="form-panel asset-registration-form" onSubmit={async (event) => { if (await handleSubmitAsset(event)) setAssetFormOpen(false); }}>
        <div className="form-grid">
          <h4 className="asset-form-section-title">1. Basic Information</h4>
          <div className="form-field">
            <label>Asset Code *</label>
            <input
              value={form.assetCode}
              onChange={(event) => updateForm("assetCode", event.target.value)}
              placeholder="Example: AST-0001"
              required
            />
          </div>

          <div className="form-field">
            <label>Item Name *</label>
            <input
              value={form.itemName}
              onChange={(event) => updateForm("itemName", event.target.value)}
              placeholder="Example: Dell Laptop"
              required
            />
          </div>

          <div className="form-field">
            <label>Asset Category *</label>
            <select
              value={form.categoryId}
              onChange={(event) => updateForm("categoryId", event.target.value)}
              required
            >
              <option value="">Select Asset Category</option>
              {assetCategories.filter((category) => category.isActive).map((category) => (
                <option key={category.id} value={category.id}>
                  {category.categoryCode} — {category.name}
                </option>
              ))}
            </select>
          </div>

          <h4 className="asset-form-section-title">2. Measurement &amp; Asset Details</h4>
          <div className="form-field"><label>Measurement Height (mm)</label><input type="number" min="0" step="0.01" value={form.measurementHeight} onChange={(event) => updateForm("measurementHeight", event.target.value)} /></div>
          <div className="form-field"><label>Measurement Width (mm)</label><input type="number" min="0" step="0.01" value={form.measurementWidth} onChange={(event) => updateForm("measurementWidth", event.target.value)} /></div>
          <div className="form-field"><label>Grid / Up</label><input type="number" min="1" step="1" value={form.gridUp} onChange={(event) => updateForm("gridUp", event.target.value)} /></div>
          <div className="form-field"><label>Radius</label><input type="number" min="0" step="0.01" value={form.radius} onChange={(event) => updateForm("radius", event.target.value)} /></div>
          <div className="form-field"><label>Gap (mm)</label><input type="number" min="0" step="0.01" value={form.gapMm} onChange={(event) => updateForm("gapMm", event.target.value)} /></div>

          <h4 className="asset-form-section-title">3. Storage</h4>
          <div className="form-field">
            <label>{isEditing ? locationLocked ? "Current Location (locked)" : "Storage Location" : "Storage Location *"}</label>
            <LocationTreeSelect locations={locations} disabled={locationLocked} required={!isEditing} selectedLocationId={form.locationId} onChange={(id) => updateForm("locationId", String(id))} allowedLocation={storageLocation} placeholder="Select Storage Location" />
          </div>

          {isEditing && locationLocked && <div className="form-field">
            <label>{homeNeedsVerification ? "Verify Home Location" : "Home Location (locked)"}</label>
            <LocationTreeSelect locations={locations} disabled={!homeNeedsVerification} required={homeNeedsVerification} selectedLocationId={form.homeLocationId} onChange={(id) => updateForm("homeLocationId", String(id))} allowedLocation={storageLocation} placeholder={homeNeedsVerification ? "Select verified storage home" : "Verified"} />
            {homeNeedsVerification && <small>Initializes the missing legacy home only; current verified location will not change.</small>}
          </div>}

          <h4 className="asset-form-section-title">4. Manufacturer / Identification</h4>
          <div className="form-field">
            <label>Serial Number</label>
            <input
              value={form.serialNumber}
              onChange={(event) =>
                updateForm("serialNumber", event.target.value)
              }
              placeholder="Optional"
            />
          </div>

          <div className="form-field">
            <label>Brand</label>
            <input
              value={form.brand}
              onChange={(event) => updateForm("brand", event.target.value)}
              placeholder="Example: Dell"
            />
          </div>

          <div className="form-field">
            <label>Model</label>
            <input
              value={form.model}
              onChange={(event) => updateForm("model", event.target.value)}
              placeholder="Example: Latitude 5440"
            />
          </div>

          <h4 className="asset-form-section-title">5. Purchase &amp; Condition</h4>
          <div className="form-field">
            <label>Purchase Date</label>
            <input
              type="date"
              value={form.purchaseDate}
              onChange={(event) =>
                updateForm("purchaseDate", event.target.value)
              }
            />
          </div>

          <div className="form-field">
            <label>Purchase Cost</label>
            <input
              type="number"
              value={form.purchaseCost}
              onChange={(event) =>
                updateForm("purchaseCost", event.target.value)
              }
              placeholder="Example: 3500"
            />
          </div>

          <div className="form-field">
            <label>Condition</label>
            <select value={form.condition} onChange={(event) => updateForm("condition", event.target.value)}><option value="">Default: GOOD</option>{["NEW", "GOOD", "FAIR", "POOR", "DAMAGED"].map((condition) => <option key={condition} value={condition}>{condition}</option>)}</select>
          </div>

          <div className="form-field">
            <label>Remarks</label>
            <input
              value={form.remarks}
              onChange={(event) => updateForm("remarks", event.target.value)}
              placeholder="Optional"
            />
          </div>

          <h4 className="asset-form-section-title">6. EPC Registration</h4>
          {!isEditing && <><div className="form-field checkbox-field"><label className="checkbox-row"><input type="checkbox" checked={form.registerEpc} onChange={(event) => updateForm("registerEpc", event.target.checked)} />Register EPC</label></div>{form.registerEpc && <><div className="form-field"><label>EPC Method</label><label className="checkbox-row"><input type="radio" name="epc-method" checked={form.autoGenerateEpc} onChange={() => updateForm("autoGenerateEpc", true)} />Auto Generate</label><label className="checkbox-row"><input type="radio" name="epc-method" checked={!form.autoGenerateEpc} onChange={() => updateForm("autoGenerateEpc", false)} />Manual</label></div>{!form.autoGenerateEpc && <div className="form-field"><label>EPC *</label><input required minLength={24} maxLength={24} pattern="[0-9A-Fa-f]{24}" value={form.epcCode} onChange={(event) => updateForm("epcCode", event.target.value)} placeholder="Enter 24 hexadecimal characters" /></div>}</>}</>}
          {isEditing && editingAsset && <div className="form-field asset-edit-epc"><label>Current EPC</label><strong>{hasActiveEpc(editingAsset) ? editingAsset.epc?.epcCode : "Not Assigned"}</strong><small>Status: {hasActiveEpc(editingAsset) ? "Active" : "Not Assigned"}</small><button type="button" className="secondary-button" disabled={!epcMutable(editingAsset)} title={epcMutable(editingAsset) ? undefined : "EPC changes are allowed only while Available or Reserved"} onClick={() => setEpcAsset(editingAsset)}>{hasActiveEpc(editingAsset) ? "Replace EPC" : "Assign EPC"}</button></div>}
          <h4 className="asset-form-section-title">7. Status</h4>
          <div className="form-field checkbox-field">
            <label>Status Active</label>
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
          {isEditing && <button className="danger-button" type="button" disabled={saving} onClick={() => setConfirmingDelete(true)}>Delete Asset</button>}
          <button className="secondary-button" type="button" disabled={saving} onClick={() => { handleCancelEdit(); setAssetFormOpen(false); }}>Cancel</button>
          <button className="primary-button" disabled={saving} type="submit">
            {saving
              ? "Saving..."
              : isEditing
              ? "Save Changes"
              : "Register"}
          </button>
        </div>
      </form></div></div>}
      {confirmingDelete && editingAsset && <ConfirmDeleteDialog title="Delete Asset?" recordLabel={`Asset Code: ${editingAsset.assetCode}`} busy={saving} onCancel={() => setConfirmingDelete(false)} onConfirm={async () => { if (await handleDeleteAsset()) { setConfirmingDelete(false); setAssetFormOpen(false); setSelected((current) => { const next = new Set(current); next.delete(editingAsset.id); return next; }); } else setConfirmingDelete(false); }} />}

      <div className="asset-table-toolbar"><strong>{visible.length} Assets</strong><button type="button" className="secondary-button" onClick={() => setColumnSelectorOpen(true)}>Select Columns</button>{columnSelectorOpen && <AssetColumnSelector columns={columns} close={() => setColumnSelectorOpen(false)} apply={applyColumns} />}</div>
      <div className="table-panel">
        {loading ? (
          <p>Loading assets...</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Select</th>
                {columns.map((column) => <th key={column}>{assetColumnLabel.get(column)}</th>)}
              </tr>
            </thead>

            <tbody>
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={columns.length + 1}>No assets found.</td>
                </tr>
              ) : (
                visible.map((asset) => (
                  <tr key={asset.id}>
                    <td><input type="checkbox" checked={selected.has(asset.id)} disabled={!!eligibility(asset)} title={eligibility(asset) || "Eligible for Issue preparation"} onChange={(e) => setSelected((old) => { const next = new Set(old); if (e.target.checked) next.add(asset.id); else next.delete(asset.id); return next; })} /></td>
                    {columns.map((column) => <td key={column}>{renderAssetCell(asset, column)}</td>)}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
      <AssetDetailsModal asset={viewAsset} close={() => setViewAsset(null)} />
      {epcAsset && <AssetEpcDialog asset={epcAsset} close={() => setEpcAsset(null)} refresh={loadPageData} />}
      {preparing && <PrepareIssueDialog assets={selectedAssets} locations={locations} close={() => setPreparing(false)} complete={async (count, message) => { setPreparing(false); setSelected(new Set()); navigate("/issue-batches", { state: { message: message || `${count} Assets prepared. Awaiting EPC confirmation.` } }); }} />}
    </div>
  );
}
