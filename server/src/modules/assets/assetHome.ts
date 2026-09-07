import { LocationType, Prisma } from "@prisma/client";
import { AppError } from "../../utils/AppError";

export const STORAGE_TYPES: LocationType[] = ["STORE", "WAREHOUSE", "RACK", "LEVEL", "BIN", "FILE"];
export async function validateHomeLocation(tx: Prisma.TransactionClient, id: number | null | undefined) {
  if (!id || !Number.isInteger(id)) throw new AppError("Asset home location is unresolved. An administrator must verify its registered storage location before return/issue.", 409);
  const location = await tx.location.findUnique({ where: { id } });
  if (!location?.isActive || !STORAGE_TYPES.includes(location.locationType)) throw new AppError("Asset home location must be active and storage-compatible", 409);
  return location;
}
