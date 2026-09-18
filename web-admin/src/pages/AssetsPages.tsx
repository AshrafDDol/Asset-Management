import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Plus, RefreshCw } from "lucide-react";
import { assignOrReplaceAssetEpcApi, type Asset } from "../api/assets.api";
import { DatePicker } from "@/components/common/DatePicker";
import { useErrorToast } from "@/hooks/useErrorToast";
import { ErrorBox, SuccessBox } from "@/components/common/ErrorBox";
import { Field } from "@/components/common/FilterCard";
import { PageHeader } from "@/components/common/PageHeader";
import { ORDER_OPTIONS, SelectField } from "@/components/common/SelectField";
import { TableCard } from "@/components/common/TableCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  addAssetsToIssueBatchApi,
  cancelHandheldSwapApi,
  createIssueBatchApi,
  confirmHandheldSwapApi,
  getHandheldSwapApi,
  getIssueBatchesApi,
  prepareHandheldSwapApi,
  swapIssueBatchAssetApi,
  verifyHandheldSwapEpcApi,
  type IssueBatch,
  type IssueBatchItem,
} from "../api/issueBatches.api";
import { getUsersApi, type User } from "../api/users.api";
import type { Location } from "../api/locations.api";
import { useAssetsPagesFunction } from "./functionPages/AssetsPagesFunction";
import { useNavigate } from "react-router-dom";
import { ConfirmDeleteDialog } from "../components/MasterDataModal";
import { LocationTreeSelect } from "../components/LocationTreeSelect";
import { chronological, type ListOrder } from "../utils/listOrder";
import { locationDisplayName } from "../utils/locationDisplay";
import { AssetColumnSelector } from "../components/AssetColumnSelector";
import { AssetDetailsModal } from "../components/AssetDetailsModal";
import { cancelRepairTaskApi, getRepairsApi, prepareCompleteRepairApi, prepareStartRepairApi, type AssetRepair } from "../api/repairs.api";
import {
  displayValue,
  formatBladeDetails,
  formatGap,
  formatMeasurement,
  formatPurchaseDate,
  formatRadius,
} from "../utils/assetDisplay";
import {
  ASSET_COLUMN_OPTIONS,
  DEFAULT_ASSET_COLUMNS,
  normalizeAssetColumns,
  type AssetColumnId,
} from "../utils/assetColumns";

const hasActiveEpc = (asset: Asset) =>
  !!asset.epc?.isActive && asset.epc.status === "ACTIVE";
const epcMutable = (asset: Asset) =>
  asset.isActive !== false &&
  ["AVAILABLE", "RESERVED"].includes(asset.status || "");
const apiError = (error: unknown) =>
  (error as { response?: { data?: { message?: string } }; message?: string })
    .response?.data?.message ||
  (error as { message?: string }).message ||
  "Failed to save EPC.";
const operational = (location: Location) =>
  !!location.isActive &&
  ["PRODUCTION_AREA", "MACHINE_LOCATION"].includes(location.locationType);
const storageLocation = (location: Location) =>
  !!location.isActive &&
  ["STORE", "WAREHOUSE", "RACK", "LEVEL", "BIN", "FILE"].includes(
    location.locationType
  );
const ASSET_COLUMNS_KEY = "ims-assets-table-columns";
const assetColumnLabel = new Map(
  ASSET_COLUMN_OPTIONS.map((option) => [option.id, option.label])
);
const activeBatch = (batch: IssueBatch) =>
  ["PREPARING", "PROCESSING"].includes(batch.status);
const normalizedJob = (value?: string | null) =>
  value?.trim().toLowerCase() || "";
const batchCounts = (batch: IssueBatch) => ({
  awaiting: batch.items.filter((item) => item.status === "ISSUED").length,
  inUse: batch.items.filter((item) => item.status === "CONFIRMED").length,
  returned: batch.items.filter((item) => item.status === "RETURNED").length,
});
const batchState = (batch: IssueBatch) => {
  const counts = batchCounts(batch);
  if (batch.status === "COMPLETED") return "Completed";
  if (batch.status === "CANCELLED") return "Cancelled";
  if (counts.returned && counts.inUse) return "Partially Returned";
  if (counts.awaiting) return "Awaiting Confirmation";
  if (counts.inUse) return "In Use";
  return "Preparing";
};
const eligibility = (asset: Asset) => {
  if (asset.isActive === false) return "Asset is inactive";
  if (asset.status !== "AVAILABLE") return `Status is ${asset.status}`;
  if (!hasActiveEpc(asset)) return "Active EPC is missing";
  if (!asset.homeLocationId || !asset.homeLocation?.isActive)
    return "Active home location is unresolved";
  return "";
};

function PrepareIssueDialog({
  assets,
  locations,
  close,
  complete,
}: {
  assets: Asset[];
  locations: Location[];
  close: () => void;
  complete: (count: number, message?: string) => Promise<void>;
}) {
  const [users, setUsers] = useState<User[]>([]);
  const [batches, setBatches] = useState<IssueBatch[]>([]);
  const [jobNo, setJobNo] = useState("");
  const [selectedBatchId, setSelectedBatchId] = useState<number | null>(null);
  const [remarks, setRemarks] = useState("");
  const [recipient, setRecipient] = useState("");
  const [destination, setDestination] = useState("");
  const [rows, setRows] = useState<
    Record<number, { recipient: string; destination: string }>
  >({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [swapOpen, setSwapOpen] = useState(false);
  const [swapTarget, setSwapTarget] = useState<IssueBatchItem | null>(null);
  const [swapRemarks, setSwapRemarks] = useState("");
  const [swapOldEpc, setSwapOldEpc] = useState("");
  const [swapOldVerified, setSwapOldVerified] = useState(false);
  const [swapVerificationError, setSwapVerificationError] = useState("");
  useEffect(() => {
    void Promise.all([getUsersApi(), getIssueBatchesApi()])
      .then(([loadedUsers, loadedBatches]) => {
        setUsers(loadedUsers);
        setBatches(loadedBatches);
      })
      .catch((caught) => setError(apiError(caught)));
  }, []);
  useErrorToast(error);

  const apply = (field: "recipient" | "destination", value: string) => {
    if (field === "recipient") setRecipient(value);
    else setDestination(value);
    setRows(
      Object.fromEntries(
        assets.map((asset) => [
          asset.id,
          {
            recipient:
              field === "recipient"
                ? value
                : rows[asset.id]?.recipient || recipient,
            destination:
              field === "destination"
                ? value
                : rows[asset.id]?.destination || destination,
          },
        ])
      )
    );
  };
  const jobMatches = jobNo.trim()
    ? batches.filter((batch) =>
        normalizedJob(batch.jobNo).includes(normalizedJob(jobNo))
      )
    : [];
  const exactMatches = batches.filter(
    (batch) =>
      normalizedJob(batch.jobNo) === normalizedJob(jobNo) &&
      normalizedJob(jobNo)
  );
  const selectedBatch =
    batches.find((batch) => batch.id === selectedBatchId) || null;
  const isAmbiguous = (batch: IssueBatch) =>
    batches.filter(
      (candidate) =>
        activeBatch(candidate) &&
        normalizedJob(candidate.jobNo) === normalizedJob(batch.jobNo)
    ).length > 1;
  const swapCandidates =
    selectedBatch?.items.filter(
      (item) =>
        !!item.handheldSwapTasks?.length ||
        (item.status === "ISSUED" &&
          item.asset.status === "PENDING_CONFIRMATION") ||
        (item.status === "CONFIRMED" && item.asset.status === "IN_USE")
    ) || [];
  async function performSwap(target: IssueBatchItem) {
    if (!selectedBatch || assets.length !== 1) return;
    setBusy(true);
    setError("");
    try {
      await swapIssueBatchAssetApi(selectedBatch.id, {
        replacementAssetId: assets[0].id,
        targetItemId: target.id,
        remarks: swapRemarks || undefined,
      });
      await complete(
        1,
        `${target.asset.assetCode} replaced by ${assets[0].assetCode}.`
      );
    } catch (caught) {
      setError(apiError(caught));
      setSwapOpen(false);
      setSwapTarget(null);
    } finally {
      setBusy(false);
    }
  }
  function verifyOldEpcBeforePreparation(target: IssueBatchItem) {
    const scanned = swapOldEpc.trim().toUpperCase();
    const expected = target.asset.epc?.epcCode?.trim().toUpperCase() || "";
    if (!scanned || scanned !== expected) {
      setSwapOldVerified(false);
      setSwapVerificationError(`EPC does not match ${target.asset.assetCode}`);
      return;
    }
    setSwapOldEpc(scanned);
    setSwapOldVerified(true);
    setSwapVerificationError("");
  }
  async function prepareHandheldSwap(target: IssueBatchItem) {
    if (!selectedBatch || assets.length !== 1) return;
    setBusy(true);
    setError("");
    try {
      await prepareHandheldSwapApi({
        issueBatchId: selectedBatch.id,
        replacementAssetId: assets[0].id,
        targetItemId: target.id,
        remarks: swapRemarks || undefined,
        oldVerifiedEpc: swapOldVerified ? swapOldEpc.trim().toUpperCase() : undefined,
      });
      await complete(
        1,
        `Handheld Swap prepared for ${target.asset.assetCode}.`
      );
    } catch (caught) {
      setError(apiError(caught));
    } finally {
      setBusy(false);
    }
  }
  async function cancelPendingHandheldSwap(item: IssueBatchItem) {
    const task = item.handheldSwapTasks?.[0];
    if (
      !task ||
      !window.confirm(
        `Cancel the pending Handheld Swap for ${item.asset.assetCode}?`
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      await cancelHandheldSwapApi(task.id, "Cancelled from Swap Asset popup");
      setBatches(await getIssueBatchesApi());
    } catch (caught) {
      setError(apiError(caught));
    } finally {
      setBusy(false);
    }
  }
  async function verifyPendingHandheldSwap(item: IssueBatchItem) {
    const taskId = item.handheldSwapTasks?.[0]?.id;
    if (!taskId) return;
    setBusy(true);
    setError("");
    try {
      const task = await getHandheldSwapApi(taskId);
      const normalize = (value?: string | null) => value?.trim().toUpperCase() || "";
      const oldEpc = normalize(task.targetItem.asset.epc?.epcCode);
      const newEpc = normalize(task.replacementAsset.epc?.epcCode);
      const oldVerified = normalize(task.oldVerifiedEpc) === oldEpc;
      const newVerified = normalize(task.newVerifiedEpc) === newEpc;
      if (oldVerified && newVerified) {
        if (window.confirm("Both EPCs are verified. Confirm this Swap now?")) {
          await confirmHandheldSwapApi(task.id, oldEpc, newEpc);
          await complete(1, "Swap confirmed.");
        }
        return;
      }
      const step = oldVerified ? "REPLACEMENT" : "OLD";
      const scanned = window.prompt(
        step === "OLD" ? "Scan the existing / old Asset EPC" : "Scan the replacement Asset EPC"
      );
      if (scanned === null) return;
      const updated = await verifyHandheldSwapEpcApi(task.id, step, scanned);
      const completed = normalize(updated.oldVerifiedEpc) === oldEpc && normalize(updated.newVerifiedEpc) === newEpc;
      setBatches(await getIssueBatchesApi());
      if (completed && window.confirm("Both EPCs are verified. Confirm this Swap now?")) {
        await confirmHandheldSwapApi(task.id, oldEpc, newEpc);
        await complete(1, "Swap confirmed.");
      }
    } catch (caught) {
      setError(apiError(caught));
    } finally {
      setBusy(false);
    }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    const normalizedJobNo = jobNo.trim();
    if (!normalizedJobNo) {
      setError("Job No. is required.");
      return;
    }
    if (!selectedBatch && exactMatches.length) {
      setError(
        exactMatches.filter(activeBatch).length > 1
          ? `Job No. "${normalizedJobNo}" has multiple active Issue Batches and must be resolved before Assets can be added.`
          : activeBatch(exactMatches[0])
          ? "Select the existing Job to add Assets."
          : exactMatches[0].status === "COMPLETED"
          ? `${exactMatches[0].jobNo} is already completed.`
          : `${exactMatches[0].jobNo} was cancelled.`
      );
      return;
    }
    setBusy(true);
    setError("");
    try {
      const items = assets.map((asset) => ({
        assetId: asset.id,
        recipientUserId:
          Number(rows[asset.id]?.recipient || recipient) || undefined,
        toLocationId:
          Number(rows[asset.id]?.destination || destination) || undefined,
      }));
      const payload = {
        assetIds: assets.map((asset) => asset.id),
        jobNo: normalizedJobNo,
        defaultRecipientUserId: Number(recipient) || undefined,
        defaultToLocationId: Number(destination) || undefined,
        remarks: remarks || undefined,
        items,
      };
      if (selectedBatch)
        await addAssetsToIssueBatchApi(selectedBatch.id, payload);
      else await createIssueBatchApi(payload);
      await complete(assets.length);
    } catch (caught) {
      setError(apiError(caught));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next && !busy) close();
      }}
    >
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-6xl">
        <DialogHeader className="shrink-0 border-b px-6 py-4">
          <DialogTitle>Prepare Issue Batch</DialogTitle>
          <DialogDescription>{assets.length} exact physical Assets selected</DialogDescription>
        </DialogHeader>

        <form
          id="prepare-issue-form"
          onSubmit={submit}
          className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-5"
        >
          <ErrorBox message={error} />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="relative space-y-2">
              <Label htmlFor="prepare-job-no">Job No. *</Label>
              <Input
                id="prepare-job-no"
                required
                role="combobox"
                aria-expanded={!selectedBatch && jobMatches.length > 0}
                value={jobNo}
                onChange={(e) => {
                  setJobNo(e.target.value);
                  setSelectedBatchId(null);
                  setError("");
                }}
              />
              {!selectedBatch &&
                jobNo.trim() &&
                (jobMatches.length ? (
                  <div className="absolute top-full z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-md border bg-popover p-1 shadow-md">
                    {jobMatches.map((batch) => {
                      const counts = batchCounts(batch);
                      const ambiguous = isAmbiguous(batch);
                      return (
                        <button
                          type="button"
                          key={batch.id}
                          disabled={!activeBatch(batch) || ambiguous}
                          className="w-full rounded-sm px-2 py-1.5 text-left hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
                          onClick={() => {
                            setSelectedBatchId(batch.id);
                            setJobNo(batch.jobNo || "");
                            setError("");
                          }}
                        >
                          <div className="text-sm font-medium">{batch.jobNo}</div>
                          <div className="text-xs text-muted-foreground">
                            {batchState(batch)} · {batch.batchNo}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {counts.awaiting} Awaiting · {counts.inUse} In Use · {counts.returned}{" "}
                            Returned · {new Date(batch.createdAt).toLocaleDateString()}
                            {ambiguous ? " · Multiple active batches" : ""}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    No existing Job found. A new Job will be created.
                  </p>
                ))}
            </div>

            <Field label="Apply Recipient to all" htmlFor="prepare-recipient">
              <SelectField
                id="prepare-recipient"
                value={recipient}
                onChange={(value) => apply("recipient", value)}
                emptyLabel="Not set"
                placeholder="Not set"
                options={users
                  .filter((u) => u.isActive !== false)
                  .map((u) => ({ value: String(u.id), label: u.fullName || u.username }))}
              />
            </Field>

            <Field label="Apply To Location to all">
              <LocationTreeSelect
                locations={locations}
                selectedLocationId={destination}
                onChange={(id) => apply("destination", String(id))}
                allowedLocation={operational}
                placeholder="Not set"
              />
            </Field>

            <Field label="Remarks" htmlFor="prepare-remarks">
              <Input
                id="prepare-remarks"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
              />
            </Field>
          </div>

          {selectedBatch && (
            <div className="rounded-lg border bg-muted/40 p-4 text-sm">
              <div className="font-medium">Existing Job · {selectedBatch.jobNo}</div>
              <div className="text-muted-foreground">
                Issue Batch: {selectedBatch.batchNo} · Status: {batchState(selectedBatch)}
              </div>
              <div className="text-muted-foreground">
                Awaiting Confirmation: {batchCounts(selectedBatch).awaiting} · In Use:{" "}
                {batchCounts(selectedBatch).inUse} · Returned: {batchCounts(selectedBatch).returned}
              </div>
            </div>
          )}

          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Asset</TableHead>
                  <TableHead>Item / Category</TableHead>
                  <TableHead>Measurement</TableHead>
                  <TableHead>EPC</TableHead>
                  <TableHead>Current Location</TableHead>
                  <TableHead className="min-w-44">Recipient</TableHead>
                  <TableHead className="min-w-56">To Location</TableHead>
                  <TableHead>State</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assets.map((asset) => (
                  <TableRow key={asset.id}>
                    <TableCell className="font-mono text-xs">{asset.assetCode}</TableCell>
                    <TableCell>
                      <div className="font-medium">{asset.itemName}</div>
                      <div className="text-xs text-muted-foreground">{asset.category?.name}</div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {asset.measurementHeight ?? "-"} × {asset.measurementWidth ?? "-"}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{asset.epc?.epcCode}</TableCell>
                    <TableCell>{locationDisplayName(asset.location)}</TableCell>
                    <TableCell>
                      <SelectField
                        value={rows[asset.id]?.recipient || recipient}
                        onChange={(value) =>
                          setRows({
                            ...rows,
                            [asset.id]: {
                              recipient: value,
                              destination: rows[asset.id]?.destination || destination,
                            },
                          })
                        }
                        emptyLabel="Not set yet"
                        placeholder="Not set yet"
                        options={users
                          .filter((u) => u.isActive !== false)
                          .map((u) => ({ value: String(u.id), label: u.fullName || u.username }))}
                      />
                    </TableCell>
                    <TableCell>
                      <LocationTreeSelect
                        locations={locations}
                        selectedLocationId={rows[asset.id]?.destination || destination}
                        onChange={(id) =>
                          setRows({
                            ...rows,
                            [asset.id]: {
                              recipient: rows[asset.id]?.recipient || recipient,
                              destination: String(id),
                            },
                          })
                        }
                        allowedLocation={operational}
                        placeholder="Not set yet"
                      />
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      Ready to reserve
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

        </form>

        <DialogFooter className="mx-0 mb-0 shrink-0 items-center px-6 py-5">
          {selectedBatch && assets.length !== 1 && (
              <span className="mr-auto text-xs text-muted-foreground">
                Swap Asset requires exactly one replacement Asset.
              </span>
            )}
            <Button type="button" variant="outline" onClick={close}>
              Close
            </Button>
            {selectedBatch && (
              <Button
                type="button"
                variant="outline"
                disabled={busy || assets.length !== 1}
                title={
                  assets.length !== 1
                    ? "Swap Asset requires exactly one replacement Asset."
                    : "Replace an awaiting or in-use Job Asset"
                }
                onClick={() => {
                  setSwapOpen(true);
                  setSwapTarget(null);
                  setSwapRemarks("");
                  setSwapOldEpc("");
                  setSwapOldVerified(false);
                  setSwapVerificationError("");
                }}
              >
                Swap Asset
              </Button>
            )}
            <Button form="prepare-issue-form" type="submit" disabled={busy}>
              {busy ? "Saving..." : selectedBatch ? "Add to Job" : "Create Issue Batch"}
            </Button>
        </DialogFooter>

        {/* Swap flow, nested above the preparation dialog */}
        <Dialog
          open={swapOpen && !!selectedBatch && assets.length === 1}
          onOpenChange={(next) => {
            if (!next && !busy) {
              setSwapOpen(false);
              setSwapTarget(null);
            }
          }}
        >
          <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl">
            {selectedBatch && assets.length === 1 && (
              <>
                <DialogHeader className="shrink-0 border-b px-6 py-4">
                  <DialogTitle>Swap Asset - {selectedBatch.jobNo}</DialogTitle>
                  <DialogDescription>
                    The selected Asset is the replacement and will await normal EPC confirmation.
                  </DialogDescription>
                </DialogHeader>

                <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
                <div className="rounded-lg border bg-muted/40 p-4 text-sm">
                  <div className="font-medium">Replacement Asset</div>
                  <div className="text-muted-foreground">
                    {assets[0].assetCode} · {assets[0].itemName} / {assets[0].category?.name || "—"}
                  </div>
                  <div className="text-muted-foreground">
                    {assets[0].measurementHeight ?? "—"} × {assets[0].measurementWidth ?? "—"} mm ·
                    EPC: {assets[0].epc?.epcCode || "—"}
                  </div>
                  <div className="text-muted-foreground">
                    Current Location: {locationDisplayName(assets[0].location)}
                  </div>
                </div>

                {swapTarget ? (
                  <form
                    className="space-y-4"
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (swapTarget.status === "ISSUED") void performSwap(swapTarget);
                      else void prepareHandheldSwap(swapTarget);
                    }}
                  >
                    <h4 className="text-sm font-semibold">
                      {swapTarget.status === "ISSUED"
                        ? "Replace Pending Selection"
                        : "Prepare Handheld Swap"}
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      Existing: <span className="font-medium text-foreground">{swapTarget.asset.assetCode}</span>
                    </p>

                    {swapTarget.status === "CONFIRMED" && (
                      <div className="space-y-3 rounded-lg border p-4">
                        <div className="text-sm font-medium">Existing Asset</div>
                        <div className="font-mono text-sm">{swapTarget.asset.assetCode}</div>
                        <Badge variant={swapOldVerified ? "secondary" : "outline"}>
                          {swapOldVerified ? "✓ Old EPC Verified" : "Waiting"}
                        </Badge>

                        {!swapOldVerified && (
                          <Field label="Scan / Enter Old EPC" htmlFor="swap-old-epc">
                            <Input
                              id="swap-old-epc"
                              autoFocus
                              value={swapOldEpc}
                              onChange={(event) => {
                                setSwapOldEpc(event.target.value);
                                setSwapOldVerified(false);
                                setSwapVerificationError("");
                              }}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  event.preventDefault();
                                  verifyOldEpcBeforePreparation(swapTarget);
                                }
                              }}
                            />
                          </Field>
                        )}

                        <ErrorBox message={swapVerificationError} />

                        {!swapOldVerified && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => verifyOldEpcBeforePreparation(swapTarget)}
                          >
                            Verify Old EPC
                          </Button>
                        )}
                      </div>
                    )}

                    <Field label="Remarks (optional)" htmlFor="swap-remarks">
                      <Input
                        id="swap-remarks"
                        value={swapRemarks}
                        onChange={(event) => setSwapRemarks(event.target.value)}
                      />
                    </Field>

                    <DialogFooter>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setSwapTarget(null);
                          setSwapOldEpc("");
                          setSwapOldVerified(false);
                          setSwapVerificationError("");
                        }}
                      >
                        Back
                      </Button>
                      <Button disabled={busy}>
                        {busy
                          ? "Saving..."
                          : swapTarget.status === "ISSUED"
                            ? "Replace Selection"
                            : "Create Handheld Swap"}
                      </Button>
                    </DialogFooter>
                  </form>
                ) : (
                  <div className="space-y-3">
                    <h4 className="text-sm font-semibold">Select Asset to Replace</h4>
                    {swapCandidates.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No awaiting-confirmation or in-use Assets are eligible in this Job.
                      </p>
                    ) : (
                      <div className="overflow-x-auto rounded-md border">
                        <Table>
                          <TableHeader>
                            <TableRow className="hover:bg-transparent">
                              <TableHead>Asset</TableHead>
                              <TableHead>Item / Category</TableHead>
                              <TableHead>Measurement</TableHead>
                              <TableHead>EPC</TableHead>
                              <TableHead>Current Location</TableHead>
                              <TableHead>Recipient</TableHead>
                              <TableHead>To Location</TableHead>
                              <TableHead>State</TableHead>
                              <TableHead>Action</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {swapCandidates.map((item) => (
                              <TableRow key={item.id}>
                                <TableCell className="font-mono text-xs">
                                  {item.asset.assetCode}
                                </TableCell>
                                <TableCell>
                                  <div className="font-medium">{item.asset.itemName}</div>
                                  <div className="text-xs text-muted-foreground">
                                    {item.asset.category?.name || "—"}
                                  </div>
                                </TableCell>
                                <TableCell className="whitespace-nowrap">
                                  {item.asset.measurementHeight ?? "—"} ×{" "}
                                  {item.asset.measurementWidth ?? "—"} mm
                                </TableCell>
                                <TableCell className="font-mono text-xs">
                                  {item.asset.epc?.epcCode || "—"}
                                </TableCell>
                                <TableCell>{locationDisplayName(item.asset.location)}</TableCell>
                                <TableCell>
                                  {item.recipient?.fullName || item.recipient?.username || "—"}
                                </TableCell>
                                <TableCell>
                                  {item.toLocation?.displayPath || item.toLocation?.name || "—"}
                                </TableCell>
                                <TableCell>
                                  <Badge variant="outline" className="whitespace-nowrap">
                                    {item.handheldSwapTasks?.length
                                      ? "Awaiting Swap"
                                      : item.status === "ISSUED"
                                        ? "Awaiting EPC Confirmation"
                                        : "In Use"}
                                  </Badge>
                                  {item.handheldSwapTasks?.[0] && (
                                    <div className="mt-1 text-xs text-muted-foreground">
                                      Existing{" "}
                                      {item.handheldSwapTasks[0].oldVerifiedEpc
                                        ? "✓ Verified"
                                        : "Waiting"}
                                      <br />
                                      Replacement{" "}
                                      {item.handheldSwapTasks[0].newVerifiedEpc
                                        ? "✓ Verified"
                                        : "Waiting"}
                                    </div>
                                  )}
                                </TableCell>
                                <TableCell>
                                  {item.handheldSwapTasks?.length ? (
                                    <div className="flex gap-1">
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        disabled={busy}
                                        onClick={() => void verifyPendingHandheldSwap(item)}
                                      >
                                        Verify EPC
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        disabled={busy}
                                        onClick={() => void cancelPendingHandheldSwap(item)}
                                      >
                                        Cancel Handheld Swap
                                      </Button>
                                    </div>
                                  ) : (
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      disabled={busy}
                                      onClick={() => {
                                        setSwapTarget(item);
                                        setSwapOldEpc("");
                                        setSwapOldVerified(false);
                                        setSwapVerificationError("");
                                      }}
                                    >
                                      {item.status === "ISSUED"
                                        ? "Replace Selection"
                                        : "Handheld Swap"}
                                    </Button>
                                  )}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </div>
                )}
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}

function PrepareRepairDialog({ asset, repair, locations, close, complete }: { asset: Asset; repair?: AssetRepair; locations: Location[]; close: () => void; complete: () => Promise<void> }) {
  const [reason, setReason] = useState(repair?.reason || "");
  const [repairLocationId, setRepairLocationId] = useState(repair ? String(repair.repairLocationId) : "");
  const [remarks, setRemarks] = useState(repair?.remarks || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const completing = asset.status === "UNDER_REPAIR";
  useErrorToast(error);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      if (completing) {
        if (!repair) throw new Error("No in-progress Repair was found for this Asset.");
        await prepareCompleteRepairApi(repair.id);
      } else {
        await prepareStartRepairApi({ assetId: asset.id, reason, repairLocationId: Number(repairLocationId), remarks: remarks || undefined });
      }
      toast.success(completing ? "Complete Repair prepared." : "Start Repair prepared.");
      await complete(); close();
    } catch (caught) { setError(apiError(caught)); } finally { setBusy(false); }
  }
  return (
    <Dialog open onOpenChange={(next) => { if (!next && !busy) close(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{completing ? "Prepare Complete Repair" : "Prepare Start Repair"}</DialogTitle>
          <DialogDescription>
            Preparation creates handheld work only and does not change the Asset.
          </DialogDescription>
        </DialogHeader>

        <ErrorBox message={error} />

        <form onSubmit={submit} className="space-y-4">
          <Field label="Asset" htmlFor="repair-asset">
            <Input id="repair-asset" value={`${asset.assetCode} — ${asset.itemName}`} disabled />
          </Field>

          <Field label="Reason" htmlFor="repair-reason">
            <Input
              id="repair-reason"
              required={!completing}
              disabled={completing}
              maxLength={191}
              value={reason}
              onChange={event => setReason(event.target.value)}
            />
          </Field>

          <Field label="Repair Location" htmlFor="repair-location">
            <SelectField
              id="repair-location"
              value={repairLocationId}
              onChange={setRepairLocationId}
              disabled={completing}
              placeholder="Select Repair Location"
              options={locations
                .filter(location => location.isActive !== false)
                .map(location => ({
                  value: String(location.id),
                  label: `${location.name} (${location.locationCode})`,
                }))}
            />
          </Field>

          <Field label="Remarks" htmlFor="repair-remarks">
            <Input
              id="repair-remarks"
              disabled={completing}
              maxLength={191}
              value={remarks}
              onChange={event => setRemarks(event.target.value)}
              placeholder="Optional"
            />
          </Field>

          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={close}>
              Close
            </Button>
            <Button disabled={busy}>{busy ? "Preparing..." : "Confirm"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AssetEpcDialog({
  asset,
  close,
  refresh,
}: {
  asset: Asset;
  close: () => void;
  refresh: () => Promise<void>;
}) {
  const replacing = hasActiveEpc(asset);
  const [autoGenerate, setAutoGenerate] = useState(true);
  const [epcCode, setEpcCode] = useState("");
  const [remarks, setRemarks] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [savedEpc, setSavedEpc] = useState("");
  useErrorToast(error);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSavedEpc("");
    try {
      const result = await assignOrReplaceAssetEpcApi(asset.id, {
        autoGenerateEpc: autoGenerate,
        epcCode: autoGenerate ? undefined : epcCode.trim().toUpperCase(),
        remarks,
      });
      setSavedEpc(result.epcCode);
      toast.success(replacing ? `EPC replaced: ${result.epcCode}` : `EPC assigned: ${result.epcCode}`);
      await refresh();
    } catch (caught) {
      setError(apiError(caught));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next && !busy) close();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{replacing ? "Replace EPC" : "Assign EPC"}</DialogTitle>
          <DialogDescription>
            {asset.assetCode} · {asset.itemName}
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border p-4">
          <div className="text-xs text-muted-foreground">Current EPC</div>
          <div className="font-mono text-sm font-medium">
            {replacing ? asset.epc?.epcCode : "Not Assigned"}
          </div>
          <Badge variant={replacing ? "secondary" : "outline"} className="mt-2">
            {replacing ? "Active" : "Not Assigned"}
          </Badge>
        </div>

        <ErrorBox message={error} />
        {savedEpc && <SuccessBox message={`EPC saved successfully: ${savedEpc}`} />}

        <form onSubmit={submit} className="space-y-4">
          <div className="flex items-center gap-2">
            <Checkbox
              id="epc-auto-generate"
              disabled={!!savedEpc}
              checked={autoGenerate}
              onCheckedChange={(checked) => setAutoGenerate(checked === true)}
            />
            <Label htmlFor="epc-auto-generate" className="font-normal">Auto Generate EPC</Label>
          </div>

          <Field
            label={autoGenerate ? "EPC (generated by server)" : "Manual EPC Entry *"}
            htmlFor="epc-code"
          >
            <Input
              id="epc-code"
              autoFocus={!autoGenerate}
              disabled={autoGenerate || !!savedEpc}
              required={!autoGenerate}
              minLength={2}
              maxLength={191}
              pattern="([0-9A-Fa-f]{2})+"
              value={epcCode}
              onChange={(event) => setEpcCode(event.target.value)}
              placeholder={
                autoGenerate
                  ? "EPC generated after save"
                  : "Hexadecimal only, with an even number of characters"
              }
            />
          </Field>

          <Field label="Remarks" htmlFor="epc-remarks">
            <Input
              id="epc-remarks"
              disabled={!!savedEpc}
              maxLength={191}
              value={remarks}
              onChange={(event) => setRemarks(event.target.value)}
              placeholder="Optional"
            />
          </Field>

          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={close}>
              Close
            </Button>
            <Button disabled={busy || !!savedEpc}>
              {busy ? "Saving..." : savedEpc ? "Saved" : replacing ? "Replace EPC" : "Assign EPC"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
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
  const [columns, setColumns] = useState<AssetColumnId[]>(() => {
    try {
      return normalizeAssetColumns(
        JSON.parse(localStorage.getItem(ASSET_COLUMNS_KEY) || "null")
      );
    } catch {
      return DEFAULT_ASSET_COLUMNS;
    }
  });
  const [assetFormOpen, setAssetFormOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [preparing, setPreparing] = useState(false);
  const [repairAsset, setRepairAsset] = useState<Asset | null>(null);
  const [repairs, setRepairs] = useState<AssetRepair[]>([]);
  const [repairError, setRepairError] = useState("");
  const [filters, setFilters] = useState({
    assetCode: "",
    itemName: "",
    category: "",
    height: "",
    width: "",
    gridUp: "",
    radius: "",
    gapMm: "",
    current: "",
    epc: "",
    condition: "",
    status: "",
  });
  const [order, setOrder] = useState<ListOrder>("LATEST");
  const visible = chronological(
    assets.filter(
      (asset) =>
        (!filters.assetCode ||
          asset.assetCode
            .toLowerCase()
            .includes(filters.assetCode.toLowerCase())) &&
        (!filters.itemName ||
          asset.itemName
            .toLowerCase()
            .includes(filters.itemName.toLowerCase())) &&
        (!filters.category || String(asset.categoryId) === filters.category) &&
        (!filters.height ||
          Number(asset.measurementHeight) === Number(filters.height)) &&
        (!filters.width ||
          Number(asset.measurementWidth) === Number(filters.width)) &&
        (!filters.gridUp || Number(asset.gridUp) === Number(filters.gridUp)) &&
        (!filters.radius || Number(asset.radius) === Number(filters.radius)) &&
        (!filters.gapMm || Number(asset.gapMm) === Number(filters.gapMm)) &&
        (!filters.current || String(asset.locationId) === filters.current) &&
        (!filters.epc ||
          asset.epc?.epcCode.includes(filters.epc.toUpperCase())) &&
        (!filters.condition || asset.condition === filters.condition) &&
        (!filters.status || asset.status === filters.status)
    ),
    (asset) => asset.createdAt,
    order
  );
  const selectedAssets = assets.filter((asset) => selected.has(asset.id));
  const editingAsset = assets.find((asset) => asset.id === editingAssetId);
  const activeRepairByAsset = new Map(repairs.filter(repair => repair.status === "IN_PROGRESS").map(repair => [repair.asset.id, repair]));
  const pendingRepairByAsset = new Map(repairs.flatMap(repair => repair.tasks.filter(task => task.status === "PENDING").map(task => [repair.asset.id, task] as const)));
  const loadRepairs = async () => { try { setRepairError(""); setRepairs(await getRepairsApi()); } catch (caught) { setRepairError(apiError(caught)); } };
  useEffect(() => {
    // Asset master data uses mount-time loading.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadRepairs().catch(() => undefined);
  }, []);
  useErrorToast(error);
  useErrorToast(repairError);
  const setFilter = (name: keyof typeof filters, value: string) =>
    setFilters((old) => ({ ...old, [name]: value }));
  const applyColumns = (next: AssetColumnId[]) => {
    setColumns(next);
    localStorage.setItem(ASSET_COLUMNS_KEY, JSON.stringify(next));
    setColumnSelectorOpen(false);
  };
  const renderAssetCell = (asset: Asset, column: AssetColumnId) => {
    switch (column) {
      case "assetCode":
        return (
          <button
            className="font-mono text-xs font-medium text-primary underline-offset-4 hover:underline"
            type="button"
            onClick={() => setViewAsset(asset)}
            aria-label={`View details for ${asset.assetCode}`}
          >
            {asset.assetCode}
          </button>
        );
      case "itemName":
        return asset.itemName;
      case "category":
        return asset.category?.name || asset.categoryId;
      case "measurement":
        return formatMeasurement(asset);
      case "bladeDetails":
        return formatBladeDetails(asset);
      case "gridUp":
        return asset.gridUp == null ? "—" : `${asset.gridUp} UP`;
      case "radius":
        return formatRadius(asset.radius) || "—";
      case "gapMm":
        return formatGap(asset.gapMm) || "—";
      case "epc":
        return hasActiveEpc(asset) ? (
          <div className="space-y-1">
            <div className="font-mono text-xs">{asset.epc?.epcCode}</div>
            <Badge variant="secondary">Active</Badge>
          </div>
        ) : (
          <Badge variant="outline" className="text-muted-foreground">Not Assigned</Badge>
        );
      case "currentLocation":
        return locationDisplayName(asset.location);
      case "homeLocation":
        return locationDisplayName(asset.homeLocation);
      case "status":
        return asset.status ? (
          <Badge variant="secondary" className="whitespace-nowrap">
            {asset.status
              .toLowerCase()
              .replaceAll("_", " ")
              .replace(/\b\w/g, (letter) => letter.toUpperCase())}
          </Badge>
        ) : (
          "—"
        );
      case "condition":
        return asset.condition || "—";
      case "brand":
        return displayValue(asset.brand);
      case "model":
        return displayValue(asset.model);
      case "serialNumber":
        return displayValue(asset.serialNumber);
      case "purchaseDate":
        return formatPurchaseDate(asset.purchaseDate);
      case "purchaseCost":
        return displayValue(asset.purchaseCost);
      case "action":
        return (
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              type="button"
              onClick={() => {
                handleEditAsset(asset);
                setAssetFormOpen(true);
              }}
            >
              Edit
            </Button>
            {(asset.status === "AVAILABLE" || asset.status === "UNDER_REPAIR") && (
              <Button
                variant="ghost"
                size="sm"
                type="button"
                disabled={pendingRepairByAsset.has(asset.id)}
                onClick={() => setRepairAsset(asset)}
              >
                {pendingRepairByAsset.has(asset.id)
                  ? "Repair Prepared"
                  : asset.status === "UNDER_REPAIR"
                    ? "Prepare Complete Repair"
                    : "Prepare Repair"}
              </Button>
            )}
          </div>
        );
    }
  };

  const pendingRepairTasks = repairs.flatMap((repair) =>
    repair.tasks.filter((task) => task.status === "PENDING").map((task) => ({ repair, task }))
  );

  return (
    <>
      <PageHeader
        title="Assets"
        description="Manage and prepare Assets for issue."
        actions={
          <>
            <Button
              onClick={() => {
                handleCancelEdit();
                setAssetFormOpen(true);
              }}
            >
              <Plus />
              Register Asset
            </Button>
            <Button variant="outline" onClick={() => Promise.all([loadPageData(), loadRepairs()])}>
              <RefreshCw />
              Refresh
            </Button>
          </>
        }
      />

      {!assetFormOpen && <ErrorBox message={error} />}
      <ErrorBox message={repairError} />
      {createdEpc && (
        <SuccessBox message={`Asset registered successfully. Generated EPC: ${createdEpc}`} />
      )}

      {pendingRepairTasks.length > 0 && (
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle className="text-base">Pending Repair Actions</CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            <div className="overflow-x-auto border-t">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Asset</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Repair Location</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingRepairTasks.map(({ repair, task }) => (
                    <TableRow key={task.id}>
                      <TableCell className="font-mono text-xs">{repair.asset.assetCode}</TableCell>
                      <TableCell>{task.action.replaceAll("_", " ")}</TableCell>
                      <TableCell>{repair.repairLocation.name}</TableCell>
                      <TableCell className="text-muted-foreground">{repair.reason}</TableCell>
                      <TableCell>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={async () => {
                            try {
                              await cancelRepairTaskApi(task.id);
                              await loadRepairs();
                              toast.success("Repair task cancelled.");
                            } catch (caught) {
                              setRepairError(apiError(caught));
                            }
                          }}
                        >
                          Cancel
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm font-medium">Operational Asset Search</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setFilters({
                  assetCode: "",
                  itemName: "",
                  category: "",
                  height: "",
                  width: "",
                  gridUp: "",
                  radius: "",
                  gapMm: "",
                  current: "",
                  epc: "",
                  condition: "",
                  status: "",
                });
                setOrder("LATEST");
              }}
            >
              Clear Filters
            </Button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Asset Code" htmlFor="filter-asset-code">
              <Input
                id="filter-asset-code"
                value={filters.assetCode}
                onChange={(e) => setFilter("assetCode", e.target.value)}
              />
            </Field>
            <Field label="Item Name" htmlFor="filter-asset-item">
              <Input
                id="filter-asset-item"
                value={filters.itemName}
                onChange={(e) => setFilter("itemName", e.target.value)}
              />
            </Field>
            <Field label="Category" htmlFor="filter-asset-category">
              <SelectField
                id="filter-asset-category"
                value={filters.category}
                onChange={(value) => setFilter("category", value)}
                options={assetCategories.map((c) => ({ value: String(c.id), label: c.name }))}
                emptyLabel="All"
                placeholder="All"
              />
            </Field>
          </div>

          <fieldset className="rounded-lg border p-4">
            <legend className="px-1 text-xs font-medium text-muted-foreground">
              Measurement / Blade Details
            </legend>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <Field label="Height (mm)" htmlFor="filter-asset-height">
                <Input
                  id="filter-asset-height"
                  type="number"
                  min="0"
                  step="0.01"
                  value={filters.height}
                  onChange={(e) => setFilter("height", e.target.value)}
                />
              </Field>
              <Field label="Width (mm)" htmlFor="filter-asset-width">
                <Input
                  id="filter-asset-width"
                  type="number"
                  min="0"
                  step="0.01"
                  value={filters.width}
                  onChange={(e) => setFilter("width", e.target.value)}
                />
              </Field>
              <Field label="Grid / Up" htmlFor="filter-asset-grid">
                <Input
                  id="filter-asset-grid"
                  type="number"
                  min="1"
                  step="1"
                  value={filters.gridUp}
                  onChange={(e) => setFilter("gridUp", e.target.value)}
                />
              </Field>
              <Field label="Radius" htmlFor="filter-asset-radius">
                <Input
                  id="filter-asset-radius"
                  type="number"
                  min="0"
                  step="0.01"
                  value={filters.radius}
                  onChange={(e) => setFilter("radius", e.target.value)}
                />
              </Field>
              <Field label="Gap (mm)" htmlFor="filter-asset-gap">
                <Input
                  id="filter-asset-gap"
                  type="number"
                  min="0"
                  step="0.01"
                  value={filters.gapMm}
                  onChange={(e) => setFilter("gapMm", e.target.value)}
                />
              </Field>
            </div>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <Field label="EPC" htmlFor="filter-asset-epc">
              <Input
                id="filter-asset-epc"
                value={filters.epc}
                onChange={(e) => setFilter("epc", e.target.value)}
              />
            </Field>
            <Field label="Current Location">
              <LocationTreeSelect
                locations={locations}
                selectedLocationId={filters.current}
                onChange={(id) => setFilter("current", String(id))}
                allowClear
                clearLabel="All Locations"
                onClear={() => setFilter("current", "")}
                placeholder="All Locations"
              />
            </Field>
            <Field label="Condition" htmlFor="filter-asset-condition">
              <SelectField
                id="filter-asset-condition"
                value={filters.condition}
                onChange={(value) => setFilter("condition", value)}
                options={["NEW", "GOOD", "FAIR", "POOR", "DAMAGED"].map((v) => ({ value: v, label: v }))}
                emptyLabel="All"
                placeholder="All"
              />
            </Field>
            <Field label="Status" htmlFor="filter-asset-status">
              <SelectField
                id="filter-asset-status"
                value={filters.status}
                onChange={(value) => setFilter("status", value)}
                options={["AVAILABLE", "RESERVED", "PENDING_CONFIRMATION", "IN_USE"].map((v) => ({
                  value: v,
                  label: v.replaceAll("_", " "),
                }))}
                emptyLabel="All"
                placeholder="All"
              />
            </Field>
            <Field label="Order" htmlFor="filter-asset-order">
              <SelectField
                id="filter-asset-order"
                value={order}
                onChange={(value) => setOrder(value as ListOrder)}
                options={ORDER_OPTIONS}
              />
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <Button
            variant="outline"
            size="sm"
            disabled={!visible.some((a) => !eligibility(a))}
            onClick={() =>
              setSelected(
                (old) =>
                  new Set([...old, ...visible.filter((a) => !eligibility(a)).map((a) => a.id)])
              )
            }
          >
            Select eligible visible rows
          </Button>
          <Button variant="outline" size="sm" disabled={!selected.size} onClick={() => setSelected(new Set())}>
            Clear selection
          </Button>
          <Button className="ml-auto" disabled={!selected.size} onClick={() => setPreparing(true)}>
            Prepare Issue
          </Button>
        </CardContent>
      </Card>

      <Dialog
        open={assetFormOpen}
        onOpenChange={(open) => {
          if (!open && !saving) {
            handleCancelEdit();
            setAssetFormOpen(false);
          }
        }}
      >
        {/* Scrolling lives on the inner body so the dialog keeps its rounded corners. */}
        <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
          <DialogHeader className="shrink-0 border-b px-6 py-4">
            <DialogTitle>{isEditing ? "Edit Asset" : "Register Asset"}</DialogTitle>
            <DialogDescription>
              {isEditing
                ? "Update Asset master information."
                : "Register a physical Asset and its storage location."}
            </DialogDescription>
          </DialogHeader>

          {/* The form is the scroll region itself; the footer is a sibling so it
              cannot be pushed past the dialog edge by nested flex sizing. */}
          <form
            id="asset-form"
            className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-5"
            onSubmit={async (event) => {
              if (await handleSubmitAsset(event)) {
                toast.success(isEditing ? "Asset updated." : "Asset registered.");
                setAssetFormOpen(false);
              }
            }}
          >
            <ErrorBox message={error} />

            <section className="space-y-4">
              <h4 className="text-sm font-semibold">1. Basic Information</h4>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Asset Code *" htmlFor="asset-code">
                  <Input
                    id="asset-code"
                    value={form.assetCode}
                    onChange={(event) => updateForm("assetCode", event.target.value)}
                    placeholder="Example: AST-0001"
                    required
                  />
                </Field>
                <Field label="Item Name *" htmlFor="asset-item-name">
                  <Input
                    id="asset-item-name"
                    value={form.itemName}
                    onChange={(event) => updateForm("itemName", event.target.value)}
                    placeholder="Example: Dell Laptop"
                    required
                  />
                </Field>
                <Field label="Asset Category *" htmlFor="asset-category">
                  <SelectField
                    id="asset-category"
                    value={form.categoryId}
                    onChange={(value) => updateForm("categoryId", value)}
                    placeholder="Select Asset Category"
                    options={assetCategories
                      .filter((category) => category.isActive)
                      .map((category) => ({
                        value: String(category.id),
                        label: `${category.categoryCode} — ${category.name}`,
                      }))}
                  />
                </Field>
              </div>
            </section>

            <Separator />

            <section className="space-y-4">
              <h4 className="text-sm font-semibold">2. Measurement &amp; Asset Details</h4>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="Measurement Height (mm)" htmlFor="asset-height">
                  <Input
                    id="asset-height"
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.measurementHeight}
                    onChange={(event) => updateForm("measurementHeight", event.target.value)}
                  />
                </Field>
                <Field label="Measurement Width (mm)" htmlFor="asset-width">
                  <Input
                    id="asset-width"
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.measurementWidth}
                    onChange={(event) => updateForm("measurementWidth", event.target.value)}
                  />
                </Field>
                <Field label="Grid / Up" htmlFor="asset-grid-up">
                  <Input
                    id="asset-grid-up"
                    type="number"
                    min="1"
                    step="1"
                    value={form.gridUp}
                    onChange={(event) => updateForm("gridUp", event.target.value)}
                  />
                </Field>
                <Field label="Radius" htmlFor="asset-radius">
                  <Input
                    id="asset-radius"
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.radius}
                    onChange={(event) => updateForm("radius", event.target.value)}
                  />
                </Field>
                <Field label="Gap (mm)" htmlFor="asset-gap">
                  <Input
                    id="asset-gap"
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.gapMm}
                    onChange={(event) => updateForm("gapMm", event.target.value)}
                  />
                </Field>
              </div>
            </section>

            <Separator />

            <section className="space-y-4">
              <h4 className="text-sm font-semibold">3. Storage</h4>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label={
                    isEditing
                      ? locationLocked
                        ? "Current Location (locked)"
                        : "Storage Location"
                      : "Storage Location *"
                  }
                >
                  <LocationTreeSelect
                    locations={locations}
                    disabled={locationLocked}
                    required={!isEditing}
                    selectedLocationId={form.locationId}
                    onChange={(id) => updateForm("locationId", String(id))}
                    allowedLocation={storageLocation}
                    placeholder="Select Storage Location"
                  />
                </Field>

                {isEditing && locationLocked && (
                  <Field
                    label={homeNeedsVerification ? "Verify Home Location" : "Home Location (locked)"}
                    hint={
                      homeNeedsVerification
                        ? "Initializes the missing legacy home only; current verified location will not change."
                        : undefined
                    }
                  >
                    <LocationTreeSelect
                      locations={locations}
                      disabled={!homeNeedsVerification}
                      required={homeNeedsVerification}
                      selectedLocationId={form.homeLocationId}
                      onChange={(id) => updateForm("homeLocationId", String(id))}
                      allowedLocation={storageLocation}
                      placeholder={
                        homeNeedsVerification ? "Select verified storage home" : "Verified"
                      }
                    />
                  </Field>
                )}
              </div>
            </section>

            <Separator />

            <section className="space-y-4">
              <h4 className="text-sm font-semibold">4. Manufacturer / Identification</h4>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="Serial Number" htmlFor="asset-serial">
                  <Input
                    id="asset-serial"
                    value={form.serialNumber}
                    onChange={(event) => updateForm("serialNumber", event.target.value)}
                    placeholder="Optional"
                  />
                </Field>
                <Field label="Brand" htmlFor="asset-brand">
                  <Input
                    id="asset-brand"
                    value={form.brand}
                    onChange={(event) => updateForm("brand", event.target.value)}
                    placeholder="Example: Dell"
                  />
                </Field>
                <Field label="Model" htmlFor="asset-model">
                  <Input
                    id="asset-model"
                    value={form.model}
                    onChange={(event) => updateForm("model", event.target.value)}
                    placeholder="Example: Latitude 5440"
                  />
                </Field>
              </div>
            </section>

            <Separator />

            <section className="space-y-4">
              <h4 className="text-sm font-semibold">5. Purchase &amp; Condition</h4>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Purchase Date" htmlFor="asset-purchase-date">
                  <DatePicker
                    id="asset-purchase-date"
                    value={form.purchaseDate}
                    placeholder="Optional"
                    onChange={(purchaseDate) => updateForm("purchaseDate", purchaseDate)}
                  />
                </Field>
                <Field label="Purchase Cost" htmlFor="asset-purchase-cost">
                  <Input
                    id="asset-purchase-cost"
                    type="number"
                    value={form.purchaseCost}
                    onChange={(event) => updateForm("purchaseCost", event.target.value)}
                    placeholder="Example: 3500"
                  />
                </Field>
                <Field label="Condition" htmlFor="asset-condition">
                  <SelectField
                    id="asset-condition"
                    value={form.condition}
                    onChange={(value) => updateForm("condition", value)}
                    emptyLabel="Default: GOOD"
                    placeholder="Default: GOOD"
                    options={["NEW", "GOOD", "FAIR", "POOR", "DAMAGED"].map((condition) => ({
                      value: condition,
                      label: condition,
                    }))}
                  />
                </Field>
                <Field label="Remarks" htmlFor="asset-remarks">
                  <Input
                    id="asset-remarks"
                    value={form.remarks}
                    onChange={(event) => updateForm("remarks", event.target.value)}
                    placeholder="Optional"
                  />
                </Field>
              </div>
            </section>

            <Separator />

            <section className="space-y-4">
              <h4 className="text-sm font-semibold">6. EPC Registration</h4>
              {!isEditing && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="asset-register-epc"
                      checked={form.registerEpc}
                      onCheckedChange={(checked) => updateForm("registerEpc", checked === true)}
                    />
                    <Label htmlFor="asset-register-epc" className="font-normal">Register EPC</Label>
                  </div>

                  {form.registerEpc && (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="EPC Method">
                        <div className="flex items-center gap-4">
                          <label className="flex items-center gap-2 text-sm">
                            <input
                              type="radio"
                              name="epc-method"
                              className="size-4 accent-primary"
                              checked={form.autoGenerateEpc}
                              onChange={() => updateForm("autoGenerateEpc", true)}
                            />
                            Auto Generate
                          </label>
                          <label className="flex items-center gap-2 text-sm">
                            <input
                              type="radio"
                              name="epc-method"
                              className="size-4 accent-primary"
                              checked={!form.autoGenerateEpc}
                              onChange={() => updateForm("autoGenerateEpc", false)}
                            />
                            Manual
                          </label>
                        </div>
                      </Field>

                      {!form.autoGenerateEpc && (
                        <Field label="EPC *" htmlFor="asset-epc-code">
                          <Input
                            id="asset-epc-code"
                            required
                            minLength={2}
                            maxLength={191}
                            pattern="([0-9A-Fa-f]{2})+"
                            value={form.epcCode}
                            onChange={(event) => updateForm("epcCode", event.target.value)}
                            placeholder="Enter an even number of hexadecimal characters"
                          />
                        </Field>
                      )}
                    </div>
                  )}
                </div>
              )}

              {isEditing && editingAsset && (
                <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border p-4">
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">Current EPC</div>
                    <div className="font-mono text-sm font-medium">
                      {hasActiveEpc(editingAsset) ? editingAsset.epc?.epcCode : "Not Assigned"}
                    </div>
                    <Badge variant={hasActiveEpc(editingAsset) ? "secondary" : "outline"}>
                      {hasActiveEpc(editingAsset) ? "Active" : "Not Assigned"}
                    </Badge>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!epcMutable(editingAsset)}
                    title={
                      epcMutable(editingAsset)
                        ? undefined
                        : "EPC changes are allowed only while Available or Reserved"
                    }
                    onClick={() => setEpcAsset(editingAsset)}
                  >
                    {hasActiveEpc(editingAsset) ? "Replace EPC" : "Assign EPC"}
                  </Button>
                </div>
              )}
            </section>

            <Separator />

            <section className="space-y-4">
              <h4 className="text-sm font-semibold">7. Status</h4>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="asset-active"
                  checked={form.isActive}
                  onCheckedChange={(checked) => updateForm("isActive", checked === true)}
                />
                <Label htmlFor="asset-active" className="font-normal">Active</Label>
              </div>
            </section>
          </form>

          <DialogFooter className="mx-0 mb-0 shrink-0 px-6 py-5">
            {isEditing && (
              <Button
                variant="destructive"
                type="button"
                className="mr-auto"
                disabled={saving}
                onClick={() => setConfirmingDelete(true)}
              >
                Delete Asset
              </Button>
            )}
            <Button
              variant="outline"
              type="button"
              disabled={saving}
              onClick={() => {
                handleCancelEdit();
                setAssetFormOpen(false);
              }}
            >
              Cancel
            </Button>
            <Button form="asset-form" disabled={saving} type="submit">
              {saving ? "Saving..." : isEditing ? "Save Changes" : "Register"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {repairAsset && (
        <PrepareRepairDialog
          asset={repairAsset}
          repair={activeRepairByAsset.get(repairAsset.id)}
          locations={locations}
          close={() => setRepairAsset(null)}
          complete={async () => {
            await Promise.all([loadPageData(), loadRepairs()]);
          }}
        />
      )}

      {confirmingDelete && editingAsset && (
        <ConfirmDeleteDialog
          title="Delete Asset?"
          recordLabel={`Asset Code: ${editingAsset.assetCode}`}
          busy={saving}
          onCancel={() => setConfirmingDelete(false)}
          onConfirm={async () => {
            if (await handleDeleteAsset()) {
              toast.success("Asset deleted.");
              setConfirmingDelete(false);
              setAssetFormOpen(false);
              setSelected((current) => {
                const next = new Set(current);
                next.delete(editingAsset.id);
                return next;
              });
            } else setConfirmingDelete(false);
          }}
        />
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm font-medium">{visible.length} Assets</span>
        <AssetColumnSelector
          columns={columns}
          apply={applyColumns}
          open={columnSelectorOpen}
          onOpenChange={setColumnSelectorOpen}
        />
      </div>

      <TableCard
        columns={["Select", ...columns.map((column) => assetColumnLabel.get(column) ?? column)]}
        loading={loading}
        isEmpty={visible.length === 0}
        emptyMessage="No assets found."
        itemLabel="asset"
      >
        {visible.map((asset) => (
          <TableRow key={asset.id}>
            <TableCell>
              <Checkbox
                checked={selected.has(asset.id)}
                disabled={!!eligibility(asset)}
                title={eligibility(asset) || "Eligible for Issue preparation"}
                onCheckedChange={(checked) =>
                  setSelected((old) => {
                    const next = new Set(old);
                    if (checked === true) next.add(asset.id);
                    else next.delete(asset.id);
                    return next;
                  })
                }
              />
            </TableCell>
            {columns.map((column) => (
              <TableCell key={column}>{renderAssetCell(asset, column)}</TableCell>
            ))}
          </TableRow>
        ))}
      </TableCard>

      <AssetDetailsModal asset={viewAsset} close={() => setViewAsset(null)} />

      {epcAsset && (
        <AssetEpcDialog asset={epcAsset} close={() => setEpcAsset(null)} refresh={loadPageData} />
      )}

      {preparing && (
        <PrepareIssueDialog
          assets={selectedAssets}
          locations={locations}
          close={() => setPreparing(false)}
          complete={async (count, message) => {
            setPreparing(false);
            setSelected(new Set());
            navigate("/issue-batches", {
              state: {
                message: message || `${count} Assets prepared. Awaiting EPC confirmation.`,
              },
            });
          }}
        />
      )}
    </>
  );
}
