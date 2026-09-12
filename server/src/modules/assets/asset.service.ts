import { validateHomeLocation } from "./assetHome";
import { AssetCondition, AssetStatus, Prisma } from "@prisma/client";
import { AppError } from "../../utils/AppError";
import { prisma } from "../../config/prisma";
import { AssetFilters, CreateAssetInput, UpdateAssetInput } from "./asset.types";
import { generateEpcCode, validateNewEpcCode } from "../asset-epcs/assetEpc.services";

const ASSET_SELECT = {
  id: true,
  assetCode: true,
  itemName: true,
  categoryId: true,
  locationId: true,
  homeLocationId: true,
  homeLocation: { select: { id: true, name: true, locationCode: true, parentLocationId: true, isActive: true, locationType: true } },
  serialNumber: true,
  brand: true,
  model: true,
  measurementHeight: true,
  measurementWidth: true,
  gridUp: true,
  radius: true,
  gapMm: true,
  purchaseDate: true,
  purchaseCost: true,
  status: true,
  condition: true,
  remarks: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  category: { select: { id: true, categoryCode: true, name: true } },
  location: {
    select: { id: true, locationCode: true, name: true, locationType: true, parentLocationId: true },
  },
  epc: { select: { id: true, epcCode: true, status: true, isActive: true } },
} satisfies Prisma.AssetSelect;

function validateCondition(condition?: string) {
  if (!condition) return undefined;
  if (!Object.values(AssetCondition).includes(condition as AssetCondition)) throw new AppError("Invalid asset condition", 400);
  return condition as AssetCondition;
}

function validateFilterStatus(status?: string) {
  if (!status) return undefined;
  if (!Object.values(AssetStatus).includes(status as AssetStatus)) throw new AppError("Invalid asset status", 400);
  return status as AssetStatus;
}

function parsePurchaseDate(value?: string) {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new AppError("Invalid purchase date", 400);
  return date;
}

async function getActiveCategory(categoryId?: number) {
  if (!categoryId || !Number.isInteger(categoryId)) throw new AppError("Active Asset Category is required", 400);
  const category = await prisma.assetCategory.findUnique({ where: { id: categoryId } });
  if (!category || !category.isActive) throw new AppError("Invalid or inactive Asset Category", 400);
  return category;
}

function optionalMeasurement(value: number | string | null | undefined, fieldName: string) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new AppError(`${fieldName} must be greater than zero`, 400);
  return new Prisma.Decimal(parsed.toFixed(2));
}

function optionalNonNegativeDecimal(value: number | string | null | undefined, fieldName: string) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new AppError(`${fieldName} must be zero or greater`, 400);
  return new Prisma.Decimal(parsed.toFixed(2));
}

function optionalPositiveInteger(value: number | string | null | undefined, fieldName: string) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new AppError(`${fieldName} must be a positive integer`, 400);
  return parsed;
}

async function validateOptionalLocation(locationId?: number, requireLocation = false) {
  if (requireLocation && !locationId) throw new AppError("Active location is required", 400);
  if (locationId) {
    const location = await prisma.location.findUnique({ where: { id: locationId } });
    if (!location || !location.isActive) throw new AppError("Invalid or inactive location", 400);
  }
}

async function addLocationPaths<T extends { location: { id: number } | null }>(assets: T[]) {
  const locations = await prisma.location.findMany({ select: { id: true, name: true, parentLocationId: true } });
  const byId = new Map(locations.map((location) => [location.id, location]));
  return assets.map((asset) => {
    const names: string[] = [];
    const visited = new Set<number>();
    let current = asset.location ? byId.get(asset.location.id) : undefined;
    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      names.unshift(current.name);
      current = current.parentLocationId ? byId.get(current.parentLocationId) : undefined;
    }
    return { ...asset, locationPath: names.join(" / ") || null };
  });
}

export async function getAllAssets(filters: AssetFilters = {}) {
  const assets = await prisma.asset.findMany({
    where: {
      status: validateFilterStatus(filters.status),
      locationId: filters.locationId,
      homeLocationId: filters.homeLocationId,
      categoryId: filters.categoryId,
      condition: validateCondition(filters.condition),
      assetCode: filters.assetCode ? { contains: filters.assetCode.trim() } : undefined,
      itemName: filters.itemName ? { contains: filters.itemName.trim() } : undefined,
      measurementHeight: filters.measurementHeight === undefined ? undefined : new Prisma.Decimal(filters.measurementHeight),
      measurementWidth: filters.measurementWidth === undefined ? undefined : new Prisma.Decimal(filters.measurementWidth),
      gridUp: filters.gridUp,
      radius: filters.radius === undefined ? undefined : new Prisma.Decimal(filters.radius),
      gapMm: filters.gapMm === undefined ? undefined : new Prisma.Decimal(filters.gapMm),
      epc: filters.epc ? { epcCode: { contains: filters.epc.trim().toUpperCase() } } : undefined,
    },
    select: ASSET_SELECT,
    orderBy: { createdAt: "desc" },
  });
  return addLocationPaths(assets);
}

export async function getAssetById(id: number) {
  if (!Number.isInteger(id) || id <= 0) throw new AppError("Invalid asset ID", 400);
  const asset = await prisma.asset.findUnique({ where: { id }, select: ASSET_SELECT });
  if (!asset) throw new AppError("Asset not found", 404);
  return (await addLocationPaths([asset]))[0];
}

export async function createAsset(input: CreateAssetInput) {
  const assetCode = input.assetCode?.trim().toUpperCase();
  const serialNumber = input.serialNumber?.trim() || null;
  const suppliedEpcValue = input.epc?.trim().toUpperCase() || input.epcCode?.trim().toUpperCase() || null;
  if (input.epc && input.epcCode && input.epc.trim().toUpperCase() !== input.epcCode.trim().toUpperCase()) {
    throw new AppError("epc and epcCode must match when both are supplied", 400);
  }
  if (suppliedEpcValue && input.autoGenerateEpc) throw new AppError("Supply an EPC or request auto-generation, not both", 400);
  const suppliedEpc = suppliedEpcValue ? validateNewEpcCode(suppliedEpcValue) : null;
  const autoGenerateEpc = input.autoGenerateEpc === true && !suppliedEpc;
  if (!assetCode) throw new AppError("Asset code is required", 400);

  const category = await getActiveCategory(Number(input.categoryId));
  await validateOptionalLocation(Number(input.locationId), true);
  if (await prisma.asset.findUnique({ where: { assetCode } })) throw new AppError("Asset code already exists", 409);
  if (serialNumber && await prisma.asset.findUnique({ where: { serialNumber } })) throw new AppError("Serial number already exists", 409);
  if (suppliedEpc && await prisma.assetEpc.findUnique({ where: { epcCode: suppliedEpc } })) throw new AppError("EPC code already exists", 409);

  const attempts = autoGenerateEpc ? 5 : 1;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const epcCode = suppliedEpc || (autoGenerateEpc ? generateEpcCode() : null);
    try {
      const asset = await prisma.$transaction(async (tx) => {
        await validateHomeLocation(tx, Number(input.locationId));
        const created = await tx.asset.create({
          data: {
            assetCode,
            itemName: input.itemName?.trim() || category.name,
            categoryId: category.id,
            locationId: Number(input.locationId),
            homeLocationId: Number(input.locationId),
            serialNumber,
            brand: input.brand?.trim() || null,
            model: input.model?.trim() || null,
            measurementHeight: optionalMeasurement(input.measurementHeight, "Measurement height"),
            measurementWidth: optionalMeasurement(input.measurementWidth, "Measurement width"),
            gridUp: optionalPositiveInteger(input.gridUp, "Grid / Up"),
            radius: optionalNonNegativeDecimal(input.radius, "Radius"),
            gapMm: optionalNonNegativeDecimal(input.gapMm, "Gap"),
            purchaseDate: parsePurchaseDate(input.purchaseDate),
            purchaseCost: input.purchaseCost,
            status: AssetStatus.AVAILABLE,
            condition: validateCondition(input.condition),
            remarks: input.remarks?.trim() || null,
            epc: epcCode ? { create: { epcCode } } : undefined,
          },
          select: ASSET_SELECT,
        });
        return created;
      });
      return (await addLocationPaths([asset]))[0];
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        if (autoGenerateEpc && attempt < attempts - 1) {
          const [assetCodeConflict, serialConflict] = await Promise.all([
            prisma.asset.findUnique({ where: { assetCode } }),
            serialNumber ? prisma.asset.findUnique({ where: { serialNumber } }) : null,
          ]);
          if (!assetCodeConflict && !serialConflict) continue;
        }
        throw new AppError("Asset code, serial number, or EPC code already exists", 409);
      }
      throw error;
    }
  }
  throw new AppError("Could not generate a unique EPC; try again", 409);
}

export async function updateAsset(id: number, input: UpdateAssetInput) {
  if (!Number.isInteger(id) || id <= 0) throw new AppError("Invalid asset ID", 400);
  const existing = await prisma.asset.findUnique({ where: { id } });
  if (!existing) throw new AppError("Asset not found", 404);
  const assetCode = input.assetCode?.trim().toUpperCase();
  const serialNumber = input.serialNumber?.trim();
  if (assetCode && await prisma.asset.findFirst({ where: { assetCode, id: { not: id } } })) throw new AppError("Asset code already exists", 409);
  if (serialNumber && await prisma.asset.findFirst({ where: { serialNumber, id: { not: id } } })) throw new AppError("Serial number already exists", 409);

  const category = input.categoryId === undefined ? undefined : await getActiveCategory(Number(input.categoryId));
  await validateOptionalLocation(input.locationId);

  const asset = await prisma.$transaction(async (tx) => {
    const locked = await tx.asset.findUniqueOrThrow({ where: { id } });
    const moving = input.locationId !== undefined && (input.locationId !== locked.locationId || locked.homeLocationId === null);
    const initializingLegacyHome = input.homeLocationId !== undefined && locked.homeLocationId === null;
    if (input.homeLocationId !== undefined) {
      if (locked.homeLocationId !== null && input.homeLocationId !== locked.homeLocationId) throw new AppError("Registered/home location is already verified and cannot be changed while the Asset is operational", 409);
      await validateHomeLocation(tx, input.homeLocationId);
    }
    if (moving) {
      if (locked.status !== AssetStatus.AVAILABLE) throw new AppError("Home/current location can only be changed while the Asset is AVAILABLE", 409);
      const [assignment, allocation] = await Promise.all([
        tx.assetAssignment.findFirst({ where: { assetId: id, status: "ACTIVE", isActive: true } }),
        tx.issueBatchItem.findFirst({ where: { assetId: id, status: { in: ["RESERVED", "ISSUED", "CONFIRMED"] } } }),
      ]);
      if (assignment || allocation) throw new AppError("Asset has an operational claim; location edit is blocked", 409);
      await validateHomeLocation(tx, input.locationId);
    }
    return tx.asset.update({
    where: { id },
    data: {
      assetCode,
      itemName: input.itemName?.trim(),
      categoryId: category?.id,
      locationId: input.locationId,
      homeLocationId: initializingLegacyHome ? input.homeLocationId : moving ? input.locationId : undefined,
      serialNumber,
      brand: input.brand?.trim(),
      model: input.model?.trim(),
      measurementHeight: optionalMeasurement(input.measurementHeight, "Measurement height"),
      measurementWidth: optionalMeasurement(input.measurementWidth, "Measurement width"),
      gridUp: optionalPositiveInteger(input.gridUp, "Grid / Up"),
      radius: optionalNonNegativeDecimal(input.radius, "Radius"),
      gapMm: optionalNonNegativeDecimal(input.gapMm, "Gap"),
      purchaseDate: parsePurchaseDate(input.purchaseDate),
      purchaseCost: input.purchaseCost,
      condition: validateCondition(input.condition),
      remarks: input.remarks?.trim(),
      isActive: input.isActive,
    },
    select: ASSET_SELECT,
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  return (await addLocationPaths([asset]))[0];
}

export async function deleteAsset(id: number) {
  if (!Number.isInteger(id) || id <= 0) throw new AppError("Invalid asset ID", 400);
  try {
    return await prisma.$transaction(async (tx) => {
      const asset = await tx.asset.findUnique({ where: { id }, select: { id: true, assetCode: true, status: true } });
      if (!asset) throw new AppError("Asset not found", 404);
      if (asset.status !== AssetStatus.AVAILABLE) {
        throw new AppError("Cannot delete this Asset while it is in an operational lifecycle state.", 409);
      }
      const [activeItem, activeAssignment, itemCount, assignmentCount, confirmationCount, movementCount] = await Promise.all([
        tx.issueBatchItem.findFirst({ where: { assetId: id, status: { in: ["RESERVED", "ISSUED", "CONFIRMED"] } }, select: { id: true } }),
        tx.assetAssignment.findFirst({ where: { assetId: id, status: "ACTIVE", isActive: true }, select: { id: true } }),
        tx.issueBatchItem.count({ where: { assetId: id } }),
        tx.assetAssignment.count({ where: { assetId: id } }),
        tx.assetScanConfirmation.count({ where: { assetId: id } }),
        tx.assetMovement.count({ where: { assetId: id } }),
      ]);
      if (activeItem || activeAssignment) throw new AppError("Cannot delete this Asset because it has an active operational claim.", 409);
      if (itemCount || assignmentCount || confirmationCount || movementCount) {
        throw new AppError("Cannot delete this Asset because it has lifecycle history.", 409);
      }
      await tx.assetEpc.deleteMany({ where: { assetId: id } });
      await tx.asset.delete({ where: { id } });
      return asset;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      throw new AppError("Cannot delete this Asset because it is referenced by operational history.", 409);
    }
    throw error;
  }
}
