import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";

type LocationClient = Prisma.TransactionClient | typeof prisma;

export type LocationHierarchyNode = {
  id: number;
  locationCode: string;
  name: string;
  parentLocationId: number | null;
  departmentId: number | null;
  department: { id: number; departmentCode: string; name: string } | null;
};

export async function loadLocationHierarchy(client: LocationClient = prisma) {
  const locations = await client.location.findMany({
    select: {
      id: true,
      locationCode: true,
      name: true,
      parentLocationId: true,
      departmentId: true,
      department: { select: { id: true, departmentCode: true, name: true } },
    },
  });
  return new Map(locations.map((location) => [location.id, location]));
}

export function getLocationAncestors(locationId: number | null, hierarchy: Map<number, LocationHierarchyNode>) {
  const ancestors: LocationHierarchyNode[] = [];
  const visited = new Set<number>();
  let current = locationId ? hierarchy.get(locationId) : undefined;
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    ancestors.push(current);
    current = current.parentLocationId ? hierarchy.get(current.parentLocationId) : undefined;
  }
  return ancestors;
}

export function resolveLocationDepartment(locationId: number | null, hierarchy: Map<number, LocationHierarchyNode>) {
  return getLocationAncestors(locationId, hierarchy).find((location) => location.department)?.department ?? null;
}

export function buildLocationDisplayPath(locationId: number | null, hierarchy: Map<number, LocationHierarchyNode>) {
  return getLocationAncestors(locationId, hierarchy).reverse().map((location) => location.name).join(" / ") || null;
}
