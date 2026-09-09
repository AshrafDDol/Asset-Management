import type { Location } from "../api/locations.api";

export function locationDisplayName(location?: Location | null) {
  return location?.name || location?.locationCode || "-";
}

export function locationDisplayPath(location?: Location | null) {
  return location?.displayPath || locationDisplayName(location);
}
