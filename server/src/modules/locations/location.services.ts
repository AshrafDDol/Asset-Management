import { LocationType, Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { AppError } from "../../utils/AppError";
import { CreateLocationInput, LocationFilters, UpdateLocationInput } from "./location.types";
import { buildLocationDisplayPath, loadLocationHierarchy, resolveLocationDepartment } from "./locationHierarchy";

const LOCATION_INCLUDE = {
  parentLocation: { select: { id: true, locationCode: true, name: true, locationType: true } },
  department: { select: { id: true, departmentCode: true, name: true } },
  _count: { select: { childLocations: true } },
};

function validateLocationType(value?: string) {
  if (!value) return undefined;
  if (!Object.values(LocationType).includes(value as LocationType)) throw new AppError("Invalid location type", 400);
  return value as LocationType;
}

async function validateParent(parentLocationId: number | null | undefined, childId?: number, childActive = true) {
  if (parentLocationId === undefined || parentLocationId === null) return;
  if (!Number.isInteger(parentLocationId) || parentLocationId <= 0) throw new AppError("Parent location must be a valid ID", 400);
  if (parentLocationId === childId) throw new AppError("A location cannot be its own parent", 400);

  const parent = await prisma.location.findUnique({ where: { id: parentLocationId } });
  if (!parent) throw new AppError("Parent location not found", 400);
  if (childActive && !parent.isActive) throw new AppError("Parent location is inactive", 400);

  const visited = new Set<number>();
  let current: typeof parent | null = parent;
  while (current) {
    if (visited.has(current.id)) throw new AppError("Location hierarchy contains a cycle", 400);
    visited.add(current.id);
    if (current.id === childId) throw new AppError("Location parent would create a cycle", 400);
    current = current.parentLocationId
      ? await prisma.location.findUnique({ where: { id: current.parentLocationId } })
      : null;
  }
}

async function validateDepartment(departmentId: number | null | undefined) {
  if (departmentId === undefined || departmentId === null) return;
  if (!Number.isInteger(departmentId) || departmentId <= 0) throw new AppError("Department must be a valid ID", 400);
  const department = await prisma.department.findUnique({ where: { id: departmentId } });
  if (!department || !department.isActive) throw new AppError("Department is invalid or inactive", 400);
}

export async function getLocationPath(id: number) {
  if (!Number.isInteger(id) || id <= 0) throw new AppError("Invalid location ID", 400);
  const path: Array<{ id: number; locationCode: string; name: string; locationType: LocationType }> = [];
  const visited = new Set<number>();
  let current = await prisma.location.findUnique({ where: { id } });
  if (!current) throw new AppError("Location not found", 404);
  while (current) {
    if (visited.has(current.id)) throw new AppError("Location hierarchy contains a cycle", 500);
    visited.add(current.id);
    path.unshift({ id: current.id, locationCode: current.locationCode, name: current.name, locationType: current.locationType });
    current = current.parentLocationId
      ? await prisma.location.findUnique({ where: { id: current.parentLocationId } })
      : null;
  }
  return { path, displayPath: path.map((item) => item.name).join(" / ") };
}

export async function getAllLocations(filters: LocationFilters = {}) {
  const locations = await prisma.location.findMany({
    where: { parentLocationId: filters.parentId, locationType: validateLocationType(filters.locationType) },
    include: LOCATION_INCLUDE,
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });
  const hierarchy = await loadLocationHierarchy();
  return locations.map((location) => ({
    ...location,
    displayPath: buildLocationDisplayPath(location.id, hierarchy),
    resolvedDepartment: resolveLocationDepartment(location.id, hierarchy),
  }));
}

export async function getLocationTree() {
  const locations = await prisma.location.findMany({ include: LOCATION_INCLUDE, orderBy: [{ name: "asc" }, { id: "asc" }] });
  const hierarchy = await loadLocationHierarchy();
  type TreeNode = (typeof locations)[number] & { resolvedDepartment: ReturnType<typeof resolveLocationDepartment>; children: TreeNode[] };
  const nodes = new Map<number, TreeNode>(locations.map((location) => [location.id, { ...location, resolvedDepartment: resolveLocationDepartment(location.id, hierarchy), children: [] }]));
  const roots: TreeNode[] = [];
  for (const location of locations) {
    const node = nodes.get(location.id)!;
    const parent = location.parentLocationId ? nodes.get(location.parentLocationId) : undefined;
    if (parent) parent.children.push(node); else roots.push(node);
  }
  return roots;
}

export async function getLocationById(id: number) {
  if (!Number.isInteger(id) || id <= 0) throw new AppError("Invalid location ID", 400);
  const location = await prisma.location.findUnique({ where: { id }, include: LOCATION_INCLUDE });
  if (!location) throw new AppError("Location not found", 404);
  const hierarchy = await loadLocationHierarchy();
  return { ...location, ...(await getLocationPath(id)), resolvedDepartment: resolveLocationDepartment(id, hierarchy) };
}

export async function createLocation(input: CreateLocationInput) {
  const locationCode = input.locationCode?.trim().toUpperCase();
  const name = input.name?.trim();
  if (!locationCode) throw new AppError("Location code is required", 400);
  if (!name) throw new AppError("Location name is required", 400);
  if (await prisma.location.findUnique({ where: { locationCode } })) throw new AppError("Location code already exists", 409);
  await validateParent(input.parentLocationId);
  await validateDepartment(input.departmentId);
  const location = await prisma.location.create({
    data: {
      locationCode,
      name,
      description: input.description?.trim() || null,
      parentLocationId: input.parentLocationId ?? null,
      departmentId: input.departmentId ?? null,
      locationType: validateLocationType(input.locationType) || LocationType.OTHER,
    },
    include: LOCATION_INCLUDE,
  });
  return getLocationById(location.id);
}

export async function updateLocation(id: number, input: UpdateLocationInput) {
  const existing = await prisma.location.findUnique({ where: { id } });
  if (!existing) throw new AppError("Location not found", 404);
  const locationCode = input.locationCode?.trim().toUpperCase();
  const name = input.name?.trim();
  if (input.locationCode !== undefined && !locationCode) throw new AppError("Location code is required", 400);
  if (input.name !== undefined && !name) throw new AppError("Location name is required", 400);
  if (locationCode && locationCode !== existing.locationCode && await prisma.location.findUnique({ where: { locationCode } })) {
    throw new AppError("Location code already exists", 409);
  }
  await validateParent(input.parentLocationId, id, input.isActive ?? existing.isActive);
  await validateDepartment(input.departmentId);
  await prisma.location.update({
    where: { id },
    data: {
      locationCode,
      name,
      description: input.description === undefined ? undefined : input.description.trim() || null,
      parentLocationId: input.parentLocationId,
      departmentId: input.departmentId,
      locationType: validateLocationType(input.locationType),
      isActive: input.isActive,
    },
    include: LOCATION_INCLUDE,
  });
  return getLocationById(id);
}

export async function deleteLocation(id: number) {
  if (!Number.isInteger(id) || id <= 0) throw new AppError("Invalid location ID", 400);
  try {
    return await prisma.$transaction(async (tx) => {
      const location = await tx.location.findUnique({ where: { id } });
      if (!location) throw new AppError("Location not found", 404);
      const [children, currentAssets, homeAssets, defaultBatches, batchItems, assignments, returnAssignments, fromMovements, toMovements] = await Promise.all([
        tx.location.count({ where: { parentLocationId: id } }),
        tx.asset.count({ where: { locationId: id } }),
        tx.asset.count({ where: { homeLocationId: id } }),
        tx.issueBatch.count({ where: { defaultToLocationId: id } }),
        tx.issueBatchItem.count({ where: { toLocationId: id } }),
        tx.assetAssignment.count({ where: { locationId: id } }),
        tx.assetAssignment.count({ where: { returnLocationId: id } }),
        tx.assetMovement.count({ where: { fromLocationId: id } }),
        tx.assetMovement.count({ where: { toLocationId: id } }),
      ]);
      if (children) throw new AppError("Cannot delete this Location because it has child Locations.", 409);
      if (currentAssets || homeAssets || defaultBatches || batchItems || assignments || returnAssignments || fromMovements || toMovements) {
        throw new AppError("Cannot delete this Location because Assets or history records reference it.", 409);
      }
      await tx.location.delete({ where: { id } });
      return location;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      throw new AppError("Cannot delete this Location because another record references it.", 409);
    }
    throw error;
  }
}
