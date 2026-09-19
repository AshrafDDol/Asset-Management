import assert from "node:assert/strict";
import { prisma } from "../src/config/prisma";
import { createAsset } from "../src/modules/assets/asset.service";
import { confirmHandheldReturns, prepareHandheldSwap } from "../src/modules/handheld-work/handheldWork.services";
import { confirmHandheldIssue, createIssueBatch } from "../src/modules/issue-batches/issueBatch.services";

const suffix = Date.now().toString();
const assetIds: number[] = []; const batchIds: number[] = []; const locationIds: number[] = []; const taskIds: number[] = [];
let categoryId = 0; let userId = 0;

async function main() {
  const role = await prisma.role.findFirstOrThrow({ where: { isActive: true } });
  const user = await prisma.user.create({ data: { username: `return-proof-${suffix}`, fullName: "Return Proof Runtime", email: `return-proof-${suffix}@example.test`, passwordHash: "runtime-only", roleId: role.id } }); userId = user.id;
  const category = await prisma.assetCategory.create({ data: { categoryCode: `RH${suffix.slice(-8)}`, name: `Return Proof ${suffix}` } }); categoryId = category.id;
  const home = await prisma.location.create({ data: { locationCode: `RHH${suffix.slice(-7)}`, name: "Return Home", locationType: "STORAGE" } }); locationIds.push(home.id);
  const operation = await prisma.location.create({ data: { locationCode: `RHO${suffix.slice(-7)}`, name: "Return Operation", locationType: "OPERATION" } }); locationIds.push(operation.id);
  const assets: Awaited<ReturnType<typeof createAsset>>[] = [];
  for (let index = 0; index < 14; index += 1) { const asset = await createAsset({ assetCode: `RH-${suffix}-${index}`, itemName: `Return ${index}`, categoryId, locationId: home.id, autoGenerateEpc: true }); assets.push(asset); assetIds.push(asset.id); }
  const issue = async (indexes: number[], label: string) => {
    const selected = indexes.map((index) => assets[index]);
    const batch = await createIssueBatch({ assetIds: selected.map((asset) => asset.id), jobNo: `${label}-${suffix}`, defaultRecipientUserId: user.id, defaultToLocationId: operation.id }, user.id); batchIds.push(batch.id);
    await confirmHandheldIssue(batch.id, { issueBatchId: batch.id, matched: selected.map((asset) => { const item = batch.items.find((entry) => entry.assetId === asset.id)!; return { itemId: item.id, assetId: asset.id, assignmentId: item.assignment!.id, epc: asset.epc!.epcCode }; }) }, user.id);
    return batch;
  };
  const returns = (batch: Awaited<ReturnType<typeof createIssueBatch>>, indexes: number[]) => indexes.map((index) => { const asset = assets[index]; const item = batch.items.find((entry) => entry.assetId === asset.id)!; return { itemId: item.id, assignmentId: item.assignment!.id, assetId: asset.id, epc: asset.epc!.epcCode }; });

  const partial = await issue([0, 1, 2], "PARTIAL");
  const partialItems = returns(partial, [0, 1]);
  const first = await confirmHandheldReturns({ items: partialItems, issueBatchId: partial.id }, user.id); assert.equal(first.status, "CONFIRMED"); assert.equal(first.alreadyConfirmed, false);
  const retry = await confirmHandheldReturns({ items: partialItems, issueBatchId: partial.id }, user.id); assert.equal(retry.status, "ALREADY_CONFIRMED"); assert.equal(retry.alreadyConfirmed, true);
  assert.equal((await prisma.asset.findUniqueOrThrow({ where: { id: assets[2].id } })).status, "IN_USE");
  assert.equal(await prisma.assetMovement.count({ where: { assetId: { in: assets.slice(0, 2).map((asset) => asset.id) }, reason: { startsWith: "RETURN SCAN:" } } }), 2);
  assert.equal(await prisma.assetScanConfirmation.count({ where: { assetId: { in: assets.slice(0, 2).map((asset) => asset.id) }, confirmationType: "RETURN_CONFIRMATION", confirmationSource: "HANDHELD" } }), 2);

  const race = await issue([3, 4], "RACE"); const raceItems = returns(race, [3, 4]);
  const raceSettled = await Promise.allSettled([confirmHandheldReturns({ items: raceItems, issueBatchId: race.id }, user.id), confirmHandheldReturns({ items: raceItems, issueBatchId: race.id }, user.id)]);
  assert.equal(raceSettled.filter((result) => result.status === "fulfilled" && result.value.status === "CONFIRMED").length, 1);
  if (raceSettled.some((result) => result.status === "rejected")) assert.equal((await confirmHandheldReturns({ items: raceItems, issueBatchId: race.id }, user.id)).status, "ALREADY_CONFIRMED");
  else assert.equal(raceSettled.filter((result) => result.status === "fulfilled" && result.value.status === "ALREADY_CONFIRMED").length, 1);
  assert.equal(await prisma.assetMovement.count({ where: { assetId: { in: assets.slice(3, 5).map((asset) => asset.id) }, reason: { startsWith: "RETURN SCAN:" } } }), 2);
  assert.equal(await prisma.assetScanConfirmation.count({ where: { assetId: { in: assets.slice(3, 5).map((asset) => asset.id) }, confirmationType: "RETURN_CONFIRMATION", confirmationSource: "HANDHELD" } }), 2);

  const mixed = await issue([5, 6], "MIXED"); await confirmHandheldReturns({ items: returns(mixed, [5]), issueBatchId: mixed.id }, user.id);
  await assert.rejects(() => confirmHandheldReturns({ items: returns(mixed, [5, 6]), issueBatchId: mixed.id }, user.id), (error: unknown) => error instanceof Error && /some submitted Assets were already returned/.test(error.message));
  assert.equal((await prisma.asset.findUniqueOrThrow({ where: { id: assets[6].id } })).status, "IN_USE");

  const blocked = await issue([7, 8], "BLOCKED"); const swap = await prepareHandheldSwap({ issueBatchId: blocked.id, targetItemId: blocked.items.find((item) => item.assetId === assets[7].id)!.id, replacementAssetId: assets[9].id }, user.id); taskIds.push(swap.id);
  await assert.rejects(() => confirmHandheldReturns({ items: returns(blocked, [7, 8]), issueBatchId: blocked.id }, user.id), (error: unknown) => error instanceof Error && /pending Swap/.test(error.message));
  assert.equal((await prisma.asset.findUniqueOrThrow({ where: { id: assets[8].id } })).status, "IN_USE");

  const stale = await issue([10], "STALE"); await prisma.assetAssignment.update({ where: { issueBatchItemId: stale.items[0].id }, data: { isActive: false, status: "CANCELLED" } });
  await assert.rejects(() => confirmHandheldReturns({ items: returns(stale, [10]), issueBatchId: stale.id }, user.id), (error: unknown) => error instanceof Error && /work changed/.test(error.message));
  assert.equal(await prisma.assetMovement.count({ where: { assetId: assets[10].id, reason: { startsWith: "RETURN SCAN:" } } }), 0);

  const allA = await issue([11], "ALL-A"); const allB = await issue([12], "ALL-B"); const allItems = [...returns(allA, [11]), ...returns(allB, [12])];
  assert.equal((await confirmHandheldReturns({ items: allItems }, user.id)).status, "CONFIRMED");
  assert.equal((await confirmHandheldReturns({ items: allItems }, user.id)).status, "ALREADY_CONFIRMED");
  console.log(JSON.stringify({ passed: true, partialReturn: true, exactRetry: true, remainingPending: true, concurrentClients: true, duplicateMovements: false, duplicateConfirmations: false, mixedSetRejectedAtomically: true, pendingSwapRejectedAtomically: true, staleAssignmentRejected: true, scanAllRetry: true }, null, 2));
}

main().finally(async () => {
  try {
    if (taskIds.length) await prisma.handheldSwapTask.deleteMany({ where: { id: { in: taskIds } } });
    if (assetIds.length) { await prisma.assetScanConfirmation.deleteMany({ where: { assetId: { in: assetIds } } }); await prisma.assetMovement.deleteMany({ where: { assetId: { in: assetIds } } }); await prisma.assetAssignment.deleteMany({ where: { assetId: { in: assetIds } } }); }
    if (batchIds.length) { await prisma.issueBatchItem.deleteMany({ where: { issueBatchId: { in: batchIds } } }); await prisma.issueBatch.deleteMany({ where: { id: { in: batchIds } } }); }
    if (assetIds.length) { await prisma.assetEpc.deleteMany({ where: { assetId: { in: assetIds } } }); await prisma.asset.deleteMany({ where: { id: { in: assetIds } } }); }
    if (categoryId) await prisma.assetCategory.delete({ where: { id: categoryId } }); if (userId) await prisma.user.delete({ where: { id: userId } }); if (locationIds.length) await prisma.location.deleteMany({ where: { id: { in: locationIds } } });
  } finally { await prisma.$disconnect(); }
}).catch((error) => { console.error(error); process.exitCode = 1; });
