import assert from "node:assert/strict";
import { prisma } from "../src/config/prisma";
import { createAsset } from "../src/modules/assets/asset.service";
import { addAssetsToIssueBatch, cancelIssuedBatchItem, confirmHandheldIssue, createIssueBatch, getHandheldIssue, getPendingHandheldIssues } from "../src/modules/issue-batches/issueBatch.services";

const suffix = Date.now().toString();
const assetIds: number[] = []; const batchIds: number[] = []; const locationIds: number[] = []; const taskIds: number[] = [];
let categoryId = 0; let userId = 0;

async function main() {
  const role = await prisma.role.findFirstOrThrow({ where: { isActive: true } });
  const user = await prisma.user.create({ data: { username: `processing-${suffix}`, fullName: "Processing Runtime", email: `processing-${suffix}@example.test`, passwordHash: "runtime-only", roleId: role.id } }); userId = user.id;
  const category = await prisma.assetCategory.create({ data: { categoryCode: `PH${suffix.slice(-8)}`, name: `Processing Runtime ${suffix}` } }); categoryId = category.id;
  const home = await prisma.location.create({ data: { locationCode: `PHH${suffix.slice(-7)}`, name: "Processing Home", locationType: "BIN" } }); locationIds.push(home.id);
  const operation = await prisma.location.create({ data: { locationCode: `PHO${suffix.slice(-7)}`, name: "Processing Operation", locationType: "PRODUCTION_AREA" } }); locationIds.push(operation.id);
  const assets: Awaited<ReturnType<typeof createAsset>>[] = [];
  for (let index = 0; index < 8; index += 1) {
    const asset = await createAsset({ assetCode: `PH-${suffix}-${index}`, itemName: `Processing ${index}`, categoryId, locationId: home.id, autoGenerateEpc: true });
    assets.push(asset); assetIds.push(asset.id);
  }
  const payload = (batch: Awaited<ReturnType<typeof createIssueBatch>>, asset: typeof assets[number]) => { const item = batch.items.find((entry) => entry.assetId === asset.id)!; return [{ itemId: item.id, assetId: asset.id, assignmentId: item.assignment!.id, epc: asset.epc!.epcCode }]; };
  const create = async (asset: typeof assets[number], label: string) => {
    const batch = await createIssueBatch({ assetIds: [asset.id], jobNo: `${label}-${suffix}`, defaultRecipientUserId: user.id, defaultToLocationId: operation.id }, user.id); batchIds.push(batch.id); return batch;
  };

  const normal = await create(assets[0], "NORMAL");
  const first = await confirmHandheldIssue(normal.id, { issueBatchId: normal.id, matched: payload(normal, assets[0]) }, user.id);
  assert.equal(first.status, "CONFIRMED"); assert.equal(first.alreadyConfirmed, false);
  const retry = await confirmHandheldIssue(normal.id, { issueBatchId: normal.id, matched: payload(normal, assets[0]) }, user.id);
  assert.equal(retry.status, "ALREADY_CONFIRMED"); assert.equal(retry.alreadyConfirmed, true);
  assert.equal(await prisma.assetMovement.count({ where: { issueBatchItemId: normal.items[0].id } }), 1);
  assert.equal(await prisma.assetScanConfirmation.count({ where: { issueBatchItemId: normal.items[0].id, confirmationType: "ISSUE_CONFIRMATION" } }), 1);

  const addInput = (assetId: number) => ({ assetIds: [assetId], jobNo: normal.jobNo!, defaultRecipientUserId: user.id, defaultToLocationId: operation.id });
  const withB = await addAssetsToIssueBatch(normal.id, addInput(assets[5].id), user.id);
  const pendingB = (await getPendingHandheldIssues()).find((batch) => batch.id === normal.id)!;
  const handheldB = await getHandheldIssue(normal.id);
  assert.equal(withB.id, normal.id); assert.equal(pendingB.expectedAssetCount, 1); assert.deepEqual(handheldB.expectedItems.map((item) => item.assetId), [assets[5].id]);
  const confirmedB = await confirmHandheldIssue(normal.id, { issueBatchId: normal.id, matched: payload(withB, assets[5]) }, user.id); assert.equal(confirmedB.status, "CONFIRMED");
  assert.equal((await confirmHandheldIssue(normal.id, { issueBatchId: normal.id, matched: payload(withB, assets[5]) }, user.id)).status, "ALREADY_CONFIRMED");
  await addAssetsToIssueBatch(normal.id, addInput(assets[6].id), user.id);
  const withC = await prisma.issueBatch.findUniqueOrThrow({ where: { id: normal.id }, include: { items: { include: { assignment: true } } } });
  const handheldC = await getHandheldIssue(normal.id); assert.deepEqual(handheldC.expectedItems.map((item) => item.assetId), [assets[6].id]);
  const confirmedC = await confirmHandheldIssue(normal.id, { issueBatchId: normal.id, matched: payload(withC as Awaited<ReturnType<typeof createIssueBatch>>, assets[6]) }, user.id); assert.equal(confirmedC.status, "CONFIRMED");
  assert.equal((await confirmHandheldIssue(normal.id, { issueBatchId: normal.id, matched: payload(withC as Awaited<ReturnType<typeof createIssueBatch>>, assets[6]) }, user.id)).status, "ALREADY_CONFIRMED");
  for (const asset of [assets[0], assets[5], assets[6]]) assert.equal((await prisma.asset.findUniqueOrThrow({ where: { id: asset.id } })).status, "IN_USE");
  assert.equal(await prisma.assetMovement.count({ where: { assetId: { in: [assets[0].id, assets[5].id, assets[6].id] }, reason: { startsWith: "ISSUE CONFIRMED:" } } }), 3);
  assert.equal(await prisma.assetScanConfirmation.count({ where: { assetId: { in: [assets[0].id, assets[5].id, assets[6].id] }, confirmationType: "ISSUE_CONFIRMATION" } }), 3);

  const race = await create(assets[1], "RACE");
  const raceResults = await Promise.all([confirmHandheldIssue(race.id, { issueBatchId: race.id, matched: payload(race, assets[1]) }, user.id), confirmHandheldIssue(race.id, { issueBatchId: race.id, matched: payload(race, assets[1]) }, user.id)]);
  assert.deepEqual(raceResults.map((result) => result.status).sort(), ["ALREADY_CONFIRMED", "CONFIRMED"]);
  assert.equal(await prisma.assetMovement.count({ where: { issueBatchItemId: race.items[0].id } }), 1);
  assert.equal(await prisma.assetScanConfirmation.count({ where: { issueBatchItemId: race.items[0].id, confirmationType: "ISSUE_CONFIRMATION" } }), 1);

  const stale = await create(assets[2], "STALE");
  await cancelIssuedBatchItem(stale.items[0].id);
  const staleMovementCount = await prisma.assetMovement.count({ where: { issueBatchItemId: stale.items[0].id } });
  await assert.rejects(() => confirmHandheldIssue(stale.id, { issueBatchId: stale.id, matched: payload(stale, assets[2]) }, user.id), (error: unknown) => error instanceof Error && /Work item changed/.test(error.message));
  assert.equal(await prisma.assetMovement.count({ where: { issueBatchItemId: stale.items[0].id } }), staleMovementCount);
  assert.equal(await prisma.assetScanConfirmation.count({ where: { issueBatchItemId: stale.items[0].id } }), 0);

  const swapConflict = await create(assets[3], "SWAP");
  const task = await prisma.handheldSwapTask.create({ data: { issueBatchId: swapConflict.id, targetItemId: swapConflict.items[0].id, replacementAssetId: assets[4].id, createdByUserId: user.id }, select: { id: true } }); taskIds.push(task.id);
  await assert.rejects(() => confirmHandheldIssue(swapConflict.id, { issueBatchId: swapConflict.id, matched: payload(swapConflict, assets[3]) }, user.id), (error: unknown) => error instanceof Error && /pending Swap/.test(error.message));
  assert.equal(await prisma.assetMovement.count({ where: { issueBatchItemId: swapConflict.items[0].id } }), 0);
  assert.equal(await prisma.assetScanConfirmation.count({ where: { issueBatchItemId: swapConflict.items[0].id } }), 0);
  console.log(JSON.stringify({ passed: true, normal: true, incrementalSameBatch: true, secondIncrementalAsset: true, retryIdempotent: true, concurrentClients: true, staleRejected: true, pendingSwapRejected: true, duplicateMovements: false, duplicateConfirmations: false }, null, 2));
}

main().finally(async () => {
  try {
    if (taskIds.length) await prisma.handheldSwapTask.deleteMany({ where: { id: { in: taskIds } } });
    if (assetIds.length) { await prisma.assetScanConfirmation.deleteMany({ where: { assetId: { in: assetIds } } }); await prisma.assetMovement.deleteMany({ where: { assetId: { in: assetIds } } }); await prisma.assetAssignment.deleteMany({ where: { assetId: { in: assetIds } } }); }
    if (batchIds.length) { await prisma.issueBatchItem.deleteMany({ where: { issueBatchId: { in: batchIds } } }); await prisma.issueBatch.deleteMany({ where: { id: { in: batchIds } } }); }
    if (assetIds.length) { await prisma.assetEpc.deleteMany({ where: { assetId: { in: assetIds } } }); await prisma.asset.deleteMany({ where: { id: { in: assetIds } } }); }
    if (categoryId) await prisma.assetCategory.delete({ where: { id: categoryId } });
    if (userId) await prisma.user.delete({ where: { id: userId } });
    if (locationIds.length) await prisma.location.deleteMany({ where: { id: { in: locationIds } } });
  } finally { await prisma.$disconnect(); }
}).catch((error) => { console.error(error); process.exitCode = 1; });
