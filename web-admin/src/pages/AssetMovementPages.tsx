import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowRight, RefreshCw } from "lucide-react";
import { getAssetMovementsApi, type AssetMovement } from "../api/assetMovements.api";
import { chronological, type ListOrder } from "../utils/listOrder";
import { movementTypeLabel } from "../utils/movementType";
import { DatePicker } from "@/components/common/DatePicker";
import { ErrorBox } from "@/components/common/ErrorBox";
import { Field, FilterCard } from "@/components/common/FilterCard";
import { PageHeader } from "@/components/common/PageHeader";
import { ORDER_OPTIONS, SelectField } from "@/components/common/SelectField";
import { TableCard } from "@/components/common/TableCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { TableCell, TableRow } from "@/components/ui/table";

const errorMessage = (error: unknown) => (error as { response?: { data?: { message?: string } }; message?: string }).response?.data?.message || (error as { message?: string }).message || "Failed to load Asset Movement History.";
const locationLabel = (location: AssetMovement["fromLocation"]) => location ? `${location.name} (${location.locationCode})` : "-";
const departmentLabel = (department: AssetMovement["fromDepartment"]) => department ? `${department.name} (${department.departmentCode})` : "-";
const movementJobNo = (movement: AssetMovement) => movement.issueBatchItem?.issueBatch.jobNo?.trim() || "";
const initialFilters = { asset: "", jobNo: "", fromLocation: "", toLocation: "", fromDepartment: "", toDepartment: "", type: "", performer: "", fromDate: "", toDate: "" };
const startOfDay = (value: string) => new Date(`${value}T00:00:00`).getTime();
const startOfNextDay = (value: string) => { const date = new Date(`${value}T00:00:00`); date.setDate(date.getDate() + 1); return date.getTime(); };

// Job No., departments, reason and remarks live in the details dialog so the
// list stays readable instead of forcing a 12-column horizontal scroll.
const COLUMNS = ["No.", "Date", "Asset", "Movement", "From → To", "Performed By", ""];

export function AssetMovementsPage() {
  const [movements, setMovements] = useState<AssetMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState(initialFilters);
  const [order, setOrder] = useState<ListOrder>("LATEST");
  const [detail, setDetail] = useState<AssetMovement | null>(null);
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

  return (
    <>
      <PageHeader
        title="Asset Movement History"
        description="Physical Asset movements recorded after successful verification."
        actions={
          <Button variant="outline" type="button" onClick={loadMovements}>
            <RefreshCw />
            Refresh
          </Button>
        }
      />

      <ErrorBox message={error} />

      <FilterCard
        summary={`${visible.length} movement${visible.length === 1 ? "" : "s"}`}
        onClear={() => { setFilters(initialFilters); setOrder("LATEST"); }}
      >
        <Field label="Asset Code" htmlFor="filter-movement-asset">
          <Input id="filter-movement-asset" value={filters.asset} onChange={(event) => setFilters({ ...filters, asset: event.target.value })} />
        </Field>
        <Field label="Job No." htmlFor="filter-movement-job">
          <Input id="filter-movement-job" value={filters.jobNo} onChange={(event) => setFilters({ ...filters, jobNo: event.target.value })} />
        </Field>
        <Field label="From Date" htmlFor="filter-movement-from-date">
          <DatePicker
            id="filter-movement-from-date"
            value={filters.fromDate}
            max={filters.toDate || undefined}
            placeholder="Any date"
            onChange={(fromDate) => setFilters({ ...filters, fromDate })}
          />
        </Field>
        <Field label="To Date" htmlFor="filter-movement-to-date">
          <DatePicker
            id="filter-movement-to-date"
            value={filters.toDate}
            min={filters.fromDate || undefined}
            placeholder="Any date"
            onChange={(toDate) => setFilters({ ...filters, toDate })}
          />
        </Field>
        <Field label="From Location" htmlFor="filter-movement-from-location">
          <SelectField id="filter-movement-from-location" value={filters.fromLocation} onChange={(value) => setFilters({ ...filters, fromLocation: value })} options={choices.fromLocations.map((item) => ({ value: String(item.id), label: item.name }))} emptyLabel="All" placeholder="All" />
        </Field>
        <Field label="To Location" htmlFor="filter-movement-to-location">
          <SelectField id="filter-movement-to-location" value={filters.toLocation} onChange={(value) => setFilters({ ...filters, toLocation: value })} options={choices.toLocations.map((item) => ({ value: String(item.id), label: item.name }))} emptyLabel="All" placeholder="All" />
        </Field>
        <Field label="From Department" htmlFor="filter-movement-from-department">
          <SelectField id="filter-movement-from-department" value={filters.fromDepartment} onChange={(value) => setFilters({ ...filters, fromDepartment: value })} options={choices.fromDepartments.map((item) => ({ value: String(item.id), label: item.name }))} emptyLabel="All" placeholder="All" />
        </Field>
        <Field label="To Department" htmlFor="filter-movement-to-department">
          <SelectField id="filter-movement-to-department" value={filters.toDepartment} onChange={(value) => setFilters({ ...filters, toDepartment: value })} options={choices.toDepartments.map((item) => ({ value: String(item.id), label: item.name }))} emptyLabel="All" placeholder="All" />
        </Field>
        <Field label="Movement Type" htmlFor="filter-movement-type">
          <SelectField id="filter-movement-type" value={filters.type} onChange={(value) => setFilters({ ...filters, type: value })} options={choices.types.map((type) => ({ value: type, label: movementTypeLabel(type) }))} emptyLabel="All" placeholder="All" />
        </Field>
        <Field label="Performed By" htmlFor="filter-movement-performer">
          <SelectField id="filter-movement-performer" value={filters.performer} onChange={(value) => setFilters({ ...filters, performer: value })} options={choices.performers.map((user) => ({ value: String(user.id), label: user.fullName || user.username }))} emptyLabel="All" placeholder="All" />
        </Field>
        <Field label="Order" htmlFor="filter-movement-order">
          <SelectField id="filter-movement-order" value={order} onChange={(value) => setOrder(value as ListOrder)} options={ORDER_OPTIONS} />
        </Field>
      </FilterCard>

      {dateError && <ErrorBox message={dateError} />}

      <TableCard
        columns={COLUMNS}
        loading={loading}
        isEmpty={visible.length === 0}
        emptyMessage="No Asset movements match the current filters."
        itemLabel="movement"
      >
        {visible.map((movement, index) => (
          <TableRow key={movement.id}>
            <TableCell className="text-muted-foreground">{index + 1}</TableCell>
            <TableCell className="whitespace-nowrap">
              <div>{new Date(movement.movementDate).toLocaleDateString()}</div>
              <div className="text-xs text-muted-foreground">
                {new Date(movement.movementDate).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </div>
            </TableCell>
            <TableCell>
              <div className="font-mono text-xs">{movement.asset?.assetCode || movement.assetId}</div>
              <div className="text-xs text-muted-foreground">
                {movementJobNo(movement) ? `Job ${movementJobNo(movement)}` : "No Job No."}
              </div>
            </TableCell>
            <TableCell>
              <Badge variant="secondary" className="whitespace-nowrap">{movementTypeLabel(movement.movementType)}</Badge>
            </TableCell>
            <TableCell className="max-w-72">
              <div className="flex items-center gap-1.5 text-xs">
                <span className="truncate">{locationLabel(movement.fromLocation)}</span>
                <ArrowRight className="size-3 shrink-0 text-muted-foreground" />
                <span className="truncate font-medium">{locationLabel(movement.toLocation)}</span>
              </div>
            </TableCell>
            <TableCell className="whitespace-nowrap">
              {movement.movedByUser?.fullName || movement.movedByUser?.username || movement.movedByUserId}
            </TableCell>
            <TableCell>
              <Button variant="ghost" size="sm" onClick={() => setDetail(movement)}>
                Details
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableCard>

      <MovementDetailsDialog movement={detail} close={() => setDetail(null)} />
    </>
  );
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-medium break-words">{value || "—"}</div>
    </div>
  );
}

/** Carries the fields the list view drops, so the table can stay scannable. */
function MovementDetailsDialog({ movement, close }: { movement: AssetMovement | null; close: () => void }) {
  return (
    <Dialog open={!!movement} onOpenChange={(open) => { if (!open) close(); }}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        {movement && (
          <>
            <DialogHeader className="shrink-0 border-b px-6 py-4">
              <DialogTitle>Movement Details</DialogTitle>
              <DialogDescription>
                {movement.asset?.assetCode || movement.assetId} ·{" "}
                {new Date(movement.movementDate).toLocaleString()}
              </DialogDescription>
            </DialogHeader>

            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <DetailRow label="Asset Code" value={movement.asset?.assetCode || movement.assetId} />
                <DetailRow label="Job No." value={movementJobNo(movement)} />
                <DetailRow
                  label="Movement Type"
                  value={<Badge variant="secondary">{movementTypeLabel(movement.movementType)}</Badge>}
                />
                <DetailRow
                  label="Performed By"
                  value={movement.movedByUser?.fullName || movement.movedByUser?.username || movement.movedByUserId}
                />
              </div>

              <Separator />

              <div className="grid gap-4 sm:grid-cols-2">
                <DetailRow label="From Location" value={locationLabel(movement.fromLocation)} />
                <DetailRow label="To Location" value={locationLabel(movement.toLocation)} />
                <DetailRow label="From Department" value={departmentLabel(movement.fromDepartment)} />
                <DetailRow label="To Department" value={departmentLabel(movement.toDepartment)} />
              </div>

              <Separator />

              <div className="grid gap-4">
                <DetailRow label="Reason" value={movement.reason} />
                <DetailRow label="Remarks" value={movement.remarks} />
                <DetailRow label="Recorded At" value={new Date(movement.movementDate).toLocaleString()} />
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
