import { LocationType } from "@prisma/client";
import { prisma } from "../src/config/prisma";
import { createAsset, getAllAssets, updateAsset } from "../src/modules/assets/asset.service";

const suffix = Date.now().toString(36).toUpperCase();
const ids: Record<string, number | undefined> = {};
const pass = (name: string) => console.log(`PASS ${name}`);

async function expectRejected(name: string, action: () => Promise<unknown>, expected: string) {
  try {
    await action();
    throw new Error(`${name}: validation unexpectedly succeeded`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes(expected)) throw error;
    pass(name);
  }
}

async function run() {
  const department = await prisma.department.create({
    data: { departmentCode: `BD${suffix}`, name: `Blade Detail QA ${suffix}` },
  });
  ids.department = department.id;
  const location = await prisma.location.create({
    data: {
      locationCode: `BL${suffix}`,
      name: `Blade Store ${suffix}`,
      locationType: LocationType.STORAGE,
      departmentId: department.id,
    },
  });
  ids.location = location.id;
  const category = await prisma.assetCategory.create({
    data: { categoryCode: `BC${suffix}`, name: `Blade QA ${suffix}` },
  });
  ids.category = category.id;

  const assetA = await createAsset({
    assetCode: `BDA-${suffix}`,
    itemName: "Blade A",
    categoryId: category.id,
    locationId: location.id,
    measurementHeight: 9,
    measurementWidth: 118,
    gridUp: 4,
    gapMm: 2,
  });
  ids.assetA = assetA.id;
  if (assetA.gridUp !== 4 || assetA.radius !== null || Number(assetA.gapMm) !== 2 || assetA.epc !== null) {
    throw new Error("Asset A values or optional EPC were not persisted correctly");
  }
  if (assetA.locationId !== location.id || assetA.homeLocationId !== location.id) {
    throw new Error("Registration did not initialize current and storage locations together");
  }
  pass("Register blade Asset with partial blade details and no EPC");

  const assetB = await createAsset({
    assetCode: `BDB-${suffix}`,
    itemName: "Blade B",
    categoryId: category.id,
    locationId: location.id,
    measurementHeight: 9,
    measurementWidth: 40,
    gridUp: 10,
    radius: 0.5,
    gapMm: 2,
    autoGenerateEpc: true,
  });
  ids.assetB = assetB.id;
  if (assetB.gridUp !== 10 || Number(assetB.radius) !== 0.5 || Number(assetB.gapMm) !== 2 || !assetB.epc) {
    throw new Error("Asset B blade details or generated EPC were not persisted correctly");
  }
  pass("Register blade Asset with all blade details and generated EPC");

  const withoutBlade = await createAsset({
    assetCode: `BDN-${suffix}`,
    itemName: "Non-blade Asset",
    categoryId: category.id,
    locationId: location.id,
  });
  ids.assetC = withoutBlade.id;
  if (withoutBlade.gridUp !== null || withoutBlade.radius !== null || withoutBlade.gapMm !== null) {
    throw new Error("Optional blade fields were not null");
  }
  pass("Register Asset without blade details");

  const gridMatches = await getAllAssets({ gridUp: 10 });
  const radiusMatches = await getAllAssets({ radius: 0.5 });
  const gapMatches = await getAllAssets({ gapMm: 2 });
  const combinedMatches = await getAllAssets({ measurementHeight: 9, measurementWidth: 40, gridUp: 10, radius: 0.5, gapMm: 2 });
  if (!gridMatches.some((asset) => asset.id === assetB.id)) throw new Error("Grid exact filter missed Asset B");
  if (!radiusMatches.some((asset) => asset.id === assetB.id)) throw new Error("Radius exact filter missed Asset B");
  if (!gapMatches.some((asset) => asset.id === assetA.id) || !gapMatches.some((asset) => asset.id === assetB.id)) throw new Error("Gap exact filter missed an Asset");
  if (combinedMatches.length !== 1 || combinedMatches[0].id !== assetB.id) throw new Error("Combined measurement/blade filter was not exact");
  pass("Exact Grid, Radius, Gap, and combined filters");

  const edited = await updateAsset(assetA.id, { gridUp: 22, radius: 1, gapMm: 1.5 });
  if (edited.gridUp !== 22 || Number(edited.radius) !== 1 || Number(edited.gapMm) !== 1.5) throw new Error("Blade detail edit failed");
  const cleared = await updateAsset(assetA.id, { gridUp: null, radius: null, gapMm: null });
  if (cleared.gridUp !== null || cleared.radius !== null || cleared.gapMm !== null) throw new Error("Blade detail clear failed");
  pass("Edit and clear blade details");

  await expectRejected("Grid rejects zero", () => updateAsset(assetA.id, { gridUp: 0 }), "positive integer");
  await expectRejected("Grid rejects decimals", () => updateAsset(assetA.id, { gridUp: 1.5 }), "positive integer");
  await expectRejected("Radius rejects negatives", () => updateAsset(assetA.id, { radius: -0.01 }), "zero or greater");
  await expectRejected("Gap rejects negatives", () => updateAsset(assetA.id, { gapMm: -0.01 }), "zero or greater");
}

async function cleanup() {
  const assetIds = [ids.assetA, ids.assetB, ids.assetC].filter((id): id is number => Boolean(id));
  if (assetIds.length) {
    await prisma.assetEpc.deleteMany({ where: { assetId: { in: assetIds } } });
    await prisma.asset.deleteMany({ where: { id: { in: assetIds } } });
  }
  if (ids.location) await prisma.location.deleteMany({ where: { id: ids.location } });
  if (ids.category) await prisma.assetCategory.deleteMany({ where: { id: ids.category } });
  if (ids.department) await prisma.department.deleteMany({ where: { id: ids.department } });
}

run()
  .finally(async () => { await cleanup(); await prisma.$disconnect(); })
  .catch((error) => { console.error(error); process.exitCode = 1; });
