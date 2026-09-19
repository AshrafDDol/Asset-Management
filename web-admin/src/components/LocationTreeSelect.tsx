import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { ChevronDown, ChevronRight, ChevronsUpDown, Search as SearchIcon } from "lucide-react";
import type { Location } from "../api/locations.api";
import { locationDisplayName } from "../utils/locationDisplay";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";

type LocationTreeSelectProps = {
  locations: Location[];
  selectedLocationId?: number | string | null;
  onChange: (locationId: number) => void;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
  allowedLocation?: (location: Location) => boolean;
  pruneToAllowed?: boolean;
  allowClear?: boolean;
  clearLabel?: string;
  onClear?: () => void;
};

export function LocationTreeSelect({ locations, selectedLocationId, onChange, disabled, required, placeholder = "Select Location", allowedLocation, pruneToAllowed = false, allowClear = false, clearLabel = "Clear Selection", onClear }: LocationTreeSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set());
  const selected = locations.find((location) => String(location.id) === String(selectedLocationId ?? ""));
  const locationById = useMemo(
    () => new Map(locations.map((location) => [location.id, location])),
    [locations]
  );
  const visibleLocations = useMemo(() => {
    if (!pruneToAllowed || !allowedLocation) return locations;

    const visibleIds = new Set<number>();
    locations.filter(allowedLocation).forEach((location) => {
      let current: Location | undefined = location;
      const branchIds = new Set<number>();
      while (current && !branchIds.has(current.id)) {
        visibleIds.add(current.id);
        branchIds.add(current.id);
        current = current.parentLocationId
          ? locationById.get(current.parentLocationId)
          : undefined;
      }
    });
    return locations.filter((location) => visibleIds.has(location.id));
  }, [allowedLocation, locationById, locations, pruneToAllowed]);
  const locationPath = (location: Location) => {
    const names: string[] = [];
    const visited = new Set<number>();
    let current: Location | undefined = location;
    while (current && !visited.has(current.id)) {
      names.unshift(current.name);
      visited.add(current.id);
      current = current.parentLocationId
        ? locationById.get(current.parentLocationId)
        : undefined;
    }
    return names.join(" / ");
  };

  // Search results stay compact while their path preserves hierarchy context.
  const query = search.trim().toLowerCase();
  const matches = query
    ? visibleLocations.filter(
        (location) =>
          location.name.toLowerCase().includes(query) ||
          location.locationCode.toLowerCase().includes(query)
      )
    : [];
  const children = useMemo(() => {
    const result = new Map<number | null, Location[]>();
    visibleLocations.forEach((location) => result.set(location.parentLocationId ?? null, [...(result.get(location.parentLocationId ?? null) || []), location]));
    result.forEach((items) => items.sort((left, right) => left.name.localeCompare(right.name)));
    return result;
  }, [visibleLocations]);
  const toggle = (id: number) => setExpanded((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });

  const renderNodes = (parentId: number | null, depth: number): ReactNode =>
    (children.get(parentId) || []).map((location) => {
      const nested = children.get(location.id) || [];
      const expandedNode = expanded.has(location.id);
      const selectable = !allowedLocation || allowedLocation(location);
      const isSelected = selected?.id === location.id;

      return (
        <div key={location.id}>
          <div className="flex items-center gap-1" style={{ paddingLeft: `${depth * 16}px` }}>
            {nested.length > 0 ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-6 shrink-0"
                aria-label={`${expandedNode ? "Collapse" : "Expand"} ${location.name}`}
                aria-expanded={expandedNode}
                onClick={() => toggle(location.id)}
              >
                {expandedNode ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
              </Button>
            ) : (
              <span className="size-6 shrink-0" />
            )}
            <button
              type="button"
              disabled={!selectable}
              className={`flex-1 rounded-md px-2 py-1.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${isSelected ? "bg-accent" : "hover:bg-accent/60"}`}
              onClick={() => { onChange(location.id); setOpen(false); }}
            >
              <div className="text-sm">{location.name}</div>
              <div className="text-xs text-muted-foreground">
                {location.locationCode} · {location.locationType.replaceAll("_", " ")}
              </div>
            </button>
          </div>
          {expandedNode && renderNodes(location.id, depth + 1)}
        </div>
      );
    });

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (!next) setSearch("");
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className="h-auto w-full justify-between py-2 font-normal"
        >
          <span className="flex min-w-0 flex-col items-start">
            <span className="truncate">{selected ? locationDisplayName(selected) : placeholder}</span>
            <span className="text-xs text-muted-foreground">
              {selected?.locationCode || (required ? "Required" : "Optional")}
            </span>
          </span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) min-w-72 p-0">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name or code..."
            aria-label="Search locations"
            className="w-full bg-transparent py-2.5 pr-3 pl-9 text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <Separator />
        {allowClear && !query && (
          <>
            <button
              type="button"
              className="w-full px-3 py-2 text-left text-sm hover:bg-accent"
              onClick={() => { onClear?.(); setOpen(false); }}
            >
              {clearLabel}
            </button>
            <Separator />
          </>
        )}
        <div className="max-h-72 overflow-y-auto p-2" role="tree">
          {query ? (
            matches.length === 0 ? (
              <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                No locations match "{search.trim()}".
              </p>
            ) : (
              matches.map((location) => {
                const selectable = !allowedLocation || allowedLocation(location);
                return (
                  <button
                    key={location.id}
                    type="button"
                    disabled={!selectable}
                    className={`w-full rounded-md px-2 py-1.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                      selected?.id === location.id ? "bg-accent" : "hover:bg-accent/60"
                    }`}
                    onClick={() => { onChange(location.id); setOpen(false); }}
                  >
                    <div className="text-sm">{locationPath(location)}</div>
                    <div className="text-xs text-muted-foreground">
                      {location.locationCode} · {location.locationType.replaceAll("_", " ")}
                    </div>
                  </button>
                );
              })
            )
          ) : (
            renderNodes(null, 0)
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
