import { useEffect, useState, type FormEvent } from "react";
import { useLocation } from "react-router-dom";
import {
  cancelBatchIssueApi,
  cancelIssueBatchApi,
  confirmHandheldSwapApi,
  getHandheldSwapApi,
  getIssueBatchesApi,
  returnScanApi,
  scanAllJobsApi,
  verifyHandheldSwapEpcApi,
  type HandheldSwapDetail,
  type IssueBatch,
  type IssueBatchItem,
  type ReturnScanResult,
  type ScanResult,
} from "../api/issueBatches.api";
import { cancelRepairTaskApi, getRepairsApi, type AssetRepair } from "../api/repairs.api";
import { chronological, type ListOrder } from "../utils/listOrder";
import { RefreshCw, ScanLine } from "lucide-react";
import { useErrorToast, useSuccessToast } from "@/hooks/useErrorToast";
import { ErrorBox, SuccessBox } from "@/components/common/ErrorBox";
import { Field } from "@/components/common/FilterCard";
import { PageHeader } from "@/components/common/PageHeader";
import { ORDER_OPTIONS, SelectField } from "@/components/common/SelectField";
import { TableCard } from "@/components/common/TableCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

const errorText = (error: unknown) =>
  (error as { response?: { data?: { message?: string } }; message?: string })
    .response?.data?.message ||
  (error as { message?: string }).message ||
  "Operation failed";
const measurement = (item: IssueBatchItem) =>
  item.asset.measurementHeight == null || item.asset.measurementWidth == null
    ? "—"
    : `${item.asset.measurementHeight} × ${item.asset.measurementWidth} mm`;
const issueItems = (batch: IssueBatch) =>
  batch.items.filter((item) => ["ISSUED", "CONFIRMED"].includes(item.status));
const scanResultLabel = (classification: string) =>
  ({
    MATCHED_CONFIRMED: "Confirmed",
    EXPECTED_ALREADY_CONFIRMED: "Already Confirmed",
    UNEXPECTED_NOT_PREPARED: "Not Prepared",
    INVALID_OR_INACTIVE_EPC: "Invalid or Inactive EPC",
    DUPLICATE_SCAN: "Duplicate Scan",
  }[classification] || classification.toLowerCase().replaceAll("_", " "));
const isOpenBatch = (batch: IssueBatch) =>
  ["PREPARING", "PROCESSING"].includes(batch.status);
const isPendingConfirmation = (item: IssueBatchItem) =>
  item.status === "ISSUED" &&
  item.asset.status === "PENDING_CONFIRMATION" &&
  !item.handheldSwapTasks?.length;
const isReturnable = (item: IssueBatchItem) =>
  item.status === "CONFIRMED" &&
  item.asset.status === "IN_USE" &&
  item.assignment?.status === "ACTIVE" &&
  item.assignment.isActive &&
  !item.handheldSwapTasks?.length;
const normalizeEpc = (value?: string | null) =>
  value?.trim().toUpperCase() || "";

export function IssueBatchesPages() {
  const location = useLocation();
  const navigationMessage =
    (location.state as { message?: string } | null)?.message || "";
  const [tab, setTab] = useState<"ISSUE" | "RETURNING" | "REPAIR">("ISSUE");
  const [batches, setBatches] = useState<IssueBatch[]>([]);
  const [repairs, setRepairs] = useState<AssetRepair[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(navigationMessage);
  const [error, setError] = useState("");
  const [scanAllJobsOpen, setScanAllJobsOpen] = useState(false);
  const [allJobsScanText, setAllJobsScanText] = useState("");
  const [allJobsRemarks, setAllJobsRemarks] = useState("");
  const [allJobsResults, setAllJobsResults] = useState<ScanResult[]>([]);
  const [returnScanOpen, setReturnScanOpen] = useState(false);
  const [returnScanText, setReturnScanText] = useState("");
  const [returnRemarks, setReturnRemarks] = useState("");
  const [returnResults, setReturnResults] = useState<ReturnScanResult[]>([]);
  const [order, setOrder] = useState<ListOrder>("LATEST");
  const [swapVerificationTask, setSwapVerificationTask] =
    useState<HandheldSwapDetail | null>(null);
  const [swapVerificationText, setSwapVerificationText] = useState("");

  useErrorToast(error);
  useSuccessToast(message);

  async function refresh() {
    const [nextBatches, nextRepairs] = await Promise.all([getIssueBatchesApi(), getRepairsApi()]);
    setBatches(nextBatches);
    setRepairs(nextRepairs);
  }
  useEffect(() => {
    void Promise.all([getIssueBatchesApi(), getRepairsApi()])
      .then(([nextBatches, nextRepairs]) => { setBatches(nextBatches); setRepairs(nextRepairs); })
      .catch((caught) => setError(errorText(caught)));
  }, []);

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
      await refresh();
      setMessage(success);
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy(false);
    }
  }

  async function openSwapVerification(item: IssueBatchItem) {
    const taskId = item.handheldSwapTasks?.[0]?.id;
    if (!taskId) return;
    setBusy(true);
    setError("");
    try {
      setSwapVerificationTask(await getHandheldSwapApi(taskId));
      setSwapVerificationText("");
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy(false);
    }
  }

  async function submitSwapVerification(event: FormEvent) {
    event.preventDefault();
    if (!swapVerificationTask) return;
    const oldEpc = normalizeEpc(
      swapVerificationTask.targetItem.asset.epc?.epcCode
    );
    const oldVerified =
      normalizeEpc(swapVerificationTask.oldVerifiedEpc) === oldEpc;
    const step = oldVerified ? "REPLACEMENT" : "OLD";
    setBusy(true);
    setError("");
    try {
      const updated = await verifyHandheldSwapEpcApi(
        swapVerificationTask.id,
        step,
        swapVerificationText
      );
      setSwapVerificationTask(updated);
      setSwapVerificationText("");
      await refresh();
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy(false);
    }
  }

  async function confirmVerifiedSwap() {
    if (!swapVerificationTask) return;
    const oldEpc = normalizeEpc(
      swapVerificationTask.targetItem.asset.epc?.epcCode
    );
    const newEpc = normalizeEpc(
      swapVerificationTask.replacementAsset.epc?.epcCode
    );
    setBusy(true);
    setError("");
    try {
      await confirmHandheldSwapApi(swapVerificationTask.id, oldEpc, newEpc);
      setSwapVerificationTask(null);
      await refresh();
      setMessage("Swap confirmed.");
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy(false);
    }
  }

  async function cancelBatch(batch: IssueBatch) {
    if (
      !window.confirm(
        "Cancel all unconfirmed items in this batch? Confirmed Assets will remain IN_USE."
      )
    )
      return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await cancelIssueBatchApi(batch.id);
      await refresh();
      setMessage(
        `${result.cancelledCount} unconfirmed item${
          result.cancelledCount === 1 ? "" : "s"
        } cancelled. ${result.confirmedCount} confirmed item${
          result.confirmedCount === 1 ? "" : "s"
        } remain active or returned.`
      );
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy(false);
    }
  }

  async function submitReturnScan(event: FormEvent) {
    event.preventDefault();
    const epcs = returnScanText.split(/[\s,;]+/).filter(Boolean);
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await returnScanApi(epcs, returnRemarks);
      setReturnResults(response.results);
      await refresh();
      const returned = response.results.filter(
        (result) => result.classification === "RETURNED"
      ).length;
      setMessage(
        `${returned} Asset${
          returned === 1 ? "" : "s"
        } returned successfully. Each EPC was processed independently.`
      );
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy(false);
    }
  }

  async function submitAllJobsScan(event: FormEvent) {
    event.preventDefault();
    const epcs = allJobsScanText.split(/[\s,;]+/).filter(Boolean);
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await scanAllJobsApi(epcs, allJobsRemarks);
      setAllJobsResults(response.results);
      await refresh();
      const confirmed = response.results.filter(
        (result) => result.classification === "MATCHED_CONFIRMED"
      ).length;
      setMessage(
        `${confirmed} Asset${
          confirmed === 1 ? "" : "s"
        } confirmed across active Jobs. Unexpected EPCs made no changes.`
      );
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy(false);
    }
  }

  const orderedBatches = chronological(
    batches,
    (batch) => batch.createdAt,
    order
  );
  const openBatches = orderedBatches.filter(isOpenBatch);
  const activeIssueBatches = orderedBatches.filter(
    (batch) => isOpenBatch(batch) && issueItems(batch).length > 0
  );
  const allJobsAwaitingCount = openBatches
    .flatMap((batch) => batch.items)
    .filter(isPendingConfirmation).length;
  const returnJobs = openBatches
    .map((batch) => ({ batch, items: batch.items.filter(isReturnable) }))
    .filter(({ items }) => items.length > 0);
  const returningItems = returnJobs.flatMap(({ batch, items }) =>
    items.map((item) => ({ batch, item }))
  );
  const returningCount = returningItems.length;
  const pendingRepairTasks = repairs.flatMap((repair) =>
    repair.tasks
      .filter((task) => task.status === "PENDING")
      .map((task) => ({ repair, task }))
  );

  const swapOldEpc = normalizeEpc(
    swapVerificationTask?.targetItem.asset.epc?.epcCode
  );
  const swapNewEpc = normalizeEpc(
    swapVerificationTask?.replacementAsset.epc?.epcCode
  );
  const swapOldVerified =
    !!swapVerificationTask &&
    !!swapOldEpc &&
    normalizeEpc(swapVerificationTask.oldVerifiedEpc) === swapOldEpc;
  const swapNewVerified =
    !!swapVerificationTask &&
    !!swapNewEpc &&
    normalizeEpc(swapVerificationTask.newVerifiedEpc) === swapNewEpc;

  return (
    <>
      <PageHeader
        title="Issue Batches"
        description="Verify prepared Assets before physical issue and return."
        actions={
          <>
            <SelectField
              value={order}
              onChange={(value) => setOrder(value as ListOrder)}
              options={ORDER_OPTIONS}
              className="w-32"
            />
            <Button variant="outline" onClick={() => void refresh()}>
              <RefreshCw />
              Refresh
            </Button>
          </>
        }
      />

      <ErrorBox message={error} />
      <SuccessBox message={message} />

      <Tabs value={tab} onValueChange={(value) => setTab(value as "ISSUE" | "RETURNING" | "REPAIR")}>
        <TabsList>
          <TabsTrigger value="ISSUE" className="gap-2">
            Issue &amp; Confirmation
            <Badge variant="secondary" className="tabular-nums">{allJobsAwaitingCount}</Badge>
          </TabsTrigger>
          <TabsTrigger value="RETURNING" className="gap-2">
            Returning
            <Badge variant="secondary" className="tabular-nums">{returningCount}</Badge>
          </TabsTrigger>
          <TabsTrigger value="REPAIR" className="gap-2">
            Repair
            <Badge variant="secondary" className="tabular-nums">{pendingRepairTasks.length}</Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ISSUE" className="space-y-6">
          <div className="flex flex-wrap items-center gap-3">
            <Button
              disabled={busy || allJobsAwaitingCount === 0}
              title={
                allJobsAwaitingCount === 0
                  ? "No Assets are awaiting EPC confirmation"
                  : `Scan EPCs across ${allJobsAwaitingCount} awaiting Assets`
              }
              onClick={() => {
                setScanAllJobsOpen(true);
                setAllJobsScanText("");
                setAllJobsRemarks("");
                setAllJobsResults([]);
              }}
            >
              <ScanLine />
              Scan All Jobs
            </Button>
            <span className="text-sm text-muted-foreground">
              {allJobsAwaitingCount} Awaiting EPC Confirmation
            </span>
          </div>

          {activeIssueBatches.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                No Assets are awaiting confirmation or currently in use.
              </CardContent>
            </Card>
          ) : (
            activeIssueBatches.map((batch) => {
              const items = issueItems(batch);
              const awaiting = items.filter(
                (item) => item.status === "ISSUED" && !item.handheldSwapTasks?.length
              );
              const awaitingSwap = items.filter((item) => !!item.handheldSwapTasks?.length);
              const confirmed = items.filter((item) => item.status === "CONFIRMED");

              return (
                <Card key={batch.id} className="overflow-hidden">
                  <CardHeader className="flex flex-wrap items-start justify-between gap-4">
                    <div className="space-y-1">
                      <CardTitle className="text-xl font-bold">
                        {batch.jobNo || "No Job No."}
                      </CardTitle>
                      <p className="text-sm text-muted-foreground">{batch.batchNo}</p>
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <Badge variant="secondary">{awaiting.length} Awaiting Confirmation</Badge>
                        {awaitingSwap.length > 0 && (
                          <Badge variant="outline">{awaitingSwap.length} Awaiting Swap</Badge>
                        )}
                        {confirmed.length > 0 && (
                          <Badge variant="outline">{confirmed.length} In Use</Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        disabled={busy || awaiting.length === 0}
                        onClick={() => void cancelBatch(batch)}
                      >
                        Cancel Batch
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="px-0">
                    <div className="overflow-x-auto border-t">
                      <Table>
                        <TableHeader>
                          <TableRow className="hover:bg-transparent">
                            <TableHead>Asset</TableHead>
                            <TableHead>Item / Category</TableHead>
                            <TableHead>Measurement</TableHead>
                            <TableHead>EPC</TableHead>
                            <TableHead>Recipient</TableHead>
                            <TableHead>To Location</TableHead>
                            <TableHead>State</TableHead>
                            <TableHead>Action</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {items.map((item) => (
                            <TableRow key={item.id}>
                              <TableCell className="font-mono text-xs">{item.asset.assetCode}</TableCell>
                              <TableCell>
                                <div className="font-medium">{item.asset.itemName}</div>
                                <div className="text-xs text-muted-foreground">
                                  {item.asset.category?.name}
                                </div>
                              </TableCell>
                              <TableCell className="whitespace-nowrap">{measurement(item)}</TableCell>
                              <TableCell className="font-mono text-xs">
                                {item.asset.epc?.epcCode || (
                                  <span className="text-destructive">Missing</span>
                                )}
                              </TableCell>
                              <TableCell>
                                {item.recipient?.fullName || item.recipient?.username || "—"}
                              </TableCell>
                              <TableCell>
                                {item.toLocation?.displayPath || item.toLocation?.name || "—"}
                              </TableCell>
                              <TableCell>
                                {item.handheldSwapTasks?.length ? (
                                  <div className="space-y-1">
                                    <Badge variant="outline">Awaiting Swap</Badge>
                                    <div className="text-xs text-muted-foreground">
                                      Existing{" "}
                                      {item.handheldSwapTasks[0].oldVerifiedEpc ? "✓ Verified" : "Waiting"}
                                      <br />
                                      Replacement{" "}
                                      {item.handheldSwapTasks[0].newVerifiedEpc ? "✓ Verified" : "Waiting"}
                                    </div>
                                  </div>
                                ) : item.status === "CONFIRMED" ? (
                                  <Badge variant="secondary">In Use</Badge>
                                ) : (
                                  <span className="text-sm text-muted-foreground">
                                    Awaiting EPC Confirmation
                                  </span>
                                )}
                              </TableCell>
                              <TableCell>
                                <div className="flex gap-1">
                                  {item.handheldSwapTasks?.length ? (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      disabled={busy}
                                      onClick={() => void openSwapVerification(item)}
                                    >
                                      Verify EPC
                                    </Button>
                                  ) : null}
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    disabled={
                                      busy ||
                                      item.status !== "ISSUED" ||
                                      !!item.handheldSwapTasks?.length
                                    }
                                    onClick={() => {
                                      if (
                                        window.confirm(
                                          `Cancel ${item.asset.assetCode}? The Asset will become AVAILABLE.`
                                        )
                                      )
                                        void run(
                                          () => cancelBatchIssueApi(item.id),
                                          "Unconfirmed item cancelled; Asset is AVAILABLE."
                                        );
                                    }}
                                  >
                                    Cancel
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>

        <TabsContent value="RETURNING" className="space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            {/* <div className="space-y-1">
              <h3 className="text-lg font-semibold">Assets Currently In Use</h3>
              <p className="text-sm text-muted-foreground">
                Scan returned EPCs from any Issue Batch. Verified Assets return directly to their
                registered home location.
              </p>
            </div> */}
            <Button
              onClick={() => {
                setReturnScanOpen(true);
                setReturnScanText("");
                setReturnRemarks("");
                setReturnResults([]);
              }}
            >
              <ScanLine />
              Return Scan
            </Button>
          </div>

          {returnJobs.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {returnJobs.map(({ batch, items }) => (
                <Card key={`return-${batch.id}`}>
                  <CardHeader>
                    <CardTitle className="text-base">{batch.jobNo || batch.batchNo}</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      Returning {items.length} · {items.length} asset
                      {items.length === 1 ? "" : "s"} still IN_USE
                    </p>
                  </CardHeader>
                </Card>
              ))}
            </div>
          )}

          <TableCard
            columns={[
              "Batch / Job",
              "Asset",
              "Recipient",
              "Current Location",
              "Home Location",
              "Issued Time",
              "State",
            ]}
            isEmpty={returningItems.length === 0}
            emptyMessage="No confirmed Assets are currently in use."
            itemLabel="asset"
          >
            {returningItems.map(({ batch, item }) => (
              <TableRow key={item.id}>
                <TableCell>
                  <div className="font-medium">{batch.batchNo}</div>
                  <div className="text-xs text-muted-foreground">{batch.jobNo || "No Job No."}</div>
                </TableCell>
                <TableCell>
                  <div className="font-mono text-xs">{item.asset.assetCode}</div>
                  <div className="text-xs text-muted-foreground">{item.asset.itemName}</div>
                </TableCell>
                <TableCell>
                  {item.recipient?.fullName || item.recipient?.username || "—"}
                </TableCell>
                <TableCell>
                  {item.asset.locationPath || item.asset.location?.name || "—"}
                </TableCell>
                <TableCell>
                  {item.asset.homeLocation?.displayPath ||
                    item.asset.homeLocation?.name ||
                    "Unresolved"}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {item.assignment?.issuedAt
                    ? new Date(item.assignment.issuedAt).toLocaleString()
                    : "—"}
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">In Use</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableCard>
        </TabsContent>

        <TabsContent value="REPAIR" className="space-y-6">
          <TableCard
            columns={["Asset", "Action", "Repair Location", "Reason", "Action"]}
            isEmpty={pendingRepairTasks.length === 0}
            emptyMessage="No repair actions are awaiting confirmation."
            itemLabel="repair action"
          >
            {pendingRepairTasks.map(({ repair, task }) => (
              <TableRow key={task.id}>
                <TableCell>
                  <div className="font-mono text-xs">{repair.asset.assetCode}</div>
                  <div className="text-xs text-muted-foreground">{repair.asset.itemName}</div>
                </TableCell>
                <TableCell>{task.action.replaceAll("_", " ")}</TableCell>
                <TableCell>{repair.repairLocation.name}</TableCell>
                <TableCell className="text-muted-foreground">{repair.reason}</TableCell>
                <TableCell>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={busy}
                    onClick={() => void run(() => cancelRepairTaskApi(task.id), "Repair task cancelled.")}
                  >
                    Cancel
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableCard>
        </TabsContent>
      </Tabs>

      {/* Swap EPC verification */}
      <Dialog
        open={!!swapVerificationTask}
        onOpenChange={(open) => {
          if (!open && !busy) setSwapVerificationTask(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          {swapVerificationTask && (
            <form onSubmit={submitSwapVerification} className="space-y-5">
              <DialogHeader>
                <DialogTitle>Swap EPC Verification</DialogTitle>
                <DialogDescription>
                  {swapVerificationTask.targetItem.asset.assetCode} →{" "}
                  {swapVerificationTask.replacementAsset.assetCode}
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">Existing Asset</div>
                  <div className="font-mono text-sm">
                    {swapVerificationTask.targetItem.asset.assetCode}
                  </div>
                  <Badge variant={swapOldVerified ? "secondary" : "outline"} className="mt-2">
                    {swapOldVerified ? "✓ Verified" : "Waiting"}
                  </Badge>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">Replacement Asset</div>
                  <div className="font-mono text-sm">
                    {swapVerificationTask.replacementAsset.assetCode}
                  </div>
                  <Badge variant={swapNewVerified ? "secondary" : "outline"} className="mt-2">
                    {swapNewVerified ? "✓ Verified" : "Waiting"}
                  </Badge>
                </div>
              </div>

              {!swapNewVerified && (
                <Field
                  label={
                    swapOldVerified
                      ? "Scan / Enter Replacement EPC"
                      : "Scan / Enter Existing Asset EPC"
                  }
                  htmlFor="swap-epc"
                >
                  <Input
                    id="swap-epc"
                    autoFocus
                    required
                    value={swapVerificationText}
                    onChange={(event) => setSwapVerificationText(event.target.value)}
                  />
                </Field>
              )}

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => setSwapVerificationTask(null)}
                >
                  Close
                </Button>
                {!swapNewVerified && (
                  <Button disabled={busy}>
                    {busy
                      ? "Verifying..."
                      : swapOldVerified
                        ? "Verify Replacement EPC"
                        : "Verify Old EPC"}
                  </Button>
                )}
                {swapOldVerified && swapNewVerified && (
                  <Button type="button" disabled={busy} onClick={() => void confirmVerifiedSwap()}>
                    {busy ? "Validating..." : "Confirm Swap"}
                  </Button>
                )}
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Return scan */}
      <Dialog open={returnScanOpen} onOpenChange={setReturnScanOpen}>
        <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
          <form onSubmit={submitReturnScan} className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
            <DialogHeader>
              <DialogTitle>Return Scan</DialogTitle>
              <DialogDescription>
                Paste EPCs from one or more Issue Batches. Each EPC is validated and returned
                independently.
              </DialogDescription>
            </DialogHeader>

            <Field label="Paste / Enter EPCs" htmlFor="return-scan-input">
              <Textarea
                id="return-scan-input"
                autoFocus
                rows={7}
                required
                value={returnScanText}
                onChange={(event) => setReturnScanText(event.target.value)}
                placeholder="One EPC per line, or separated by commas"
              />
            </Field>

            <Field label="Remarks (optional)" htmlFor="return-remarks">
              <Input
                id="return-remarks"
                value={returnRemarks}
                onChange={(event) => setReturnRemarks(event.target.value)}
              />
            </Field>

            <Button className="w-full" disabled={busy}>
              {busy ? "Processing..." : "Process Return Scan"}
            </Button>

            {returnResults.length > 0 && (
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Asset</TableHead>
                      <TableHead>EPC</TableHead>
                      <TableHead>Previous Location</TableHead>
                      <TableHead>Home Location</TableHead>
                      <TableHead>Result</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {returnResults.map((result, index) => (
                      <TableRow key={`${result.epc}-${index}`}>
                        <TableCell className="font-mono text-xs">{result.assetCode || "—"}</TableCell>
                        <TableCell>
                          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                            {result.epc || "(blank)"}
                          </code>
                        </TableCell>
                        <TableCell>{result.previousLocation || "—"}</TableCell>
                        <TableCell>{result.homeLocation || "—"}</TableCell>
                        <TableCell>{scanResultLabel(result.classification)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Scan across all jobs */}
      <Dialog open={scanAllJobsOpen} onOpenChange={setScanAllJobsOpen}>
        <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
          <form onSubmit={submitAllJobsScan} className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
            <DialogHeader>
              <DialogTitle>Scan All Jobs</DialogTitle>
              <DialogDescription>
                Paste EPCs from any active Issue Batch. Expected Assets are matched to their prepared
                Job.
              </DialogDescription>
            </DialogHeader>

            <Field label="Paste / Enter EPCs" htmlFor="all-jobs-input">
              <Textarea
                id="all-jobs-input"
                autoFocus
                rows={7}
                required
                value={allJobsScanText}
                onChange={(event) => setAllJobsScanText(event.target.value)}
                placeholder="One EPC per line, or separated by commas"
              />
            </Field>

            <Field label="Remarks (optional)" htmlFor="all-jobs-remarks">
              <Input
                id="all-jobs-remarks"
                value={allJobsRemarks}
                onChange={(event) => setAllJobsRemarks(event.target.value)}
              />
            </Field>

            <Button className="w-full" disabled={busy}>
              {busy ? "Confirming..." : "Compare and Confirm Across Jobs"}
            </Button>

            {allJobsResults.length > 0 && (
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Asset</TableHead>
                      <TableHead>Batch / Job</TableHead>
                      <TableHead>EPC</TableHead>
                      <TableHead>To Location</TableHead>
                      <TableHead>Result</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allJobsResults.map((result, index) => (
                      <TableRow key={`${result.epc}-${index}`}>
                        <TableCell className="font-mono text-xs">{result.assetCode || "—"}</TableCell>
                        <TableCell>
                          <div>{result.batchNo || "—"}</div>
                          <div className="text-xs text-muted-foreground">
                            {result.jobNo || (result.batchNo ? "No Job No." : "")}
                          </div>
                        </TableCell>
                        <TableCell>
                          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                            {result.epc || "(blank)"}
                          </code>
                        </TableCell>
                        <TableCell>{result.toLocation || "—"}</TableCell>
                        <TableCell>{scanResultLabel(result.classification)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
