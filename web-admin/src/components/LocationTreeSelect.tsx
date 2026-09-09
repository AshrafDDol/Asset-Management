import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { Location } from "../api/locations.api";
import { locationDisplayName } from "../utils/locationDisplay";

type LocationTreeSelectProps = {
  locations: Location[];
  selectedLocationId?: number | string | null;
  onChange: (locationId: number) => void;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
  allowedLocation?: (location: Location) => boolean;
  allowClear?: boolean;
  clearLabel?: string;
  onClear?: () => void;
};

export function LocationTreeSelect({ locations, selectedLocationId, onChange, disabled, required, placeholder = "Select Location", allowedLocation, allowClear = false, clearLabel = "Clear Selection", onClear }: LocationTreeSelectProps) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set());
  const selected = locations.find((location) => String(location.id) === String(selectedLocationId ?? ""));
  const children = useMemo(() => {
    const result = new Map<number | null, Location[]>();
    locations.forEach((location) => result.set(location.parentLocationId ?? null, [...(result.get(location.parentLocationId ?? null) || []), location]));
    result.forEach((items) => items.sort((left, right) => left.name.localeCompare(right.name)));
    return result;
  }, [locations]);
  const toggle = (id: number) => setExpanded((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const renderNodes = (parentId: number | null, depth: number): ReactNode => (children.get(parentId) || []).map((location) => {
    const nested = children.get(location.id) || [];
    const expandedNode = expanded.has(location.id);
    const selectable = !allowedLocation || allowedLocation(location);
    return <div key={location.id}>
      <div className="location-select-row" style={{ paddingLeft: `${depth * 20}px` }}>
        {nested.length > 0 ? <button type="button" className="location-select-toggle" aria-label={`${expandedNode ? "Collapse" : "Expand"} ${location.name}`} aria-expanded={expandedNode} onClick={() => toggle(location.id)}>{expandedNode ? "−" : "+"}</button> : <span className="location-select-spacer" />}
        <button type="button" className="location-select-option" disabled={!selectable} onClick={() => { onChange(location.id); setOpen(false); }}><span>{location.name}</span><small>{location.locationCode} · {location.locationType.replaceAll("_", " ")}</small></button>
      </div>
      {expandedNode && renderNodes(location.id, depth + 1)}
    </div>;
  });

  return <div className={`location-tree-select${disabled ? " disabled" : ""}`}>
    <button type="button" className="location-tree-select-trigger" disabled={disabled} aria-haspopup="tree" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
      <span>{selected ? locationDisplayName(selected) : placeholder}</span><small>{selected?.locationCode || (required ? "Required" : "Optional")}</small>
    </button>
    {open && <div className="location-tree-select-menu" role="tree"><div className="location-tree-select-header"><strong>Select Location</strong><button type="button" className="table-button" onClick={() => setOpen(false)}>Close</button></div>{allowClear && <button type="button" className="location-select-clear" onClick={() => { onClear?.(); setOpen(false); }}>{clearLabel}</button>}{renderNodes(null, 0)}</div>}
  </div>;
}
