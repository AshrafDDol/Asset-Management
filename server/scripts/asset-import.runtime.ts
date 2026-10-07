import { LocationType } from "@prisma/client";
import { prisma } from "../src/config/prisma";
import { importAssets, validateAssetImport } from "../src/modules/assets/asset-import.service";
import type { AssetImportRowInput } from "../src/modules/assets/asset.types";

const suffix = Date.now().toString(36).toUpperCase();
const ids = { departments: [] as number[], categories: [] as number[], locations: [] as number[], assets: [] as number[] };
const codes = { category: `IC${suffix}`, inactiveCategory: `IX${suffix}`, storage: `IS${suffix}`, child: `ICH${suffix}`, inactiveStorage: `II${suffix}`, operation: `IO${suffix}`, repair: `IR${suffix}` };
const base = (sourceRow: number, assetCode: string, extra: Partial<AssetImportRowInput> = {}): AssetImportRowInput => ({ sourceRow, assetCode, itemName: `Imported ${assetCode}`, categoryCode: codes.category, storageLocationCode: codes.child, ...extra });
const pass = (name: string) => console.log(`PASS ${name}`);

async function invalid(name: string, rows: AssetImportRowInput[], expected: string) {
  const result = await validateAssetImport(rows);
  if (result.valid || !result.rows.flatMap(row => row.errors).some(error => error.includes(expected))) throw new Error(`${name}: expected ${expected}; got ${JSON.stringify(result)}`);
  pass(name);
}

async function run() {
  const department = await prisma.department.create({ data: { departmentCode: `ID${suffix}`, name: `Import QA ${suffix}` } }); ids.departments.push(department.id);
  const category = await prisma.assetCategory.create({ data: { categoryCode: codes.category, name: "Import Category" } }); ids.categories.push(category.id);
  ids.categories.push((await prisma.assetCategory.create({ data: { categoryCode: codes.inactiveCategory, name: "Inactive", isActive: false } })).id);
  const storage = await prisma.location.create({ data: { locationCode: codes.storage, name: "Import Store", locationType: LocationType.STORAGE, departmentId: department.id } }); ids.locations.push(storage.id);
  for (const [code, type, active] of [[codes.child, LocationType.STORAGE, true], [codes.inactiveStorage, LocationType.STORAGE, false], [codes.operation, LocationType.OPERATION, true], [codes.repair, LocationType.REPAIR, true]] as const) {
    ids.locations.push((await prisma.location.create({ data: { locationCode: code, name: code, locationType: type, isActive: active, parentLocationId: storage.id, departmentId: department.id } })).id);
  }
  const childId = ids.locations[1]; const hex = suffix.replace(/[^A-F0-9]/g, "A").slice(-10).padStart(10, "A");
  const success = [base(2, `IA-${suffix}`, { epc: `AA${hex}` }), base(3, `IB-${suffix}`, { autoGenerateEpc: "YES" }), base(4, `IC-${suffix}`)];
  const imported = await importAssets(success); if (!imported.valid || imported.importedCount !== 3) throw new Error("Valid import failed"); ids.assets.push(...imported.assets.map(asset => asset.id));
  const stored = await prisma.asset.findMany({ where: { id: { in: ids.assets } }, include: { epc: true } });
  const generatedEpc = stored.find(asset => asset.assetCode === success[1].assetCode)?.epc?.epcCode;
  if (stored.some(asset => asset.locationId !== childId || asset.homeLocationId !== childId) || stored.filter(asset => asset.epc).length !== 2 || !generatedEpc || !/^[0-9A-F]{16}$/.test(generatedEpc)) throw new Error("Location or EPC semantics failed"); pass("valid batch, exact child, supplied/generated/no EPC");
  await invalid("Asset Code DB duplicate", [base(2, success[0].assetCode!)], "already exists");
  await invalid("Asset Code file duplicate", [base(2, `D-${suffix}`), base(3, `D-${suffix}`)], "duplicated in this file");
  await invalid("Category missing", [base(2, `CM-${suffix}`, { categoryCode: "MISSING" })], "active category");
  await invalid("Category inactive", [base(2, `CI-${suffix}`, { categoryCode: codes.inactiveCategory })], "active category");
  await invalid("Location missing", [base(2, `LM-${suffix}`, { storageLocationCode: "MISSING" })], "active STORAGE");
  await invalid("Location inactive", [base(2, `LI-${suffix}`, { storageLocationCode: codes.inactiveStorage })], "active STORAGE");
  await invalid("OPERATION rejected", [base(2, `LO-${suffix}`, { storageLocationCode: codes.operation })], "active STORAGE");
  await invalid("REPAIR rejected", [base(2, `LR-${suffix}`, { storageLocationCode: codes.repair })], "active STORAGE");
  await invalid("Measurement invalid", [base(2, `ME-${suffix}`, { measurementHeight: -1 })], "greater than zero");
  await invalid("Condition invalid", [base(2, `CO-${suffix}`, { condition: "BROKEN" })], "Condition is invalid");
  await invalid("EPC invalid", [base(2, `EI-${suffix}`, { epc: "XYZ" })], "hexadecimal");
  await invalid("EPC generation conflict", [base(2, `EG-${suffix}`, { epc: "AABB", autoGenerateEpc: "YES" })], "not both");
  await invalid("Serial file duplicate", [base(2, `S1-${suffix}`, { serialNumber: suffix }), base(3, `S2-${suffix}`, { serialNumber: suffix })], "Serial Number is duplicated");
  await invalid("EPC file duplicate", [base(2, `E1-${suffix}`, { epc: "BBCC" }), base(3, `E2-${suffix}`, { epc: "BBCC" })], "EPC is duplicated");
  const fixture = await importAssets([base(2, `DB-${suffix}`, { serialNumber: `SER-${suffix}`, epc: "CCDDEE" })]); ids.assets.push(...fixture.assets.map(asset => asset.id));
  await invalid("Serial DB duplicate", [base(2, `SD-${suffix}`, { serialNumber: `SER-${suffix}` })], "Serial Number already exists");
  await invalid("EPC DB duplicate", [base(2, `ED-${suffix}`, { epc: "CCDDEE" })], "EPC already exists");
  const atomicCode = `AT-${suffix}`; const rejected = await importAssets([base(2, atomicCode), base(3, `BAD-${suffix}`, { categoryCode: "MISSING" })]); if (rejected.valid || await prisma.asset.findUnique({ where: { assetCode: atomicCode } })) throw new Error("Invalid batch created data"); pass("invalid batch is atomic");
  const stale = base(2, `RACE-${suffix}`); if (!(await validateAssetImport([stale])).valid) throw new Error("Stale preview fixture invalid"); const winner = await importAssets([stale]); ids.assets.push(...winner.assets.map(asset => asset.id)); const loser = await importAssets([stale]); if (loser.valid || loser.importedCount) throw new Error("Final revalidation did not reject stale preview"); pass("stale preview conflict creates zero assets");
}

async function cleanup() { if (ids.assets.length) { await prisma.assetEpc.deleteMany({ where: { assetId: { in: ids.assets } } }); await prisma.asset.deleteMany({ where: { id: { in: ids.assets } } }); } if (ids.locations.length) await prisma.location.deleteMany({ where: { id: { in: ids.locations } } }); if (ids.categories.length) await prisma.assetCategory.deleteMany({ where: { id: { in: ids.categories } } }); if (ids.departments.length) await prisma.department.deleteMany({ where: { id: { in: ids.departments } } }); }
run().finally(async () => { await cleanup(); await prisma.$disconnect(); }).catch(error => { console.error(error); process.exitCode = 1; });
