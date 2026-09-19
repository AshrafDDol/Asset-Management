import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Plus, RefreshCw } from "lucide-react";
import type { Location } from "../api/locations.api";
import { LocationTreeSelect } from "../components/LocationTreeSelect";
import { ConfirmDeleteDialog, MasterDataModal } from "../components/MasterDataModal";
import { useLocationPagesFunction } from "./functionPages/LocationPagesFunction";
import { chronological, type ListOrder } from "../utils/listOrder";
import { useErrorToast } from "@/hooks/useErrorToast";
import { ErrorBox } from "@/components/common/ErrorBox";
import { Field, FilterCard } from "@/components/common/FilterCard";
import { PageHeader } from "@/components/common/PageHeader";
import { ORDER_OPTIONS, SelectField } from "@/components/common/SelectField";
import { StatusBadge } from "@/components/common/StatusBadge";
import { TableCard } from "@/components/common/TableCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TableCell, TableRow } from "@/components/ui/table";

type TreeRow = { location: Location; depth: number; hasChildren: boolean; isOpen: boolean; filterForced: boolean };
type LocationFilters = { name: string; type: string; code: string; department: string };

const EMPTY_FILTERS: LocationFilters = { name: "", type: "", code: "", department: "" };

const LOCATION_TYPES = ["STORAGE", "OPERATION", "REPAIR"];

const friendly = (value: string) => value.charAt(0) + value.slice(1).toLowerCase().replaceAll("_", " ");

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
  const [filters, setFilters] = useState<LocationFilters>(EMPTY_FILTERS);
  const [order, setOrder] = useState<ListOrder>("LATEST");
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const treeRows = useMemo(() => locationTreeRows(locations, expanded, filters, order), [locations, expanded, filters, order]);
  const locationTypes = useMemo(() => [...new Set(locations.map((location) => location.locationType))].sort(), [locations]);
  const editing = locations.find((item) => item.id === editingId);
  useErrorToast(error);
  const close = () => { handleCancelEdit(); setModalOpen(false); setConfirmingDelete(false); };
  const toggle = (id: number) => setExpanded((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const setFilter = (key: keyof LocationFilters, value: string) => setFilters((current) => ({ ...current, [key]: value }));

  const departmentOptions = departments.map((department) => ({
    value: String(department.id),
    label: `${department.departmentCode} — ${department.name}`,
  }));

  // Re-parenting a location under itself or one of its own descendants would make
  // a cycle. The flat list only had to exclude self; a tree puts the whole subtree
  // on screen, so the descendants are excluded too. They still render (you may need
  // to pass through them to reach a sibling) but cannot be chosen.
  const descendantsOfEditing = useMemo(() => {
    if (!editingId) return new Set<number>();
    const childrenOf = new Map<number, Location[]>();
    locations.forEach((location) => {
      const parent = location.parentLocationId;
      if (parent == null) return;
      childrenOf.set(parent, [...(childrenOf.get(parent) || []), location]);
    });
    const blocked = new Set<number>();
    const walk = (id: number) => {
      (childrenOf.get(id) || []).forEach((child) => {
        if (blocked.has(child.id)) return;
        blocked.add(child.id);
        walk(child.id);
      });
    };
    walk(editingId);
    return blocked;
  }, [locations, editingId]);

  const canBeParent = (location: Location) =>
    location.id !== editingId &&
    !descendantsOfEditing.has(location.id) &&
    location.isActive !== false;

  return (
    <>
      <PageHeader
        title="Locations"
        description="Manage the physical Location hierarchy for company Assets."
        actions={
          <>
            <Button onClick={() => { handleCancelEdit(); setModalOpen(true); }}>
              <Plus />
              Register Location
            </Button>
            <Button variant="outline" onClick={loadLocations}>
              <RefreshCw />
              Refresh
            </Button>
          </>
        }
      />

      {!modalOpen && <ErrorBox message={error} />}

      <FilterCard
        title="Location Search"
        summary={`${treeRows.length} visible row${treeRows.length === 1 ? "" : "s"}`}
        onClear={() => setFilters(EMPTY_FILTERS)}
      >
        <Field label="Location Name" htmlFor="filter-location-name">
          <Input id="filter-location-name" value={filters.name} onChange={(event) => setFilter("name", event.target.value)} placeholder="Search by name" />
        </Field>
        <Field label="Type" htmlFor="filter-location-type">
          <SelectField
            id="filter-location-type"
            value={filters.type}
            onChange={(value) => setFilter("type", value)}
            options={locationTypes.map((type) => ({ value: type, label: friendly(type) }))}
            emptyLabel="All types"
            placeholder="All types"
          />
        </Field>
        <Field label="Code" htmlFor="filter-location-code">
          <Input id="filter-location-code" value={filters.code} onChange={(event) => setFilter("code", event.target.value)} placeholder="Search by code" />
        </Field>
        <Field label="Department" htmlFor="filter-location-department">
          <SelectField
            id="filter-location-department"
            value={filters.department}
            onChange={(value) => setFilter("department", value)}
            options={departmentOptions}
            emptyLabel="All departments"
            placeholder="All departments"
          />
        </Field>
        <Field label="Order" htmlFor="filter-location-order">
          <SelectField id="filter-location-order" value={order} onChange={(value) => setOrder(value as ListOrder)} options={ORDER_OPTIONS} />
        </Field>
      </FilterCard>

      <TableCard
        columns={["No.", "Location", "Type", "Code", "Department", "Status", "Action"]}
        loading={loading}
        isEmpty={treeRows.length === 0}
        emptyMessage="No locations match the current filters."
        itemLabel="location"
      >
        {treeRows.map(({ location, depth, hasChildren, isOpen, filterForced }, index) => (
          <TableRow key={location.id}>
            <TableCell className="text-muted-foreground">{index + 1}</TableCell>
            <TableCell>
              <div className="flex items-center gap-1" style={{ paddingLeft: `${depth * 20}px` }}>
                {hasChildren ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-6 shrink-0"
                    disabled={filterForced}
                    title={filterForced ? "Expanded to show a filter match" : undefined}
                    aria-label={`${isOpen ? "Collapse" : "Expand"} ${location.name}`}
                    aria-expanded={isOpen}
                    onClick={() => toggle(location.id)}
                  >
                    {isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                  </Button>
                ) : (
                  <span className="size-6 shrink-0" />
                )}
                <span className="font-medium">{location.name}</span>
                {depth === 0 && <Badge variant="outline" className="ml-1 text-muted-foreground">Root</Badge>}
              </div>
            </TableCell>
            <TableCell className="text-muted-foreground">{location.locationType && friendly(location.locationType)}</TableCell>
            <TableCell className="font-mono text-xs">{location.locationCode}</TableCell>
            <TableCell>
              {location.department
                ? location.department.name
                : location.resolvedDepartment
                  ? `${location.resolvedDepartment.name} (Inherited)`
                  : "-"}
            </TableCell>
            <TableCell><StatusBadge isActive={location.isActive} /></TableCell>
            <TableCell>
              <Button variant="ghost" size="sm" onClick={() => { handleEditLocation(location); setModalOpen(true); }}>
                Edit
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableCard>

      {modalOpen && (
        <MasterDataModal title={editingId ? "Edit Location" : "Register Location"} busy={saving} onClose={close}>
          <ErrorBox message={error} />

          <form className="space-y-6" onSubmit={async (event) => { if (await handleCreateLocation(event)) { toast.success(editingId ? "Location updated." : "Location registered."); close(); } }}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Location Code *" htmlFor="location-code">
                <Input id="location-code" value={form.locationCode} onChange={(event) => updateForm("locationCode", event.target.value)} />
              </Field>
              <Field label="Location Name *" htmlFor="location-name">
                <Input id="location-name" value={form.name} onChange={(event) => updateForm("name", event.target.value)} />
              </Field>
              <Field label="Location Type" htmlFor="location-type">
                <SelectField
                  id="location-type"
                  value={form.locationType}
                  onChange={(value) => updateForm("locationType", value)}
                  options={LOCATION_TYPES.map((type) => ({ value: type, label: friendly(type) }))}
                  placeholder="Select type"
                />
              </Field>
              <Field label="Parent Location">
                <LocationTreeSelect
                  locations={locations}
                  selectedLocationId={form.parentLocationId}
                  onChange={(id) => updateForm("parentLocationId", String(id))}
                  allowedLocation={canBeParent}
                  allowClear
                  clearLabel="Root location"
                  onClear={() => updateForm("parentLocationId", "")}
                  placeholder="Root location"
                />
              </Field>
              <Field label="Department" htmlFor="location-department">
                <SelectField
                  id="location-department"
                  value={form.departmentId}
                  onChange={(value) => updateForm("departmentId", value)}
                  emptyLabel="Inherit from parent / None"
                  placeholder="Inherit from parent / None"
                  options={departments
                    .filter((department) => department.isActive !== false)
                    .map((department) => ({ value: String(department.id), label: `${department.departmentCode} — ${department.name}` }))}
                />
              </Field>
              <Field label="Description" htmlFor="location-description">
                <Input id="location-description" value={form.description} onChange={(event) => updateForm("description", event.target.value)} />
              </Field>
              {editingId && (
                <Field label="Status">
                  <div className="flex h-9 items-center gap-2">
                    <Checkbox id="location-active" checked={form.isActive} onCheckedChange={(checked) => updateForm("isActive", checked === true)} />
                    <Label htmlFor="location-active" className="font-normal">Active</Label>
                  </div>
                </Field>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              {editingId && (
                <Button type="button" variant="destructive" className="mr-auto" onClick={() => setConfirmingDelete(true)}>
                  Delete Location
                </Button>
              )}
              <Button type="button" variant="outline" onClick={close}>Cancel</Button>
              <Button disabled={saving} type="submit">
                {saving ? "Saving..." : editingId ? "Save Changes" : "Register"}
              </Button>
            </div>
          </form>

          {confirmingDelete && editing && (
            <ConfirmDeleteDialog
              title="Delete Location?"
              recordLabel={`${editing.locationCode} — ${editing.name}`}
              busy={saving}
              onCancel={() => setConfirmingDelete(false)}
              onConfirm={async () => { if (await handleDeleteLocation()) { toast.success("Location deleted."); close(); } else setConfirmingDelete(false); }}
            />
          )}
        </MasterDataModal>
      )}
    </>
  );
}
