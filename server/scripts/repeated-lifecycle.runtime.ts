import assert from "node:assert/strict";
import { prisma } from "../src/config/prisma";
import { createAsset } from "../src/modules/assets/asset.service";
import { confirmHandheldReturns, confirmHandheldSwap, prepareHandheldSwap } from "../src/modules/handheld-work/handheldWork.services";
import { addAssetsToIssueBatch, confirmHandheldIssue, createIssueBatch, swapIssueBatchAsset } from "../src/modules/issue-batches/issueBatch.services";

const suffix = Date.now().toString();
const assetIds: number[] = []; const batchIds: number[] = []; const locationIds: number[] = []; const taskIds: number[] = [];
let categoryId = 0; let userId = 0;

async function main() {
  const priorBatches = await prisma.issueBatch.findMany({ where: { jobNo: { startsWith: "REPEAT-" } }, include: { items: { select: { assetId: true } } } });
  const priorBatchIds = priorBatches.map((entry) => entry.id); const priorAssets = await prisma.asset.findMany({ where: { category: { name: { startsWith: "Repeated Lifecycle " } } }, select: { id: true } }); const priorAssetIds = priorAssets.map((asset) => asset.id);
  if (priorBatchIds.length) {
    await prisma.handheldSwapTask.deleteMany({ where: { issueBatchId: { in: priorBatchIds } } });
    await prisma.assetScanConfirmation.deleteMany({ where: { issueBatchItem: { issueBatchId: { in: priorBatchIds } } } }); await prisma.assetMovement.deleteMany({ where: { issueBatchItem: { issueBatchId: { in: priorBatchIds } } } }); await prisma.assetAssignment.deleteMany({ where: { issueBatchItem: { issueBatchId: { in: priorBatchIds } } } });
    await prisma.issueBatchItem.updateMany({ where: { issueBatchId: { in: priorBatchIds } }, data: { replacementForItemId: null } }); await prisma.issueBatchItem.deleteMany({ where: { issueBatchId: { in: priorBatchIds } } }); await prisma.issueBatch.deleteMany({ where: { id: { in: priorBatchIds } } });
    await prisma.assetEpc.deleteMany({ where: { assetId: { in: priorAssetIds } } }); await prisma.asset.deleteMany({ where: { id: { in: priorAssetIds } } });
  }
  await prisma.assetCategory.deleteMany({ where: { name: { startsWith: "Repeated Lifecycle " } } }); await prisma.user.deleteMany({ where: { username: { startsWith: "repeat-" } } }); await prisma.location.deleteMany({ where: { OR: [{ locationCode: { startsWith: "RLH" } }, { locationCode: { startsWith: "RLO" } }] } });
  const role = await prisma.role.findFirstOrThrow({ where: { isActive: true } });
  const user = await prisma.user.create({ data: { username: `repeat-${suffix}`, fullName: "Repeated Lifecycle", email: `repeat-${suffix}@example.test`, passwordHash: "runtime-only", roleId: role.id } }); userId = user.id;
  const category = await prisma.assetCategory.create({ data: { categoryCode: `RL${suffix.slice(-8)}`, name: `Repeated Lifecycle ${suffix}` } }); categoryId = category.id;
  const home = await prisma.location.create({ data: { locationCode: `RLH${suffix.slice(-7)}`, name: "Repeat Home", locationType: "BIN" } }); locationIds.push(home.id);
  const operation = await prisma.location.create({ data: { locationCode: `RLO${suffix.slice(-7)}`, name: "Repeat Operation", locationType: "PRODUCTION_AREA" } }); locationIds.push(operation.id);
  const assets: Awaited<ReturnType<typeof createAsset>>[] = [];
  for (let index = 0; index < 5; index += 1) { const asset = await createAsset({ assetCode: `RL-${suffix}-${index}`, itemName: `Repeat ${index}`, categoryId, locationId: home.id, autoGenerateEpc: true }); assets.push(asset); assetIds.push(asset.id); }
  const [assetA, assetB, assetC, assetD] = assets;
  const batch = await createIssueBatch({ assetIds: [assetA.id], jobNo: `REPEAT-${suffix}`, defaultRecipientUserId: user.id, defaultToLocationId: operation.id }, user.id); batchIds.push(batch.id);
  const reload = () => prisma.issueBatch.findUniqueOrThrow({ where: { id: batch.id }, include: { items: { include: { assignment: true } } } });
  const add = async (assetId: number) => addAssetsToIssueBatch(batch.id, { assetIds: [assetId], jobNo: batch.jobNo!, defaultRecipientUserId: user.id, defaultToLocationId: operation.id }, user.id);
  const current = async (assetId: number, status: "ISSUED" | "CONFIRMED") => (await reload()).items.filter((item) => item.assetId === assetId && item.status === status).sort((left, right) => right.id - left.id)[0];
  const issue = async (asset: typeof assetA) => { const item = await current(asset.id, "ISSUED"); assert.ok(item?.assignment); return confirmHandheldIssue(batch.id, { issueBatchId: batch.id, matched: [{ itemId: item.id, assignmentId: item.assignment.id, assetId: asset.id, epc: asset.epc!.epcCode }] }, user.id); };
  const returnAsset = async (asset: typeof assetA) => { const item = await current(asset.id, "CONFIRMED"); assert.ok(item?.assignment); return confirmHandheldReturns({ issueBatchId: batch.id, items: [{ itemId: item.id, assignmentId: item.assignment.id, assetId: asset.id, epc: asset.epc!.epcCode }] }, user.id); };

  assert.equal((await issue(assetA)).status, "CONFIRMED");
  await add(assetB.id); assert.equal((await issue(assetB)).status, "CONFIRMED");
  const firstReturnAItem = await current(assetA.id, "CONFIRMED"); const firstReturnA = await returnAsset(assetA); assert.equal(firstReturnA.status, "CONFIRMED"); assert.equal((await returnAssetByIdentity(firstReturnAItem!, assetA)).status, "ALREADY_CONFIRMED");
  assert.equal((await prisma.asset.findUniqueOrThrow({ where: { id: assetB.id } })).status, "IN_USE");

  await add(assetA.id); const secondIssueAItem = await current(assetA.id, "ISSUED"); assert.equal((await issue(assetA)).status, "CONFIRMED");
  assert.equal((await confirmHandheldIssue(batch.id, { issueBatchId: batch.id, matched: [{ itemId: secondIssueAItem!.id, assignmentId: secondIssueAItem!.assignment!.id, assetId: assetA.id, epc: assetA.epc!.epcCode }] }, user.id)).status, "ALREADY_CONFIRMED");
  await returnAsset(assetA); await returnAsset(assetB);
  assert.equal((await prisma.issueBatch.findUniqueOrThrow({ where: { id: batch.id } })).status, "PROCESSING");

  await add(assetA.id); assert.equal((await issue(assetA)).status, "CONFIRMED");
  const activeA = await current(assetA.id, "CONFIRMED"); const swapAB = await prepareHandheldSwap({ issueBatchId: batch.id, targetItemId: activeA!.id, replacementAssetId: assetB.id }, user.id); taskIds.push(swapAB.id);
  assert.equal((await confirmHandheldSwap(swapAB.id, { oldEpc: assetA.epc!.epcCode, newEpc: assetB.epc!.epcCode }, user.id)).status, "CONFIRMED");
  assert.equal((await prisma.asset.findUniqueOrThrow({ where: { id: assetA.id } })).status, "AVAILABLE");

  await add(assetA.id); assert.equal((await issue(assetA)).status, "CONFIRMED"); await returnAsset(assetA);
  const activeB = await current(assetB.id, "CONFIRMED"); const swapBA = await prepareHandheldSwap({ issueBatchId: batch.id, targetItemId: activeB!.id, replacementAssetId: assetA.id }, user.id); taskIds.push(swapBA.id);
  assert.equal((await confirmHandheldSwap(swapBA.id, { oldEpc: assetB.epc!.epcCode, newEpc: assetA.epc!.epcCode }, user.id)).status, "CONFIRMED");

  await add(assetC.id); const pendingC = await current(assetC.id, "ISSUED"); await assert.rejects(() => prepareHandheldSwap({ issueBatchId: batch.id, targetItemId: pendingC!.id, replacementAssetId: assetD.id }, user.id), /requires an IN_USE Asset/);
  await swapIssueBatchAsset(batch.id, { targetItemId: pendingC!.id, replacementAssetId: assetD.id }, user.id);
  assert.equal(await prisma.handheldSwapTask.count({ where: { targetItemId: pendingC!.id } }), 0);
  assert.equal((await prisma.asset.findUniqueOrThrow({ where: { id: assetD.id } })).status, "PENDING_CONFIRMATION");

  const aItems = await prisma.issueBatchItem.findMany({ where: { issueBatchId: batch.id, assetId: assetA.id }, orderBy: { id: "asc" } }); assert.ok(aItems.length >= 4);
  assert.ok(aItems.slice(0, -1).every((item) => ["RETURNED", "CANCELLED"].includes(item.status)));
  console.log(JSON.stringify({ passed: true, firstIssue: true, addWhileInUse: true, partialReturn: true, reissueSameAsset: true, zeroInUseJobRemainsActive: true, issueAfterZeroInUse: true, swapOldToReplacement: true, reuseSwappedOutAsIssue: true, reuseReturnedAsReplacement: true, itemScopedIssueRetry: true, assignmentScopedReturnRetry: true, pendingSelectionCreatesNoSwapTask: true, historicalRowsPreserved: aItems.length }, null, 2));

  async function returnAssetByIdentity(item: Awaited<ReturnType<typeof current>>, asset: typeof assetA) { assert.ok(item?.assignment); return confirmHandheldReturns({ issueBatchId: batch.id, items: [{ itemId: item.id, assignmentId: item.assignment.id, assetId: asset.id, epc: asset.epc!.epcCode }] }, user.id); }
}

main().finally(async () => {
  try {
    if (taskIds.length) await prisma.handheldSwapTask.deleteMany({ where: { id: { in: taskIds } } });
    if (assetIds.length) { await prisma.assetScanConfirmation.deleteMany({ where: { assetId: { in: assetIds } } }); await prisma.assetMovement.deleteMany({ where: { assetId: { in: assetIds } } }); await prisma.assetAssignment.deleteMany({ where: { assetId: { in: assetIds } } }); }
    if (batchIds.length) { await prisma.issueBatchItem.updateMany({ where: { issueBatchId: { in: batchIds } }, data: { replacementForItemId: null } }); await prisma.issueBatchItem.deleteMany({ where: { issueBatchId: { in: batchIds } } }); await prisma.issueBatch.deleteMany({ where: { id: { in: batchIds } } }); }
    if (assetIds.length) { await prisma.assetEpc.deleteMany({ where: { assetId: { in: assetIds } } }); await prisma.asset.deleteMany({ where: { id: { in: assetIds } } }); }
    if (categoryId) await prisma.assetCategory.delete({ where: { id: categoryId } }); if (userId) await prisma.user.delete({ where: { id: userId } }); if (locationIds.length) await prisma.location.deleteMany({ where: { id: { in: locationIds } } });
  } finally { await prisma.$disconnect(); }
}).catch((error) => { console.error(error); process.exitCode = 1; });
