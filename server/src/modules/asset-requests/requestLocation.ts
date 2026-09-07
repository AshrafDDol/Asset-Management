import { LocationType, Prisma } from "@prisma/client";
import { AppError } from "../../utils/AppError";

export async function validateRequestRoot(tx: Prisma.TransactionClient, id: number) {
  if (!Number.isInteger(id) || id <= 0) throw new AppError("Root Location is required", 400);
  const root = await tx.location.findUnique({ where: { id } });
  if (!root?.isActive || root.parentLocationId !== null) throw new AppError("Select an active root Location", 400);
  return root;
}

export async function validateRequestDestination(tx: Prisma.TransactionClient, rootId: number | null, destinationId: number) {
  const destination = await tx.location.findUnique({ where: { id: destinationId } });
  if (!destination?.isActive) throw new AppError("Specific Location is invalid or inactive", 400);
  // Historical rootless requests retain their previous destination rules; no guessed backfill.
  if (rootId === null) {
    if (destination.locationType !== LocationType.PRODUCTION_AREA && destination.locationType !== LocationType.MACHINE_LOCATION) throw new AppError("Legacy rootless requests require an operation location", 400);
    return;
  }
  await validateRequestRoot(tx, rootId);
  const visited = new Set<number>();
  let node: typeof destination | null = destination;
  while (node && !visited.has(node.id)) {
    if (node.id === rootId) return;
    visited.add(node.id);
    node = node.parentLocationId ? await tx.location.findUnique({ where: { id: node.parentLocationId } }) : null;
  }
  throw new AppError("Specific Location must be the Root Location or one of its descendants", 400);
}
