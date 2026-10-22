import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { Asset } from "@/api/assets.api";
import type { Location } from "@/api/locations.api";
import { SelectField } from "@/components/common/SelectField";
import { TablePagination } from "@/components/common/TablePagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type CountMode = "DIRECT" | "TOTAL";
type LocationRow = {
  location: Location;
  depth: number;
  direct: number;
  total: number;
  hasChildren: boolean;
  contextOnly: boolean;
};

const LOCATION_TYPES = ["STORAGE", "OPERATION", "REPAIR"];

export function AssetLocationOverview({ assets, locations, loading, error, categoryId }: { assets: Asset[]; locations: Location[]; loading: boolean; error: string; categoryId?: string }) {
  const navigate = useNavigate();
  const [locationType, setLocationType] = useState("");
  const [countMode, setCountMode] = useState<CountMode>("TOTAL");
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const overview = useMemo(() => {
    const byId = new Map(locations.map((location) => [location.id, location]));
    const children = new Map<number, Location[]>();
    locations.forEach((location) => {
      if (location.parentLocationId != null && byId.has(location.parentLocationId)) {
        children.set(location.parentLocationId, [...(children.get(location.parentLocationId) || []), location]);
      }
    });
    children.forEach((items) => items.sort((left, right) => left.name.localeCompare(right.name) || left.id - right.id));

    const direct = new Map<number, number>();
    let unassigned = 0;
    assets.forEach((asset) => {
      if (asset.locationId == null || !byId.has(asset.locationId)) unassigned += 1;
      else direct.set(asset.locationId, (direct.get(asset.locationId) || 0) + 1);
    });

    const totals = new Map<number, number>();
    const totalFor = (id: number, ancestors = new Set<number>()): number => {
      if (ancestors.has(id)) return 0;
      const cached = totals.get(id);
      if (cached !== undefined) return cached;
      const branch = new Set(ancestors);
      branch.add(id);
      const total = (direct.get(id) || 0) + (children.get(id) || []).reduce((sum, child) => sum + totalFor(child.id, branch), 0);
      totals.set(id, total);
      return total;
    };
    locations.forEach((location) => totalFor(location.id));

    const matches = new Set(locations.filter((location) => !locationType || location.locationType === locationType).map((location) => location.id));
    const included = new Set<number>();
    matches.forEach((id) => {
      let current = byId.get(id);
      const visited = new Set<number>();
      while (current && !visited.has(current.id)) {
        visited.add(current.id);
        included.add(current.id);
        current = current.parentLocationId != null ? byId.get(current.parentLocationId) : undefined;
      }
    });

    const roots = locations
      .filter((location) => included.has(location.id) && (location.parentLocationId == null || !byId.has(location.parentLocationId)))
      .sort((left, right) => left.name.localeCompare(right.name) || left.id - right.id);
    const reachable = new Set<number>();
    const markReachable = (location: Location, branch = new Set<number>()) => {
      if (branch.has(location.id) || reachable.has(location.id) || !included.has(location.id)) return;
      reachable.add(location.id);
      const nextBranch = new Set(branch);
      nextBranch.add(location.id);
      (children.get(location.id) || []).forEach((child) => markReachable(child, nextBranch));
    };
    roots.forEach((root) => markReachable(root));
    // Corrupt cyclic components have no natural root. Keep one stable representative
    // per disconnected component so the data remains visible without promoting every child.
    locations
      .filter((location) => included.has(location.id) && !reachable.has(location.id))
      .sort((left, right) => left.name.localeCompare(right.name) || left.id - right.id)
      .forEach((location) => {
        if (!reachable.has(location.id)) {
          roots.push(location);
          markReachable(location);
        }
      });
    roots.sort((left, right) => left.name.localeCompare(right.name) || left.id - right.id);

    const totalPages = Math.max(1, Math.ceil(roots.length / pageSize));
    const currentPage = Math.min(page, totalPages);
    const pageRoots = roots.slice((currentPage - 1) * pageSize, currentPage * pageSize);
    const rows: LocationRow[] = [];
    const rendered = new Set<number>();
    const visit = (location: Location, depth: number) => {
      if (rendered.has(location.id) || !included.has(location.id)) return;
      rendered.add(location.id);
      const nested = (children.get(location.id) || []).filter((child) => included.has(child.id));
      const contextOnly = !matches.has(location.id);
      rows.push({ location, depth, direct: direct.get(location.id) || 0, total: totals.get(location.id) || 0, hasChildren: nested.length > 0, contextOnly });
      const open = expanded.has(location.id) || (Boolean(locationType) && contextOnly);
      if (open) nested.forEach((child) => visit(child, depth + 1));
    };
    pageRoots.forEach((root) => visit(root, 0));

    return { rows, unassigned, grandTotal: assets.length, rootCount: roots.length, currentPage };
  }, [assets, expanded, locationType, locations, page, pageSize]);

  const maxCount = Math.max(1, ...overview.rows.map((row) => countMode === "DIRECT" ? row.direct : row.total), overview.unassigned);
  const toggle = (id: number) => setExpanded((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const drillDown = (locationId: number | "unassigned", scope: "direct" | "total") => {
    const params = new URLSearchParams({ currentLocationId: String(locationId), locationScope: scope });
    if (categoryId) params.set("categoryId", categoryId);
    navigate(`/assets?${params.toString()}`);
  };
  const countButton = (count: number, label: "Direct" | "Total", locationId: number | "unassigned", scope: "direct" | "total", locationLabel: string) => (
    <button
      type="button"
      onClick={() => drillDown(locationId, scope)}
      className="rounded-md border border-transparent px-2 py-1 text-right text-sm tabular-nums transition-colors hover:border-border hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={`View ${label.toLowerCase()} assets for ${locationLabel}`}
    >
      <span className="block font-medium text-primary hover:underline">{count}</span>
      <span className="block text-[10px] text-muted-foreground">{label}</span>
    </button>
  );

  return (
    <Card>
      <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle>Asset Location Overview</CardTitle>
          <CardDescription>
            {overview.grandTotal} current assets. Type filters location rows; totals always include descendants of every type.
          </CardDescription>
        </div>
        <div className="flex flex-wrap gap-2">
          <SelectField value={locationType} onChange={(value) => { setLocationType(value); setPage(1); }} options={LOCATION_TYPES.map((value) => ({ value, label: value }))} emptyLabel="All location types" placeholder="All location types" className="w-48" />
          <SelectField value={countMode} onChange={(value) => setCountMode(value as CountMode)} options={[{ value: "DIRECT", label: "Direct Assets" }, { value: "TOTAL", label: "Total Assets" }]} className="w-40" />
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="px-6 pb-6">
        {loading ? (
          <div className="space-y-3">{Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-12 w-full" />)}</div>
        ) : error ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error}</p>
        ) : overview.rows.length === 0 && overview.unassigned === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">No locations match this view.</p>
        ) : (
          <div className="max-h-[34rem] space-y-1 overflow-auto pr-2">
            {overview.rows.map((row) => {
              const value = countMode === "DIRECT" ? row.direct : row.total;
              const path = row.location.displayPath || row.location.name;
              return (
                <div key={row.location.id} className={`grid min-w-[640px] grid-cols-[minmax(260px,1fr)_minmax(180px,2fr)_80px_80px] items-center gap-3 rounded-md px-2 py-2 ${row.contextOnly ? "bg-muted/30" : "hover:bg-muted/50"}`}>
                  <div className="flex min-w-0 items-center gap-1" style={{ paddingLeft: `${row.depth * 16}px` }}>
                    {row.hasChildren ? <Button type="button" variant="ghost" size="icon" className="size-7 shrink-0" onClick={() => toggle(row.location.id)} aria-label={`${expanded.has(row.location.id) ? "Collapse" : "Expand"} ${path}`}>{expanded.has(row.location.id) ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}</Button> : <span className="size-7 shrink-0" />}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2"><span className="truncate text-sm font-medium" title={path}>{row.location.name}</span>{row.location.isActive === false && <Badge variant="outline">Inactive</Badge>}{row.contextOnly && <Badge variant="outline">Context</Badge>}</div>
                      <div className="truncate text-xs text-muted-foreground" title={path}>{path} · {row.location.locationCode} · {row.location.locationType}</div>
                    </div>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${value === 0 ? 0 : Math.max(2, (value / maxCount) * 100)}%` }} /></div>
                  {countButton(row.direct, "Direct", row.location.id, "direct", path)}
                  {countButton(row.total, "Total", row.location.id, "total", path)}
                </div>
              );
            })}
            {overview.unassigned > 0 && overview.currentPage === 1 && <div className="grid min-w-[640px] grid-cols-[minmax(260px,1fr)_minmax(180px,2fr)_80px_80px] items-center gap-3 rounded-md px-2 py-2 hover:bg-muted/50"><div className="pl-8"><div className="text-sm font-medium">Unassigned</div><div className="text-xs text-muted-foreground">Not included in the location pagination count</div></div><div className="h-3 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(2, (overview.unassigned / maxCount) * 100)}%` }} /></div>{countButton(overview.unassigned, "Direct", "unassigned", "direct", "Unassigned")}{countButton(overview.unassigned, "Total", "unassigned", "total", "Unassigned")}</div>}
          </div>
        )}
        </div>
        {!loading && !error && <TablePagination page={overview.currentPage} pageSize={pageSize} total={overview.rootCount} onPageChange={setPage} onPageSizeChange={(value) => { setPageSize(value); setPage(1); }} itemLabel="location" pageSizeOptions={[10, 20, 50]} />}
      </CardContent>
    </Card>
  );
}
