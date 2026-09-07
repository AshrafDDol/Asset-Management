import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { getAssetCategoriesApi, type AssetCategory } from "../api/assetCategories.api";
import { getLocationsApi, type Location } from "../api/locations.api";
import { getUsersApi, type User } from "../api/users.api";
import { cancelAssetRequestApi, cancelReservationApi, confirmIssueApi, confirmReturnApi, createAssetRequestApi, updateAssetRequestApi, getAssetRequestsApi, getAvailableAssetsApi, initiateReturnApi, issueAssetApi, reserveAssetApi, returnAssetAssignmentApi, type AssetRequest, type AssetRequestAllocation, type AssetRequestLine, type AvailableAsset } from "../api/assetRequests.api";
import "./AssetRequestWorkspace.css";
type Tab = "Requesting" | "Issue & Confirmation" | "Returning";
type Row = { request: AssetRequest; line: AssetRequestLine; allocation?: AssetRequestAllocation };
type Action = "prepare" | "find" | "issue" | "confirmIssue" | "swap" | "initiateReturn" | "confirmReturn" | "legacyReturn" | "cancel" | "history";
type Target = Row & { action: Action };
type Requirement = { id?: number; preparedRecipientUserId: string; specificLocationId: string; assetCategoryId: string; measurementHeight: string; measurementWidth: string; remarks: string };
const emptyRequirement = (): Requirement => ({ preparedRecipientUserId: "", specificLocationId: "", assetCategoryId: "", measurementHeight: "", measurementWidth: "", remarks: "" });
const friendly = (v: string) => v.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (l) => l.toUpperCase());
const errorMessage = (e: unknown) => (e as { response?: { data?: { message?: string } } }).response?.data?.message || (e as Error).message || "Operation failed.";
const lockedLine = (l: AssetRequestLine) => l.allocations.some((a) => ["ISSUED", "CONFIRMED", "RETURN_PENDING"].includes(a.status) || (a.status === "RETURNED" && a.returnPurpose !== "SWAP"));
const issuedHistory = (r: AssetRequest) => r.lines.some((l) => l.allocations.some((a) => !["CANCELLED", "RESERVED"].includes(a.status)));
const ready = (r: Row) => r.allocation?.status === "RESERVED" && !!r.line.preparedRecipient?.isActive && !!r.line.specificLocation?.isActive;
const linePayload = (l: AssetRequestLine) => ({ id: l.id, assetCategoryId: l.assetCategoryId!, measurementHeight: Number(l.measurementHeight), measurementWidth: Number(l.measurementWidth), remarks: l.remarks || "", preparedRecipientUserId: l.preparedRecipientUserId, specificLocationId: l.specificLocationId });
const reasons = ["WRONG_ASSET", "NOT_SUITABLE", "WRONG_MEASUREMENT", "CONDITION_ISSUE", "OTHER"];
const current = (line: AssetRequestLine) => [...line.allocations].sort((a, b) => b.id - a.id).find((a) => a.status !== "CANCELLED" && !(a.status === "RETURNED" && a.returnPurpose === "SWAP"));
const inUse = (a?: AssetRequestAllocation) => !!a && a.asset.status === "IN_USE" && ["CONFIRMED", "ISSUED"].includes(a.status);
const measurement = (l: AssetRequestLine) => l.measurementHeight == null ? "Legacy requirement" : l.measurementHeight + " × " + l.measurementWidth + " mm";
const requirement = (l: AssetRequestLine) => (l.assetCategory?.name || "Legacy category") + " · " + measurement(l);
const verified = (a?: AssetRequestAllocation) => a?.asset.locationPath || a?.asset.location?.name || "—";
const state = (r: Row) => !r.allocation ? r.line.progress.replacementRequired ? "Replacement Required" : "Not Selected" : r.allocation.status === "RESERVED" ? !r.line.preparedRecipient?.isActive ? "Needs Recipient" : !r.line.specificLocation?.isActive ? "Needs Specific Location" : "Ready to Issue" : inUse(r.allocation) ? r.allocation.status === "ISSUED" ? "In Use (Legacy)" : "In Use" : r.allocation.status === "ISSUED" ? "Awaiting EPC Confirmation" : r.allocation.status === "RETURN_PENDING" ? "Awaiting Return Confirmation" : friendly(r.allocation.status);
function withinRoot(l: Location, rootId: number, locations: Location[]) {
  const seen = new Set<number>();
  let node: Location | undefined = l;
  while (node && !seen.has(node.id)) {
    if (node.id === rootId) return true;
    seen.add(node.id);
    const parentId: number | null | undefined = node.parentLocationId;
    node = locations.find((item) => item.id === parentId);
  }
  return false;
}
function Dialog({ title, children, onClose, busy }: { title: string; children: ReactNode; onClose: () => void; busy: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const d = ref.current; d?.showModal(); return () => d?.close(); }, []);
  return <dialog ref={ref} className="request-dialog" aria-label={title} onCancel={(e) => { e.preventDefault(); if (!busy) onClose(); }}><div className="page-title-row"><h3>{title}</h3><button type="button" className="secondary-button" disabled={busy} onClick={onClose}>Close</button></div>{children}</dialog>;
}
function Select({ label, value, change, options, required = false, disabled = false }: { label: string; value: string; change: (v: string) => void; options: { id: string | number; name: string }[]; required?: boolean; disabled?: boolean }) {
  return <label className="form-field">{label}<select disabled={disabled} required={required} value={value} onChange={(e) => change(e.target.value)}><option value="">{required ? "Select" : "All"}</option>{options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>;
}
const choices = (items: string[]) => items.map((v) => ({ id: v, name: friendly(v) }));
export function AssetRequestsPages() {
  const [requests, setRequests] = useState<AssetRequest[]>([]);
  const [categories, setCategories] = useState<AssetCategory[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [tab, setTab] = useState<Tab>("Requesting");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("");
  const [category, setCategory] = useState("");
  const [size, setSize] = useState("");
  const [root, setRoot] = useState("");
  const [recipient, setRecipient] = useState("");
  const [specific, setSpecific] = useState("");
  const [returnType, setReturnType] = useState("");
  const [returnLocation, setReturnLocation] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [closed, setClosed] = useState<Set<number>>(new Set());
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<AssetRequest | null>(null);
  const [jobNo, setJobNo] = useState("");
  const [newRoot, setNewRoot] = useState("");
  const [newRemarks, setNewRemarks] = useState("");
  const [requirements, setRequirements] = useState<Requirement[]>([emptyRequirement()]);
  const [target, setTarget] = useState<Target | null>(null);
  const [available, setAvailable] = useState<AvailableAsset[]>([]);
  const [assetSearch, setAssetSearch] = useState("");
  const [epc, setEpc] = useState("");
  const [actionRecipient, setActionRecipient] = useState("");
  const [actionLocation, setActionLocation] = useState("");
  const [condition, setCondition] = useState("");
  const [reason, setReason] = useState("");
  const [remarks, setRemarks] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  useEffect(() => {
    let alive = true;
    Promise.all([getAssetRequestsApi(), getAssetCategoriesApi(), getUsersApi(), getLocationsApi()])
      .then(([r, c, u, l]) => { if (alive) { setRequests(r); setCategories(c); setUsers(u); setLocations(l); } })
      .catch((e: unknown) => { if (alive) setError(errorMessage(e)); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);
  async function refresh() { setRequests(await getAssetRequestsApi()); }
  async function run(action: () => Promise<unknown>, message: string, close = true) {
    setBusy(true); setError(""); setSuccess("");
    try {
      await action();
      if (close) { setTarget(null); setCreating(false); }
      setSuccess(message);
      try { await refresh(); } catch (e) { setError("Action succeeded, but refresh failed: " + errorMessage(e)); }
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }
  function open(row: Row, action: Action) {
    setTarget({ ...row, action }); setError(""); setEpc(""); setRemarks(""); setCondition(""); setReason(""); setActionRecipient(String(row.line.preparedRecipientUserId || ""));
    setActionLocation(action === "prepare" ? String(row.line.specificLocationId || row.request.rootLocationId || "") : ""); setAvailable([]); setAssetSearch("");
    if (action === "find") {
      setBusy(true);
      getAvailableAssetsApi(row.request.id, row.line.id).then(setAvailable).catch((e: unknown) => setError(errorMessage(e))).finally(() => setBusy(false));
    }
  }
  const allRows: Row[] = requests.flatMap((request) => request.lines.map((line) => ({ request, line, allocation: current(line) })));
  const operational = allRows.filter((r) => !["COMPLETED", "CANCELLED"].includes(r.request.status));
  const counters = {
    Requesting: operational.filter((r) => (!r.allocation && !!r.line.assetCategoryId) || r.allocation?.status === "RESERVED").length,
    "Issue & Confirmation": operational.filter((r) => ready(r) || (r.allocation?.status === "ISSUED" && !inUse(r.allocation))).length,
    Returning: operational.filter((r) => inUse(r.allocation) || r.allocation?.status === "RETURN_PENDING").length,
  };
  const rows = allRows.filter((row) => {
    const { request: r, line: l, allocation: a } = row;
    const q = search.trim().toLowerCase();
    if (q && ![r.jobNo, r.requestNo, ...l.allocations.flatMap((i) => [i.asset.assetCode, i.asset.epc?.epcCode])].some((v) => v?.toLowerCase().includes(q))) return false;
    if (tab === "Requesting") {
      if (!showHistory && ["COMPLETED", "CANCELLED"].includes(r.status)) return false;
      if (filter && !(filter === "Reserved" ? a?.status === "RESERVED" : state(row) === filter)) return false;
      if (category && l.assetCategoryId !== Number(category)) return false;
      if (size && !measurement(l).replaceAll(" ", "").toLowerCase().includes(size.replaceAll(" ", "").toLowerCase())) return false;
    } else if (tab === "Issue & Confirmation") {
      if (!a || !["RESERVED", "ISSUED", "CONFIRMED"].includes(a.status)) return false;
      if (filter === "Ready to Issue" && !ready(row)) return false;
      if (filter === "Awaiting Confirmation" && !(a.status === "ISSUED" && !inUse(a))) return false;
      if (filter === "In Use" && !inUse(a)) return false;
      if (recipient && (a.assignment?.assignedToUser.id ?? l.preparedRecipientUserId) !== Number(recipient)) return false;
      if (specific && (a.assignment?.location?.id ?? l.specificLocationId) !== Number(specific)) return false;
    } else {
      if (!a || (!inUse(a) && a.status !== "RETURN_PENDING")) return false;
      if (filter === "In Use" && !inUse(a)) return false;
      if (filter === "Return Pending" && a.status !== "RETURN_PENDING") return false;
      if (returnType && (a.returnPurpose || "NORMAL_RETURN") !== returnType) return false;
      if (returnLocation && a.asset.locationId !== Number(returnLocation)) return false;
    }
    return !(tab !== "Returning" && root && r.rootLocationId !== Number(root));
  });
  const locationOptions = locations.map((l) => ({ id: l.id, name: l.displayPath || l.name }));
  const rootOptions = locations.filter((l) => !l.parentLocationId);
  const userOptions = users.map((u) => ({ id: u.id, name: u.fullName || u.username }));
  const destinations = target ? locations.filter((l) => l.isActive && (target.request.rootLocationId ? withinRoot(l, target.request.rootLocationId, locations) : ["PRODUCTION_AREA", "MACHINE_LOCATION"].includes(l.locationType))).map((l) => ({ id: l.id, name: l.displayPath || l.name })) : [];
  const titles: Record<Action, string> = { prepare: "Prepare Requirement", find: target?.line.progress.replacementRequired ? "Find Replacement" : "Find Asset", issue: "Issue to Operation", confirmIssue: "Confirm Issue EPC", swap: "Start Asset Swap", initiateReturn: "Initiate Return", confirmReturn: "Confirm Return EPC", legacyReturn: "Complete Legacy Return", cancel: "Cancel Selection", history: "Allocation History" };
  async function submitAction(e: FormEvent) {
    e.preventDefault();
    if (!target) return;
    if (target.action === "prepare") {
      await run(() => updateAssetRequestApi(target.request.id, { lines: target.request.lines.map((l) => ({ ...linePayload(l), ...(l.id === target.line.id ? { preparedRecipientUserId: Number(actionRecipient), specificLocationId: Number(actionLocation) } : {}) })) }), "Preparation saved. The selected requirement is Ready to Issue.");
      return;
    }
    if (!target.allocation) return;
    const a = target.allocation;
    await run(async () => {
      if (target.action === "issue") await issueAssetApi(a.id, { remarks });
      else if (target.action === "confirmIssue") await confirmIssueApi(a.id, { epc, remarks });
      else if (target.action === "cancel") await cancelReservationApi(a.id);
      else {
        if (!a.assignment) throw new Error("Active assignment is missing. Refresh and try again.");
        if (target.action === "swap" || target.action === "initiateReturn") await initiateReturnApi(a.assignment.id, { returnPurpose: target.action === "swap" ? "SWAP" : "NORMAL_RETURN", swapReason: target.action === "swap" ? reason : undefined, remarks });
        else if (target.action === "confirmReturn") await confirmReturnApi(a.assignment.id, { epc, condition, remarks });
        else if (target.action === "legacyReturn") await returnAssetAssignmentApi(a.assignment.id, { condition, remarks });
      }
    }, target.action === "confirmIssue" ? "Issue confirmed successfully. Asset is now In Use." : target.action === "confirmReturn" ? a.returnPurpose === "SWAP" ? "Swap return confirmed. The same requirement now needs a replacement." : "Return confirmed successfully. Asset is now Available." : target.action === "swap" ? "Swap started. Confirm the old Asset's return before selecting a replacement." : target.action === "issue" ? "Issue recorded. Awaiting EPC confirmation; verified location is unchanged." : target.action === "initiateReturn" ? "Return initiated. Awaiting Return EPC confirmation." : target.action === "cancel" ? "Selection cancelled; history retained." : "Legacy return completed.");
  }
  async function create(e: FormEvent) {
    e.preventDefault();
    await run(async () => {
      const lines = requirements.map((r) => ({ id: r.id, assetCategoryId: Number(r.assetCategoryId), measurementHeight: Number(r.measurementHeight), measurementWidth: Number(r.measurementWidth), remarks: r.remarks, preparedRecipientUserId: r.preparedRecipientUserId ? Number(r.preparedRecipientUserId) : null, specificLocationId: r.specificLocationId ? Number(r.specificLocationId) : null }));
      if (editing) await updateAssetRequestApi(editing.id, { jobNo: jobNo.trim(), ...(newRoot ? { rootLocationId: Number(newRoot) } : {}), remarks: newRemarks, lines });
      else await createAssetRequestApi({ jobNo: jobNo.trim(), rootLocationId: Number(newRoot), remarks: newRemarks, lines });
      setEditing(null);
      setJobNo(""); setNewRoot(""); setNewRemarks(""); setRequirements([emptyRequirement()]); setTab("Requesting");
      if (!editing) { setFilter(""); setSearch(""); setRoot(""); setCategory(""); setSize(""); }
    }, editing ? "Request updated; allocation history preserved." : "Request created. Select and prepare Assets in Requesting.");
  }
  function editRequest(r: AssetRequest) {
    setEditing(r); setJobNo(r.jobNo || ""); setNewRoot(String(r.rootLocationId || "")); setNewRemarks(r.remarks || "");
    setRequirements(r.lines.map((l) => ({ id: l.id, assetCategoryId: String(l.assetCategoryId || ""), measurementHeight: String(l.measurementHeight || ""), measurementWidth: String(l.measurementWidth || ""), remarks: l.remarks || "", preparedRecipientUserId: String(l.preparedRecipientUserId || ""), specificLocationId: String(l.specificLocationId || "") })));
    setError(""); setCreating(true);
  }
  function actions(row: Row) {
    const a = row.allocation;
    const button = (action: Action, label: string) => <button className="table-button" disabled={busy} onClick={() => open(row, action)}>{label}</button>;
    if (tab === "Requesting") return <>
      {!a && row.line.assetCategoryId && !["CANCELLED", "COMPLETED"].includes(row.request.status) && button("find", row.line.progress.replacementRequired ? "Find Replacement" : "Find Asset")}
      {["PENDING", "PROCESSING"].includes(row.request.status) && !lockedLine(row.line) && button("prepare", "Prepare")}
      {a?.status === "RESERVED" && button("cancel", "Cancel Selection")}
      {row.line.allocations.length > 0 && button("history", "History (" + row.line.allocations.length + ")")}
    </>;
    if (tab === "Issue & Confirmation") return <>
      {a?.status === "RESERVED" && (ready(row) ? <button className="table-button" disabled={busy} onClick={() => run(() => issueAssetApi(a.id), "Issue recorded. Awaiting EPC confirmation.")}>Issue to Operation</button> : <small>Complete preparation in Requesting</small>)}
      {a?.status === "ISSUED" && a.asset.status === "PENDING_CONFIRMATION" && button("confirmIssue", "Confirm Issue EPC")}
      {a?.status === "CONFIRMED" && inUse(a) && button("swap", "Swap Asset")}
    </>;
    return <>{a?.status === "CONFIRMED" && inUse(a) && button("initiateReturn", "Initiate Return")}{a?.status === "ISSUED" && inUse(a) && button("legacyReturn", "Return Legacy Asset")}{a?.status === "RETURN_PENDING" && button("confirmReturn", "Confirm Return EPC")}</>;
  }

  return <div className="page request-workspace">
    <div className="page-title-row"><div><h2>Asset Requests</h2><p>Selection, EPC verification, returns, and replacements.</p></div><div className="form-actions"><button className="secondary-button" disabled={busy} onClick={() => run(refresh, "Workspace refreshed.", false)}>Refresh</button><button className="primary-button" onClick={() => { setEditing(null); setJobNo(""); setNewRoot(""); setNewRemarks(""); setRequirements([emptyRequirement()]); setError(""); setCreating(true); }}>+ New Request</button></div></div>
    {error && !target && !creating && <div className="error-box" role="alert">{error}</div>}{success && <div className="success-box" role="status">{success}</div>}
    <div className="request-tabs" role="tablist" aria-label="Asset Request workflow">{(["Requesting", "Issue & Confirmation", "Returning"] as Tab[]).map((name) => <button key={name} role="tab" aria-selected={tab === name} className={tab === name ? "primary-button" : "secondary-button"} onClick={() => { setTab(name); setFilter(""); }}>{name} ({counters[name]})</button>)}</div>
    <div className="request-filters"><label className="form-field">Search Job No / Asset Code / EPC<input value={search} onChange={(e) => setSearch(e.target.value)} /></label>
      <Select label="State" value={filter} change={setFilter} options={choices(tab === "Requesting" ? ["Not Selected", "Reserved", "Needs Recipient", "Needs Specific Location", "Ready to Issue", "Replacement Required"] : tab === "Issue & Confirmation" ? ["Ready to Issue", "Awaiting Confirmation", "In Use"] : ["In Use", "Return Pending"])} />
      {tab !== "Returning" && <Select label="Root Location" value={root} change={setRoot} options={rootOptions} />}
      {tab === "Requesting" && <><Select label="Category" value={category} change={setCategory} options={categories} /><label className="form-field">Measurement H × W<input value={size} onChange={(e) => setSize(e.target.value)} placeholder="148 × 210" /></label><label><input type="checkbox" checked={showHistory} onChange={(e) => setShowHistory(e.target.checked)} /> Include completed / cancelled Jobs</label></>}
      {tab === "Issue & Confirmation" && <><Select label="Recipient" value={recipient} change={setRecipient} options={userOptions} /><Select label="Specific Location" value={specific} change={setSpecific} options={locationOptions} /></>}
      {tab === "Returning" && <><Select label="Return Type" value={returnType} change={setReturnType} options={[{ id: "NORMAL_RETURN", name: "Normal Return" }, { id: "SWAP", name: "Asset Swap" }]} /><Select label="Verified Location" value={returnLocation} change={setReturnLocation} options={locationOptions} /></>}
    </div>
    {loading ? <p role="status">Loading workspace…</p> : rows.length === 0 ? <div className="form-panel">No matching requirements. Adjust filters or create a new request.</div> : tab === "Requesting" ? requests.filter((r) => rows.some((row) => row.request.id === r.id)).map((r) => {
      const group = rows.filter((row) => row.request.id === r.id);
      const p = r.lines.map((l) => l.progress);
      const sum = (key: "quantitySelected" | "quantityConfirmed" | "quantityAwaitingConfirmation" | "quantityReturning") => p.reduce((n, v) => n + v[key], 0);
      return <section className="request-job" key={r.id}><div className="request-job-header"><button className="request-job-toggle" aria-expanded={!closed.has(r.id)} onClick={() => setClosed((old) => { const next = new Set(old); if (next.has(r.id)) next.delete(r.id); else next.add(r.id); return next; })}>{closed.has(r.id) ? "▸" : "▾"} {r.jobNo || r.productionOrderNo || r.requestNo} <span className="request-state">{friendly(r.status)}</span></button><span>{r.requestNo} · Root: {r.rootLocation?.name || "Legacy — not set"}</span>{["PENDING", "PROCESSING"].includes(r.status) && r.lines.every((l) => l.assetCategoryId) && r.lines.some((l) => !lockedLine(l)) && <button className="table-button" disabled={busy} onClick={() => editRequest(r)}>Edit Request</button>}{r.status === "PENDING" && <button className="table-button" disabled={busy} onClick={() => { if (window.confirm("Cancel this pending request? History will be retained.")) void run(() => cancelAssetRequestApi(r.id), "Request cancelled."); }}>Cancel Request</button>}</div>
        <p className="request-summary">Requirements: {r.lines.length} · Selected: {sum("quantitySelected")} · Confirmed / In Use: {sum("quantityConfirmed")} · Awaiting Confirmation: {sum("quantityAwaitingConfirmation")} · Replacement Required: {p.filter((l) => l.replacementRequired).length} · Returning: {sum("quantityReturning")}</p>
        {!closed.has(r.id) && <div className="request-table-scroll"><table className="data-table"><thead><tr><th>Requirement</th><th>Selected Asset / EPC</th><th>Verified Location</th><th>Recipient / Specific Location</th><th>State</th><th>Action</th></tr></thead><tbody>{group.map((row) => <tr key={row.line.id}><td>{requirement(row.line)}<small>{row.line.remarks}</small></td><td>{row.allocation?.asset.assetCode || "—"}<small>{row.allocation?.asset.epc?.epcCode}</small>{row.line.progress.replacementRequired && <small>Previous: {row.line.allocations.find((a) => a.returnPurpose === "SWAP" && a.status === "RETURNED")?.asset.assetCode} · {friendly(row.line.allocations.find((a) => a.returnPurpose === "SWAP" && a.status === "RETURNED")?.swapReason || "Swap")}</small>}</td><td>{verified(row.allocation)}</td><td>{row.line.preparedRecipient?.fullName || "Not set"}<small>{locations.find((l) => l.id === row.line.specificLocationId)?.displayPath || row.line.specificLocation?.name || "Not set"}</small></td><td>{state(row)}</td><td>{actions(row)}</td></tr>)}</tbody></table></div>}
      </section>;
    }) : <div className="request-table-scroll table-panel"><table className="data-table"><thead><tr><th>Job / Asset</th><th>Requirement</th>{tab === "Issue & Confirmation" ? <><th>Root / Specific Location</th><th>Recipient / Confirmed Time</th></> : <th>Return Type</th>}<th>Verified Location</th><th>State</th><th>Action</th></tr></thead><tbody>{rows.map((row) => {
      const a = row.allocation!; const time = a.scanConfirmations?.find((c) => c.confirmationType === "ISSUE_CONFIRMATION")?.confirmedAt;
      return <tr key={row.line.id}><td>{row.request.jobNo || row.request.requestNo}<small>{a.asset.assetCode}</small><small>{a.asset.epc?.epcCode}</small></td><td>{requirement(row.line)}</td>{tab === "Issue & Confirmation" ? <><td>{row.request.rootLocation?.name || "Legacy — not set"}<small>Specific: {locations.find((l) => l.id === (a.assignment?.location?.id ?? row.line.specificLocationId))?.displayPath || a.assignment?.location?.name || row.line.specificLocation?.name || "—"}</small></td><td>{a.assignment?.assignedToUser.fullName || row.line.preparedRecipient?.fullName || "—"}<small>{time ? new Date(time).toLocaleString() : "—"}</small></td></> : <td>{a.returnPurpose === "SWAP" ? "Asset Swap" : "Normal Return"}<small>{a.swapReason && friendly(a.swapReason)}</small></td>}<td>{verified(a)}</td><td>{state(row)}</td><td>{actions(row)}</td></tr>;
    })}</tbody></table></div>}
    {creating && <Dialog title={editing ? "Edit Request" : "New Asset Request"} busy={busy} onClose={() => setCreating(false)}>{error && <div className="error-box" role="alert">{error}</div>}<form onSubmit={create}><div className="form-grid"><label className="form-field">Job No. *<input disabled={!!editing && issuedHistory(editing)} autoFocus required maxLength={191} value={jobNo} onChange={(e) => setJobNo(e.target.value)} placeholder="Enter / Scan Job No." /></label><Select disabled={!!editing && issuedHistory(editing)} required={!editing || !!editing.rootLocationId} label="To Location *" value={newRoot} change={setNewRoot} options={rootOptions.filter((l) => l.isActive)} /><label className="form-field">Remarks<input maxLength={191} value={newRemarks} onChange={(e) => setNewRemarks(e.target.value)} /></label></div><h4>Requirements · one physical Asset per line</h4>{editing && <p>Cancel Selection before changing a reserved specification. Issued/confirmed requirements are locked; use Swap Asset. Shared Job/root fields lock after the first issue.</p>}
      {requirements.map((r, index) => <fieldset key={index}><legend>Requirement {index + 1}</legend><div className="form-grid">{(["assetCategoryId", "measurementHeight", "measurementWidth", "remarks"] as const).map((key) => {
        const prior = editing?.lines.find((l) => l.id === r.id);
        const locked = !!prior && lockedLine(prior);
        const specLocked = !!prior && prior.allocations.some((a) => a.status !== "CANCELLED");
        const change = (v: string) => setRequirements((old) => old.map((item, i) => i === index ? { ...item, [key]: v } : item));
        return key === "assetCategoryId" ? <Select disabled={specLocked} key={key} required label="Asset Category *" value={r[key]} change={change} options={categories.filter((c) => c.isActive)} /> : <label key={key} className="form-field">{{ measurementHeight: "Measurement H (mm) *", measurementWidth: "Measurement W (mm) *", remarks: "Remarks" }[key]}<input disabled={key === "remarks" ? locked : specLocked} required={key !== "remarks"} type={key === "remarks" ? "text" : "number"} min="0.01" step="0.01" maxLength={191} value={r[key]} onChange={(e) => change(e.target.value)} /></label>;
      })}
        <Select disabled={!!editing?.lines.find((l) => l.id === r.id && lockedLine(l))} label="Recipient" value={r.preparedRecipientUserId} change={(v) => setRequirements((old) => old.map((item, i) => i === index ? { ...item, preparedRecipientUserId: v } : item))} options={userOptions.filter((u) => users.find((v) => v.id === u.id)?.isActive)} />
        <Select disabled={!!editing?.lines.find((l) => l.id === r.id && lockedLine(l))} label="Specific Location" value={r.specificLocationId} change={(v) => setRequirements((old) => old.map((item, i) => i === index ? { ...item, specificLocationId: v } : item))} options={locations.filter((l) => l.isActive && (newRoot ? withinRoot(l, Number(newRoot), locations) : ["PRODUCTION_AREA", "MACHINE_LOCATION"].includes(l.locationType))).map((l) => ({ id: l.id, name: l.displayPath || l.name }))} />
      </div>{requirements.length > 1 && !editing?.lines.find((l) => l.id === r.id && l.allocations.length > 0) && <button type="button" className="secondary-button" onClick={() => setRequirements((old) => old.filter((_, i) => i !== index))}>Remove Requirement</button>}</fieldset>)}
      <div className="form-actions"><button disabled={!!editing && issuedHistory(editing)} type="button" className="secondary-button" onClick={() => setRequirements((old) => [...old, emptyRequirement()])}>+ Add Requirement</button><button className="primary-button" disabled={busy}>{editing ? "Save Request" : "Create Request"}</button></div></form></Dialog>}
    {target && <Dialog title={titles[target.action]} busy={busy} onClose={() => setTarget(null)}>{error && <div className="error-box" role="alert">{error}</div>}
      <dl className="request-facts"><div><dt>Job / Request</dt><dd>{target.request.jobNo || "Legacy"} / {target.request.requestNo}</dd></div><div><dt>Requirement</dt><dd>{requirement(target.line)}</dd></div><div><dt>Root Location</dt><dd>{target.request.rootLocation?.name || "Legacy — not set"}</dd></div>{target.allocation && <><div><dt>Asset / Expected EPC</dt><dd>{target.allocation.asset.assetCode}<small>{target.allocation.asset.epc?.epcCode}</small></dd></div><div><dt>Registered/Home Location</dt><dd>{target.allocation.asset.homeLocationPath || "Unresolved — verify registered storage before return"}</dd></div><div><dt>Current verified Location</dt><dd>{verified(target.allocation)}</dd></div><div><dt>Recipient / Specific Location</dt><dd>{target.allocation.assignment?.assignedToUser.fullName || target.line.preparedRecipient?.fullName || "—"} / {locations.find((l) => l.id === target.allocation?.assignment?.location?.id)?.displayPath || target.allocation.assignment?.location?.name || "—"}</dd></div><div><dt>Return Type</dt><dd>{target.allocation.returnPurpose === "SWAP" ? "Asset Swap" : "Normal Return"}{target.allocation.swapReason && <small>{friendly(target.allocation.swapReason)} · {target.allocation.swapRemarks}</small>}</dd></div><div><dt>Issued At</dt><dd>{target.allocation.assignment?.issuedAt ? new Date(target.allocation.assignment.issuedAt).toLocaleString() : "—"}</dd></div></>}</dl>
      {target.action === "find" ? <><label className="form-field">Filter exact matches<input autoFocus placeholder="Asset code, name, location, measurement, EPC" value={assetSearch} onChange={(e) => setAssetSearch(e.target.value)} /></label><p>Active, Available Assets matching the exact Category and H × W only.</p><div className="request-table-scroll"><table className="data-table"><thead><tr><th>Asset Code / Name</th><th>Measurement</th><th>Current Location</th><th>Condition</th><th>EPC</th><th>Action</th></tr></thead><tbody>{available.filter((a) => [a.assetCode, a.itemName, a.locationPath, a.epc?.epcCode, a.measurementHeight + " × " + a.measurementWidth].some((v) => v?.toLowerCase().includes(assetSearch.toLowerCase()))).map((a) => <tr key={a.id}><td>{a.assetCode}<small>{a.itemName}</small></td><td>{a.measurementHeight} × {a.measurementWidth}</td><td>{a.locationPath}</td><td>{friendly(a.condition)}</td><td>{a.epc?.epcCode}</td><td><button disabled={busy} className="table-button" onClick={() => run(() => reserveAssetApi(target.request.id, target.line.id, a.id), "Asset selected and Reserved.")}>Select Asset</button></td></tr>)}</tbody></table></div>{!busy && available.length === 0 && <p>No exact Available matches.</p>}</> : target.action === "history" ? <div className="request-table-scroll"><table className="data-table"><thead><tr><th>Allocation / Asset</th><th>Status / Return Type</th><th>Swap Reason</th><th>History</th></tr></thead><tbody>{target.line.allocations.map((a) => <tr key={a.id}><td>#{a.id} · {a.asset.assetCode}</td><td>{friendly(a.status)}<small>{a.returnPurpose === "SWAP" ? "Asset Swap" : "Normal Return"}</small></td><td>{a.swapReason ? friendly(a.swapReason) : "—"}<small>{a.swapRemarks}</small></td><td><small>Selected {new Date(a.reservedAt).toLocaleString()} by {a.reservedBy.fullName}</small>{a.cancelledAt && <small>Cancelled {new Date(a.cancelledAt).toLocaleString()}</small>}{a.scanConfirmations?.map((c) => <small key={c.id}>{friendly(c.confirmationType)} · {new Date(c.confirmedAt).toLocaleString()} · {c.confirmedBy.fullName} · {c.confirmationSource} · {c.epc}</small>)}{a.assignment?.returnedAt && <small>Returned {new Date(a.assignment.returnedAt).toLocaleString()} · {a.assignment.returnLocation?.name} · {a.assignment.returnCondition}</small>}</td></tr>)}</tbody></table></div> :
      <form onSubmit={submitAction}><div className="form-grid">
        {target.action === "prepare" && <><Select required label="Recipient *" value={actionRecipient} change={setActionRecipient} options={userOptions.filter((u) => users.find((v) => v.id === u.id)?.isActive)} /><Select required label="Specific Location *" value={actionLocation} change={setActionLocation} options={destinations} /></>}
        {["confirmIssue", "confirmReturn"].includes(target.action) && <label className="form-field">Paste / Enter EPC *<input autoFocus required value={epc} onChange={(e) => setEpc(e.target.value)} autoComplete="off" /></label>}
        {target.action === "swap" && <Select required label="Swap Reason *" value={reason} change={setReason} options={choices(reasons)} />}
        {["confirmReturn", "legacyReturn"].includes(target.action) && <><Select required label="Condition *" value={condition} change={setCondition} options={choices(["NEW", "GOOD", "FAIR", "POOR", "DAMAGED"])} /><div className="form-field">Return Location (registered/home)<strong>{target.allocation?.asset.homeLocationPath || "Unresolved — administrator verification required"}</strong></div></>}
        {target.action !== "cancel" && target.action !== "prepare" && <label className="form-field">Remarks{target.action === "swap" && reason === "OTHER" ? " *" : ""}<textarea maxLength={191} required={target.action === "swap" && reason === "OTHER"} value={remarks} onChange={(e) => setRemarks(e.target.value)} /></label>}
      </div>{target.action === "cancel" && <p>Release this reserved Asset? The cancelled allocation will remain in history.</p>}{["issue", "swap", "initiateReturn"].includes(target.action) && <p>Physical location and movement history change only after successful EPC confirmation.</p>}{target.action === "legacyReturn" && <p>This historical one-step assignment retains its original direct-return behavior.</p>}<div className="form-actions"><button className="primary-button" disabled={busy || (["confirmReturn", "legacyReturn"].includes(target.action) && !target.allocation?.asset.homeLocationId)}>{busy ? "Processing…" : titles[target.action]}</button></div></form>}
    </Dialog>}
  </div>;
}
