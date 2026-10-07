import { AssetCondition, AssetStatus, Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { AppError } from "../../utils/AppError";
import { generateEpcCode, validateNewEpcCode } from "../asset-epcs/assetEpc.services";
import { validateHomeLocation } from "./assetHome";
import type { AssetImportRowInput } from "./asset.types";

type DbClient = Prisma.TransactionClient | typeof prisma;
export type AssetImportRowResult = { sourceRow: number; assetCode: string; itemName: string; categoryCode: string; storageLocationCode: string; epc: string; valid: boolean; errors: string[] };
export type AssetImportValidationResult = { valid: boolean; rowCount: number; rows: AssetImportRowResult[] };
type PreparedRow = { sourceRow: number; assetCode: string; itemName: string; categoryId: number; locationId: number; measurementHeight: Prisma.Decimal | null; measurementWidth: Prisma.Decimal | null; gridUp: number | null; radius: Prisma.Decimal | null; gapMm: Prisma.Decimal | null; serialNumber: string | null; brand: string | null; model: string | null; purchaseDate: Date | null; purchaseCost: Prisma.Decimal | null; condition: AssetCondition | null; epc: string | null; autoGenerateEpc: boolean; remarks: string | null };

function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function decimal(value: unknown, label: string, errors: string[], rule: "positive" | "nonnegative") {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || (rule === "positive" ? parsed <= 0 : parsed < 0)) { errors.push(`${label} must be ${rule === "positive" ? "greater than zero" : "zero or greater"}.`); return null; }
  return new Prisma.Decimal(parsed.toFixed(2));
}
function purchaseCost(value: unknown, errors: string[]) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) { errors.push("Purchase Cost must be a valid number."); return null; }
  return new Prisma.Decimal(parsed.toFixed(2));
}
function date(value: unknown, errors: string[]) {
  const raw = text(value); if (!raw) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) { errors.push("Purchase Date must use YYYY-MM-DD."); return null; }
  const parsed = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== raw) { errors.push("Purchase Date is invalid."); return null; }
  return parsed;
}
function positiveInteger(value: unknown, errors: string[]) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value); if (!Number.isInteger(parsed) || parsed <= 0) { errors.push("Grid / Up must be a positive integer."); return null; } return parsed;
}
function autoFlag(value: unknown, errors: string[]) {
  if (value === undefined || value === null || value === "") return false;
  if (value === true || (typeof value === "string" && value.trim().toUpperCase() === "YES")) return true;
  if (value === false || (typeof value === "string" && value.trim().toUpperCase() === "NO")) return false;
  errors.push("Auto Generate EPC must be YES or NO."); return false;
}

async function prepare(rows: AssetImportRowInput[], db: DbClient) {
  if (!Array.isArray(rows) || rows.length === 0) throw new AppError("At least one import row is required", 400);
  if (rows.length > 500) throw new AppError("A maximum of 500 asset rows may be imported at once", 400);
  const categories = await db.assetCategory.findMany({ where: { categoryCode: { in: rows.map(r => text(r.categoryCode).toUpperCase()).filter(Boolean) } } });
  const locations = await db.location.findMany({ where: { locationCode: { in: rows.map(r => text(r.storageLocationCode).toUpperCase()).filter(Boolean) } } });
  const categoryByCode = new Map(categories.map(v => [v.categoryCode.toUpperCase(), v]));
  const locationByCode = new Map(locations.map(v => [v.locationCode.toUpperCase(), v]));
  const assetCodes = rows.map(r => text(r.assetCode).toUpperCase()).filter(Boolean);
  const serials = rows.map(r => text(r.serialNumber)).filter(Boolean);
  const epcs = rows.map(r => text(r.epc).toUpperCase()).filter(Boolean);
  const [existingAssets, existingSerials, existingEpcs] = await Promise.all([
    db.asset.findMany({ where: { assetCode: { in: assetCodes } }, select: { assetCode: true } }),
    serials.length ? db.asset.findMany({ where: { serialNumber: { in: serials } }, select: { serialNumber: true } }) : [],
    epcs.length ? db.assetEpc.findMany({ where: { epcCode: { in: epcs } }, select: { epcCode: true } }) : [],
  ]);
  const existingAssetSet = new Set(existingAssets.map(v => v.assetCode.toUpperCase()));
  const existingSerialSet = new Set(existingSerials.map(v => v.serialNumber || ""));
  const existingEpcSet = new Set(existingEpcs.map(v => v.epcCode.toUpperCase()));
  const counts = (values: string[]) => values.reduce((map, value) => (value && map.set(value, (map.get(value) || 0) + 1), map), new Map<string, number>());
  const assetCounts = counts(assetCodes), serialCounts = counts(serials), epcCounts = counts(epcs);
  const prepared: PreparedRow[] = []; const results: AssetImportRowResult[] = [];
  for (const row of rows) {
    const errors: string[] = []; const assetCode = text(row.assetCode).toUpperCase(); const itemName = text(row.itemName);
    const categoryCode = text(row.categoryCode).toUpperCase(); const locationCode = text(row.storageLocationCode).toUpperCase();
    if (!assetCode) errors.push("Asset Code is required."); if (!itemName) errors.push("Item Name is required.");
    if (!categoryCode) errors.push("Category Code is required."); if (!locationCode) errors.push("Storage Location Code is required.");
    const category = categoryByCode.get(categoryCode); const location = locationByCode.get(locationCode);
    if (categoryCode && (!category || !category.isActive)) errors.push("Category Code does not identify an active category.");
    if (locationCode && (!location || !location.isActive || location.locationType !== "STORAGE")) errors.push("Storage Location Code does not identify an active STORAGE location.");
    const serialNumber = text(row.serialNumber) || null; let epc = text(row.epc).toUpperCase() || null; const autoGenerateEpc = autoFlag(row.autoGenerateEpc, errors);
    if (epc && autoGenerateEpc) errors.push("Supply an EPC or request auto-generation, not both.");
    if (epc) { try { epc = validateNewEpcCode(epc); } catch (error) { errors.push(error instanceof Error ? error.message : "EPC is invalid."); } }
    if (assetCode && ((assetCounts.get(assetCode) || 0) > 1)) errors.push("Asset Code is duplicated in this file.");
    if (serialNumber && ((serialCounts.get(serialNumber) || 0) > 1)) errors.push("Serial Number is duplicated in this file.");
    if (epc && ((epcCounts.get(epc) || 0) > 1)) errors.push("EPC is duplicated in this file.");
    if (existingAssetSet.has(assetCode)) errors.push("Asset Code already exists."); if (serialNumber && existingSerialSet.has(serialNumber)) errors.push("Serial Number already exists."); if (epc && existingEpcSet.has(epc)) errors.push("EPC already exists.");
    const conditionRaw = text(row.condition).toUpperCase(); let condition: AssetCondition | null = null;
    if (conditionRaw) { if (Object.values(AssetCondition).includes(conditionRaw as AssetCondition)) condition = conditionRaw as AssetCondition; else errors.push("Condition is invalid."); }
    const value: PreparedRow = { sourceRow: row.sourceRow, assetCode, itemName, categoryId: category?.id || 0, locationId: location?.id || 0, measurementHeight: decimal(row.measurementHeight, "Measurement Height", errors, "positive"), measurementWidth: decimal(row.measurementWidth, "Measurement Width", errors, "positive"), gridUp: positiveInteger(row.gridUp, errors), radius: decimal(row.radius, "Radius", errors, "nonnegative"), gapMm: decimal(row.gapMm, "Gap", errors, "nonnegative"), serialNumber, brand: text(row.brand) || null, model: text(row.model) || null, purchaseDate: date(row.purchaseDate, errors), purchaseCost: purchaseCost(row.purchaseCost, errors), condition, epc, autoGenerateEpc, remarks: text(row.remarks) || null };
    prepared.push(value); results.push({ sourceRow: row.sourceRow, assetCode, itemName, categoryCode, storageLocationCode: locationCode, epc: epc || (autoGenerateEpc ? "Auto-generate" : ""), valid: errors.length === 0, errors });
  }
  return { prepared, validation: { valid: results.every(r => r.valid), rowCount: rows.length, rows: results } satisfies AssetImportValidationResult };
}

export async function validateAssetImport(rows: AssetImportRowInput[]) { return (await prepare(rows, prisma)).validation; }

export async function importAssets(rows: AssetImportRowInput[]) {
  try { return await prisma.$transaction(async tx => {
    const { prepared, validation } = await prepare(rows, tx);
    if (!validation.valid) return { ...validation, importedCount: 0, assets: [] };
    const created: Array<{ id: number; assetCode: string; epcCode: string | null }> = []; const generated = new Set<string>();
    for (const row of prepared) {
      await validateHomeLocation(tx, row.locationId);
      let epcCode = row.epc;
      if (row.autoGenerateEpc) {
        for (let attempt = 0; attempt < 10; attempt += 1) { const candidate = generateEpcCode(); if (!generated.has(candidate) && !await tx.assetEpc.findUnique({ where: { epcCode: candidate } })) { epcCode = candidate; generated.add(candidate); break; } }
        if (!epcCode) throw new AppError("Could not generate a unique EPC; try again", 409);
      }
      const asset = await tx.asset.create({ data: { assetCode: row.assetCode, itemName: row.itemName, categoryId: row.categoryId, locationId: row.locationId, homeLocationId: row.locationId, measurementHeight: row.measurementHeight, measurementWidth: row.measurementWidth, gridUp: row.gridUp, radius: row.radius, gapMm: row.gapMm, serialNumber: row.serialNumber, brand: row.brand, model: row.model, purchaseDate: row.purchaseDate, purchaseCost: row.purchaseCost, condition: row.condition || undefined, status: AssetStatus.AVAILABLE, remarks: row.remarks, epc: epcCode ? { create: { epcCode } } : undefined }, select: { id: true, assetCode: true, epc: { select: { epcCode: true } } } });
      created.push({ id: asset.id, assetCode: asset.assetCode, epcCode: asset.epc?.epcCode || null });
    }
    return { ...validation, importedCount: created.length, assets: created };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const validation = (await prepare(rows, prisma)).validation;
      if (!validation.valid) return { ...validation, importedCount: 0, assets: [] };
      throw new AppError("An Asset Code, Serial Number, or EPC became unavailable during import. No assets were created; validate and try again.", 409);
    }
    throw error;
  }
}
