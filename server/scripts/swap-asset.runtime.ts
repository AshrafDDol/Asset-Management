import assert from "node:assert/strict";
import { prisma } from "../src/config/prisma";
import { createAsset } from "../src/modules/assets/asset.service";
import { confirmBatchItemIssue, createIssueBatch, swapIssueBatchAsset } from "../src/modules/issue-batches/issueBatch.services";

const suffix = Date.now().toString();
const assetIds: number[] = []; const batchIds: number[] = []; const locationIds: number[] = [];
let categoryId = 0; let userId = 0;

async function main() {
  const role = await prisma.role.findFirstOrThrow({ where: { isActive: true } });
  const user = await prisma.user.create({ data: { username: `swap-${suffix}`, fullName: "Swap Runtime", email: `swap-${suffix}@example.test`, passwordHash: "runtime-only", roleId: role.id } }); userId = user.id;
  const category = await prisma.assetCategory.create({ data: { categoryCode: `SW${suffix.slice(-8)}`, name: `Swap ${suffix}` } }); categoryId = category.id;
  const home = await prisma.location.create({ data: { locationCode: `SWH${suffix.slice(-8)}`, name: "Swap Home", locationType: "BIN" } }); locationIds.push(home.id);
  const operation = await prisma.location.create({ data: { locationCode: `SWO${suffix.slice(-8)}`, name: "Swap Operation", locationType: "PRODUCTION_AREA" } }); locationIds.push(operation.id);
  const assets: Awaited<ReturnType<typeof createAsset>>[] = [];
  for (let n = 1; n <= 7; n += 1) { const asset = await createAsset({ assetCode: `SWAP-${suffix}-${n}`, itemName: `Swap Asset ${n}`, categoryId, locationId: home.id, autoGenerateEpc: true }); assets.push(asset); assetIds.push(asset.id); }

  const pendingBatch = await createIssueBatch({ assetIds: [assets[0].id], jobNo: `SWAP-PENDING-${suffix}`, defaultRecipientUserId: user.id, defaultToLocationId: operation.id }, user.id); batchIds.push(pendingBatch.id);
  const pendingOld = pendingBatch.items[0];
  const pendingSwap = await swapIssueBatchAsset(pendingBatch.id, { replacementAssetId: assets[1].id, targetItemId: pendingOld.id }, user.id);
  const pendingNew = pendingSwap.items.find((item) => item.assetId === assets[1].id)!;
  assert.equal((await prisma.asset.findUniqueOrThrow({ where: { id: assets[0].id } })).status, "AVAILABLE");
  assert.equal((await prisma.asset.findUniqueOrThrow({ where: { id: assets[0].id } })).locationId, home.id);
  assert.equal((await prisma.issueBatchItem.findUniqueOrThrow({ where: { id: pendingOld.id } })).status, "CANCELLED");
  assert.equal((await prisma.assetAssignment.findUniqueOrThrow({ where: { issueBatchItemId: pendingOld.id } })).status, "CANCELLED");
  assert.equal(await prisma.assetMovement.count({ where: { issueBatchItemId: pendingOld.id } }), 0);
  assert.equal(await prisma.assetScanConfirmation.count({ where: { issueBatchItemId: pendingOld.id } }), 0);
  assert.equal(pendingNew.status, "ISSUED"); assert.equal(pendingNew.asset.status, "PENDING_CONFIRMATION");
  assert.equal(pendingNew.replacementForItemId, pendingOld.id); assert.equal(pendingNew.recipientUserId, pendingOld.recipientUserId); assert.equal(pendingNew.toLocationId, pendingOld.toLocationId);
  await confirmBatchItemIssue(pendingNew.id, assets[1].epc!.epcCode, undefined, user.id);
  assert.equal((await prisma.asset.findUniqueOrThrow({ where: { id: assets[1].id } })).status, "IN_USE");

  const inUseBatch = await createIssueBatch({ assetIds: [assets[2].id], jobNo: `SWAP-INUSE-${suffix}`, defaultRecipientUserId: user.id, defaultToLocationId: operation.id }, user.id); batchIds.push(inUseBatch.id);
  const inUseOld = inUseBatch.items[0]; await confirmBatchItemIssue(inUseOld.id, assets[2].epc!.epcCode, undefined, user.id);
  await assert.rejects(() => swapIssueBatchAsset(inUseBatch.id, { replacementAssetId: assets[3].id, targetItemId: inUseOld.id, epc: assets[3].epc!.epcCode }, user.id), /does not match/);
  assert.equal((await prisma.asset.findUniqueOrThrow({ where: { id: assets[2].id } })).status, "IN_USE");
  assert.equal((await prisma.asset.findUniqueOrThrow({ where: { id: assets[3].id } })).status, "AVAILABLE");
  const inUseSwap = await swapIssueBatchAsset(inUseBatch.id, { replacementAssetId: assets[3].id, targetItemId: inUseOld.id, epc: assets[2].epc!.epcCode }, user.id);
  const inUseNew = inUseSwap.items.find((item) => item.assetId === assets[3].id)!;
  const returnedOld = await prisma.asset.findUniqueOrThrow({ where: { id: assets[2].id } }); assert.equal(returnedOld.status, "AVAILABLE"); assert.equal(returnedOld.locationId, home.id);
  assert.equal((await prisma.issueBatchItem.findUniqueOrThrow({ where: { id: inUseOld.id } })).status, "RETURNED");
  const oldAssignment = await prisma.assetAssignment.findUniqueOrThrow({ where: { issueBatchItemId: inUseOld.id } }); assert.equal(oldAssignment.status, "RETURNED"); assert.equal(oldAssignment.isActive, false); assert.ok(oldAssignment.returnedAt);
  assert.equal(await prisma.assetMovement.count({ where: { issueBatchItemId: inUseOld.id, reason: { startsWith: "SWAP RETURN" } } }), 1);
  assert.equal(await prisma.assetScanConfirmation.count({ where: { issueBatchItemId: inUseOld.id, confirmationType: "RETURN_CONFIRMATION" } }), 1);
  assert.equal(inUseNew.status, "ISSUED"); assert.equal(inUseNew.asset.status, "PENDING_CONFIRMATION"); assert.equal(inUseNew.replacementForItemId, inUseOld.id);
  assert.equal(inUseSwap.status, "PROCESSING");
  await confirmBatchItemIssue(inUseNew.id, assets[3].epc!.epcCode, undefined, user.id);
  assert.equal((await prisma.asset.findUniqueOrThrow({ where: { id: assets[3].id } })).status, "IN_USE");
  assert.equal(await prisma.assetMovement.count({ where: { issueBatchItemId: inUseNew.id } }), 1);
  assert.equal(await prisma.assetScanConfirmation.count({ where: { issueBatchItemId: inUseNew.id, confirmationType: "ISSUE_CONFIRMATION" } }), 1);

  const multiBatch = await createIssueBatch({ assetIds: [assets[4].id, assets[5].id], jobNo: `SWAP-MULTI-${suffix}`, defaultRecipientUserId: user.id, defaultToLocationId: operation.id }, user.id); batchIds.push(multiBatch.id);
  const multiTarget = multiBatch.items.find((item) => item.assetId === assets[4].id)!; const untouched = multiBatch.items.find((item) => item.assetId === assets[5].id)!;
  const race = await Promise.allSettled([
    swapIssueBatchAsset(multiBatch.id, { replacementAssetId: assets[6].id, targetItemId: multiTarget.id }, user.id),
    swapIssueBatchAsset(multiBatch.id, { replacementAssetId: assets[6].id, targetItemId: multiTarget.id }, user.id),
  ]);
  assert.equal(race.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(await prisma.issueBatchItem.count({ where: { replacementForItemId: multiTarget.id } }), 1);
  assert.equal((await prisma.issueBatchItem.findUniqueOrThrow({ where: { id: untouched.id } })).status, "ISSUED");
  console.log(JSON.stringify({ passed: true, pendingSwapAtomic: true, pendingSwapNoPhysicalHistory: true, inUseWrongEpcNoMutation: true, inUseSwapReturnHistory: true, replacementAwaitsConfirmation: true, singleAssetJobRemainsActive: true, multiAssetUnaffected: true, duplicateSwapSingleWinner: true }, null, 2));
}

main().finally(async () => {
  try {
    if (assetIds.length) { await prisma.assetScanConfirmation.deleteMany({ where: { assetId: { in: assetIds } } }); await prisma.assetMovement.deleteMany({ where: { assetId: { in: assetIds } } }); await prisma.assetAssignment.deleteMany({ where: { assetId: { in: assetIds } } }); }
    if (batchIds.length) { await prisma.issueBatchItem.updateMany({ where: { issueBatchId: { in: batchIds } }, data: { replacementForItemId: null } }); await prisma.issueBatchItem.deleteMany({ where: { issueBatchId: { in: batchIds } } }); await prisma.issueBatch.deleteMany({ where: { id: { in: batchIds } } }); }
    if (assetIds.length) { await prisma.assetEpc.deleteMany({ where: { assetId: { in: assetIds } } }); await prisma.asset.deleteMany({ where: { id: { in: assetIds } } }); }
    if (categoryId) await prisma.assetCategory.delete({ where: { id: categoryId } }); if (userId) await prisma.user.delete({ where: { id: userId } }); if (locationIds.length) await prisma.location.deleteMany({ where: { id: { in: locationIds } } });
  } finally { await prisma.$disconnect(); }
}).catch((error) => { console.error(error); process.exitCode = 1; });
