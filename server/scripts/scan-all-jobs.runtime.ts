import assert from "node:assert/strict";
import { prisma } from "../src/config/prisma";
import { createAsset } from "../src/modules/assets/asset.service";
import { cancelIssuedBatchItem, compareBatchScans, confirmBatchItemIssue, createIssueBatch, returnScan, scanAllJobs } from "../src/modules/issue-batches/issueBatch.services";

const suffix = Date.now().toString();
const assetIds: number[] = []; const batchIds: number[] = []; const locationIds: number[] = [];
let categoryId = 0; let userId = 0;

async function main() {
  const role = await prisma.role.findFirstOrThrow({ where: { isActive: true } });
  const user = await prisma.user.create({ data: { username: `all-jobs-${suffix}`, fullName: "Scan All Jobs Runtime", email: `all-jobs-${suffix}@example.test`, passwordHash: "runtime-only", roleId: role.id } }); userId = user.id;
  const category = await prisma.assetCategory.create({ data: { categoryCode: `SAJ${suffix.slice(-7)}`, name: `Scan All Jobs ${suffix}` } }); categoryId = category.id;
  const home = await prisma.location.create({ data: { locationCode: `SJH${suffix.slice(-7)}`, name: "Scan Jobs Home", locationType: "STORAGE" } }); locationIds.push(home.id);
  const operationA = await prisma.location.create({ data: { locationCode: `SJA${suffix.slice(-7)}`, name: "Scan Jobs Operation A", locationType: "OPERATION" } }); locationIds.push(operationA.id);
  const operationB = await prisma.location.create({ data: { locationCode: `SJB${suffix.slice(-7)}`, name: "Scan Jobs Operation B", locationType: "OPERATION" } }); locationIds.push(operationB.id);
  const assets: Awaited<ReturnType<typeof createAsset>>[] = [];
  for (let n = 1; n <= 8; n += 1) {
    const asset = await createAsset({ assetCode: `SAJ-${suffix}-${n}`, itemName: `Scan Jobs Asset ${n}`, categoryId, locationId: home.id, autoGenerateEpc: true });
    assets.push(asset); assetIds.push(asset.id);
  }

  const batchA = await createIssueBatch({ assetIds: [assets[0].id, assets[1].id], jobNo: "JOB-A", defaultRecipientUserId: user.id, defaultToLocationId: operationA.id }, user.id); batchIds.push(batchA.id);
  const batchB = await createIssueBatch({ assetIds: [assets[2].id, assets[3].id], jobNo: "JOB-B", defaultRecipientUserId: user.id, defaultToLocationId: operationB.id }, user.id); batchIds.push(batchB.id);
  const batchC = await createIssueBatch({ assetIds: [assets[4].id], jobNo: "JOB-C", defaultRecipientUserId: user.id, defaultToLocationId: operationA.id }, user.id); batchIds.push(batchC.id);

  const cancelledBatch = await createIssueBatch({ assetIds: [assets[6].id], jobNo: "CANCELLED", defaultRecipientUserId: user.id, defaultToLocationId: operationA.id }, user.id); batchIds.push(cancelledBatch.id);
  await cancelIssuedBatchItem(cancelledBatch.items[0].id);
  const completedBatch = await createIssueBatch({ assetIds: [assets[7].id], jobNo: "COMPLETED", defaultRecipientUserId: user.id, defaultToLocationId: operationA.id }, user.id); batchIds.push(completedBatch.id);
  await confirmBatchItemIssue(completedBatch.items[0].id, assets[7].epc!.epcCode, undefined, user.id);
  await returnScan({ epcs: [assets[7].epc!.epcCode] }, user.id);
  assert.equal((await prisma.issueBatch.findUniqueOrThrow({ where: { id: completedBatch.id } })).status, "PROCESSING");

  const movementBefore = await prisma.assetMovement.count({ where: { assetId: { in: assets.slice(0, 5).map((asset) => asset.id) } } });
  const auditBefore = await prisma.assetScanConfirmation.count({ where: { assetId: { in: assets.slice(0, 5).map((asset) => asset.id) }, confirmationType: "ISSUE_CONFIRMATION" } });
  const scanned = await scanAllJobs({ epcs: [assets[0].epc!.epcCode, assets[2].epc!.epcCode, assets[4].epc!.epcCode, assets[5].epc!.epcCode, "INVALID-EPC"] }, user.id);
  assert.deepEqual(scanned.results.map((row) => row.classification), ["MATCHED_CONFIRMED", "MATCHED_CONFIRMED", "MATCHED_CONFIRMED", "UNEXPECTED_NOT_PREPARED", "INVALID_OR_INACTIVE_EPC"]);
  assert.deepEqual(scanned.results.slice(0, 3).map((row) => row.jobNo), ["JOB-A", "JOB-B", "JOB-C"]);
  assert.equal(await prisma.assetMovement.count({ where: { assetId: { in: assets.slice(0, 5).map((asset) => asset.id) } } }), movementBefore + 3);
  assert.equal(await prisma.assetScanConfirmation.count({ where: { assetId: { in: assets.slice(0, 5).map((asset) => asset.id) }, confirmationType: "ISSUE_CONFIRMATION" } }), auditBefore + 3);
  for (const asset of [assets[0], assets[2], assets[4]]) assert.equal((await prisma.asset.findUniqueOrThrow({ where: { id: asset.id } })).status, "IN_USE");
  for (const asset of [assets[1], assets[3]]) assert.equal((await prisma.asset.findUniqueOrThrow({ where: { id: asset.id } })).status, "PENDING_CONFIRMATION");
  assert.equal((await prisma.asset.findUniqueOrThrow({ where: { id: assets[5].id } })).status, "AVAILABLE");

  const repeated = await scanAllJobs({ epcs: [assets[0].epc!.epcCode, assets[2].epc!.epcCode, assets[4].epc!.epcCode, assets[0].epc!.epcCode] }, user.id);
  assert.deepEqual(repeated.results.map((row) => row.classification), ["EXPECTED_ALREADY_CONFIRMED", "EXPECTED_ALREADY_CONFIRMED", "EXPECTED_ALREADY_CONFIRMED", "DUPLICATE_SCAN"]);

  const batchRace = await Promise.allSettled([
    scanAllJobs({ epcs: [assets[1].epc!.epcCode] }, user.id),
    compareBatchScans(batchA.id, { epcs: [assets[1].epc!.epcCode] }, user.id),
  ]);
  assert.ok(batchRace.some((result) => result.status === "fulfilled"));
  const itemA = batchA.items.find((item) => item.assetId === assets[1].id)!;
  assert.equal(await prisma.assetMovement.count({ where: { issueBatchItemId: itemA.id } }), 1);
  assert.equal(await prisma.assetScanConfirmation.count({ where: { issueBatchItemId: itemA.id, confirmationType: "ISSUE_CONFIRMATION" } }), 1);

  const itemB = batchB.items.find((item) => item.assetId === assets[3].id)!;
  const individualRace = await Promise.allSettled([
    scanAllJobs({ epcs: [assets[3].epc!.epcCode] }, user.id),
    confirmBatchItemIssue(itemB.id, assets[3].epc!.epcCode, undefined, user.id),
  ]);
  assert.ok(individualRace.some((result) => result.status === "fulfilled"));
  assert.equal(await prisma.assetMovement.count({ where: { issueBatchItemId: itemB.id } }), 1);
  assert.equal(await prisma.assetScanConfirmation.count({ where: { issueBatchItemId: itemB.id, confirmationType: "ISSUE_CONFIRMATION" } }), 1);

  const excluded = await scanAllJobs({ epcs: [assets[6].epc!.epcCode, assets[7].epc!.epcCode] }, user.id);
  assert.deepEqual(excluded.results.map((row) => row.classification), ["UNEXPECTED_NOT_PREPARED", "UNEXPECTED_NOT_PREPARED"]);
  console.log(JSON.stringify({ passed: true, activeBatches: 3, pendingAssets: 5, crossBatchConfirmed: 3, unrelatedAvailableUnchanged: true, invalidUnchanged: true, remainingPending: 2, repeatIdempotent: true, perBatchRaceSingleTransition: true, individualRaceSingleTransition: true, completedAndCancelledExcluded: true }, null, 2));
}

main().finally(async () => {
  try {
    if (assetIds.length) { await prisma.assetScanConfirmation.deleteMany({ where: { assetId: { in: assetIds } } }); await prisma.assetMovement.deleteMany({ where: { assetId: { in: assetIds } } }); await prisma.assetAssignment.deleteMany({ where: { assetId: { in: assetIds } } }); }
    if (batchIds.length) { await prisma.issueBatchItem.deleteMany({ where: { issueBatchId: { in: batchIds } } }); await prisma.issueBatch.deleteMany({ where: { id: { in: batchIds } } }); }
    if (assetIds.length) { await prisma.assetEpc.deleteMany({ where: { assetId: { in: assetIds } } }); await prisma.asset.deleteMany({ where: { id: { in: assetIds } } }); }
    if (categoryId) await prisma.assetCategory.delete({ where: { id: categoryId } });
    if (userId) await prisma.user.delete({ where: { id: userId } });
    if (locationIds.length) await prisma.location.deleteMany({ where: { id: { in: locationIds } } });
  } finally { await prisma.$disconnect(); }
}).catch((error) => { console.error(error); process.exitCode = 1; });
