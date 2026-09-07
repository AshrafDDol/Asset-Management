import { MovementType } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { AppError } from "../../utils/AppError";
import { CreateAssetMovementInput } from "./assetMovement.types";
import { loadLocationHierarchy, resolveLocationDepartment } from "../locations/locationHierarchy";

const ASSET_MOVEMENT_SELECT = {
  id: true,
  movementNo: true,
  assetId: true,
  fromDepartmentId: true,
  toDepartmentId: true,
  fromLocationId: true,
  toLocationId: true,
  movedByUserId: true,
  movementType: true,
  movementDate: true,
  reason: true,
  remarks: true,
  createdAt: true,
  updatedAt: true,
  asset: {
    select: {
      id: true,
      assetCode: true,
      itemName: true,
      status: true,
      condition: true,
    },
  },
  movedByUser: {
    select: {
      id: true,
      username: true,
      fullName: true,
    },
  },
  fromDepartment: {
    select: {
      id: true,
      departmentCode: true,
      name: true,
    },
  },
  toDepartment: {
    select: {
      id: true,
      departmentCode: true,
      name: true,
    },
  },
  fromLocation: {
    select: {
      id: true,
      locationCode: true,
      name: true,
    },
  },
  toLocation: {
    select: {
      id: true,
      locationCode: true,
      name: true,
    },
  },
};

function generateMovementNo() {
  return `MOV-${Date.now()}`;
}

function parseDate(value?: string) {
  if (!value) return undefined;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new AppError("Invalid movement date", 400);
  }

  return date;
}

function parseOptionalId(
  value: unknown,
  fieldName: string
) : number | undefined {
  if (value === undefined || value === null || value === "" ) {
    return undefined;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new AppError(`${fieldName} must be a valid ID`, 400);
  }

  return parsed;
}

function parseRequiredId (
  value: unknown,
  fieldName: string
) : number {
  const parsed = parseOptionalId(value, fieldName);

  if (!parsed) {
    throw new AppError(`${fieldName} is required`, 400);
  }

  return parsed;
}

function getMovementType (
  fromDepartmentId?: number | null,
  toDepartmentId?: number | null,
  fromLocationId?: number | null,
  toLocationId?: number | null,
) {
  const departmentChanged =
    toDepartmentId !== undefined &&
    toDepartmentId !== null &&
    toDepartmentId !== fromDepartmentId;

  const locationChanged =
    toLocationId !== undefined &&
    toLocationId !== null &&
    toLocationId !== fromLocationId;
  
  if (departmentChanged && locationChanged) {
    return MovementType.FULL_TRANSFER;
  }

  if (departmentChanged) {
    return MovementType.DEPARTMENT_TRANSFER;
  }

  if (locationChanged) {
    return MovementType.LOCATION_TRANSFER;
  }

  throw new AppError("No changes detected in department or location", 400);
}

async function validateDepartment(departmentId?: number | null) {
  if (!departmentId) return;

  const department = await prisma.department.findUnique({
    where: { id: departmentId },
  });

  if (!department || !department.isActive) {
    throw new AppError("Invalid or inactive department", 400);
  }
}


async function validateLocation(locationId?: number | null) {
  if (!locationId) return;

  const location = await prisma.location.findUnique({
    where: { id: locationId },
  });

  if (!location || !location.isActive) {
    throw new AppError("Invalid or inactive location", 400);
  }
}

async function validateUser(userId: number) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user || !user.isActive) {
    throw new AppError("Invalid or inactive user", 400);
  }
}

export async function getAllAssetMovements() {
  return prisma.assetMovement.findMany({
    select: ASSET_MOVEMENT_SELECT,
    orderBy: {
      createdAt: "desc",
    },
  });
}

export async function getAssetMovementById(id: number) {
  if (!id) {
    throw new AppError("Invalid movement ID", 400);
  }

  const movement = await prisma.assetMovement.findUnique({
    where: { id },
    select: ASSET_MOVEMENT_SELECT,
  });

  if (!movement) {
    throw new AppError("Asset movement not found", 404);
  }

  return movement;
}

export async function getAssetMovementsByAsset(assetId: number) {
  if (!assetId) {
    throw new AppError("Invalid asset ID", 400);
  }

  return prisma.assetMovement.findMany({
    where: { assetId },
    select: ASSET_MOVEMENT_SELECT,
    orderBy: {
      createdAt: "desc",
    },
  });
}

export async function createAssetMovement(
  input: CreateAssetMovementInput,
  movedByUserId: number
) {
  const assetId = parseRequiredId(input.assetId, "Asset");
  const toDepartmentId = parseOptionalId(input.toDepartmentId, "Department");
  const toLocationId = parseOptionalId(input.toLocationId, "Location");

  if (!toDepartmentId && !toLocationId) {
    throw new AppError ("New Department or new Location is required", 400); 
  }

  const asset = await prisma.asset.findUnique({
    where: { id: assetId },
  });

  if (!asset || !asset.isActive) {
    throw new AppError("Invalid or inactive asset", 400);
  }

  if (asset.status === "LOST" || asset.status === "DISPOSED") {
    throw new AppError("Cannot move an asset that is lost or disposed", 400);
  }

  await validateUser(movedByUserId);
  await validateDepartment(toDepartmentId);
  await validateLocation(toLocationId);

  const movement = await prisma.$transaction(async (tx) => {
    const locationHierarchy = await loadLocationHierarchy(tx);
    const fromDepartmentId = resolveLocationDepartment(asset.locationId, locationHierarchy)?.id ?? null;
    const resolvedToDepartmentId = toLocationId
      ? resolveLocationDepartment(toLocationId, locationHierarchy)?.id ?? null
      : toDepartmentId ?? null;
    const movementType = getMovementType(
      fromDepartmentId,
      resolvedToDepartmentId,
      asset.locationId,
      toLocationId,
    );
    const createdMovement = await tx.assetMovement.create({
      data: {
        movementNo: generateMovementNo(),
        assetId,
        fromDepartmentId,
        toDepartmentId: resolvedToDepartmentId,
        fromLocationId: asset.locationId,
        toLocationId: toLocationId ?? null,
        movedByUserId,
        movementType,
        movementDate: parseDate(input.movementDate),
        reason: input.reason?.trim() || null,
        remarks: input.remarks?.trim() || null,
      },
      select: ASSET_MOVEMENT_SELECT,
    });

    await tx.asset.update({
      where: { id: assetId },
      data: {
        locationId: toLocationId ?? asset.locationId,
      },
    });

    return createdMovement;
  });

  return movement;
}
