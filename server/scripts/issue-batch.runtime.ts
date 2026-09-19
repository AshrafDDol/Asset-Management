import assert from "node:assert/strict";
import { prisma } from "../src/config/prisma";
import { createAsset, getAllAssets } from "../src/modules/assets/asset.service";
import { getAllAssetMovements } from "../src/modules/asset-movements/assetMovement.services";
import { addAssetsToIssueBatch, cancelIssueBatch, cancelIssuedBatchItem, compareBatchScans, confirmBatchItemIssue, createIssueBatch, returnScan } from "../src/modules/issue-batches/issueBatch.services";

const suffix = Date.now().toString();
const assetIds: number[] = []; const batchIds: number[] = []; const locationIds: number[] = [];
let categoryId = 0; let userId = 0;

async function main() {
  const role = await prisma.role.findFirstOrThrow({ where: { isActive: true } });
  const user = await prisma.user.create({ data: { username: `batch-${suffix}`, fullName: "Batch Runtime User", email: `batch-${suffix}@example.test`, passwordHash: "runtime-only", roleId: role.id } }); userId = user.id;
  const category = await prisma.assetCategory.create({ data: { categoryCode: `BC${suffix.slice(-8)}`, name: `Batch Runtime ${suffix}` } }); categoryId = category.id;
  const home = await prisma.location.create({ data: { locationCode: `BH${suffix.slice(-8)}`, name: "Batch Runtime Home", locationType: "STORAGE" } }); locationIds.push(home.id);
  const operationA = await prisma.location.create({ data: { locationCode: `BO${suffix.slice(-8)}`, name: "Batch Runtime Operation A", locationType: "OPERATION" } }); locationIds.push(operationA.id);
  const operationB = await prisma.location.create({ data: { locationCode: `BM${suffix.slice(-8)}`, name: "Batch Runtime Operation B", locationType: "OPERATION" } }); locationIds.push(operationB.id);
  const assets: Awaited<ReturnType<typeof createAsset>>[] = [];
  for (let n = 1; n <= 6; n += 1) { const asset = await createAsset({ assetCode: `BATCH-${suffix}-${n}`, itemName: `Runtime Asset ${n}`, categoryId, locationId: home.id, autoGenerateEpc: true, measurementHeight: 100 + n, measurementWidth: 200 + n }); assets.push(asset); assetIds.push(asset.id); assert.match(asset.epc!.epcCode, /^(?:[0-9A-F]{2})+$/); }
  assert.equal(new Set(assets.map((a) => a.epc!.epcCode)).size, 6);
  const search = await getAllAssets({ assetCode: `BATCH-${suffix}`, categoryId }); assert.equal(search.length, 6);

  const beforeMissingJob = await prisma.issueBatch.count();
  await assert.rejects(() => createIssueBatch({ assetIds: [assets[0].id], jobNo: "   ", defaultRecipientUserId: user.id, defaultToLocationId: operationA.id }, user.id), /Job No\. is required/);
  assert.equal(await prisma.issueBatch.count(), beforeMissingJob);
  assert.equal((await prisma.asset.findUniqueOrThrow({ where: { id: assets[0].id } })).status, "AVAILABLE");
  const initialBatchCount = await prisma.issueBatch.count();
  const initialBatch = await createIssueBatch({ assetIds: assets.slice(0, 2).map((a) => a.id), jobNo: ` JOB-${suffix} `, defaultRecipientUserId: user.id, defaultToLocationId: operationA.id }, user.id); batchIds.push(initialBatch.id);
  assert.equal(initialBatch.jobNo, `JOB-${suffix}`);
  const originalItemIds = initialBatch.items.map((item) => item.id);
  const batch = await addAssetsToIssueBatch(initialBatch.id, { assetIds: [assets[2].id], jobNo: `job-${suffix}`, defaultRecipientUserId: user.id, defaultToLocationId: operationA.id, items: [{ assetId: assets[2].id, toLocationId: operationB.id }] }, user.id);
  assert.equal(await prisma.issueBatch.count(), initialBatchCount + 1);
  assert.equal(batch.id, initialBatch.id); assert.equal(batch.items.length, 3);
  assert.deepEqual(batch.items.filter((item) => originalItemIds.includes(item.id)).map((item) => item.status), ["ISSUED", "ISSUED"]);
  await assert.rejects(() => createIssueBatch({ assetIds: [assets[3].id], jobNo: `JOB-${suffix}`, defaultRecipientUserId: user.id, defaultToLocationId: operationA.id }, user.id), /already exists/);
  assert.equal((await prisma.asset.findUniqueOrThrow({ where: { id: assets[3].id } })).status, "AVAILABLE");
  const ambiguousBatch = await prisma.issueBatch.create({ data: { batchNo: `AMB-${suffix}`, jobNo: `JOB-${suffix}`, createdByUserId: user.id } }); batchIds.push(ambiguousBatch.id);
  await assert.rejects(() => addAssetsToIssueBatch(initialBatch.id, { assetIds: [assets[3].id], jobNo: `JOB-${suffix}`, defaultRecipientUserId: user.id, defaultToLocationId: operationA.id }, user.id), /multiple active Issue Batches/);
  await prisma.issueBatch.delete({ where: { id: ambiguousBatch.id } });
  assert.deepEqual(batch.items.map((item) => item.status), ["ISSUED", "ISSUED", "ISSUED"]);
  assert.deepEqual(batch.items.map((item) => item.asset.status), ["PENDING_CONFIRMATION", "PENDING_CONFIRMATION", "PENDING_CONFIRMATION"]);
  assert.ok(batch.items.every((item) => item.assignment?.status === "ACTIVE" && item.assignment.isActive));
  assert.equal(batch.items.find((item) => item.assetId === assets[2].id)!.toLocationId, operationB.id);

  const beforeConflictBatches = await prisma.issueBatch.count();
  await assert.rejects(() => createIssueBatch({ assetIds: [assets[0].id, assets[3].id], jobNo: `CONFLICT-${suffix}`, defaultRecipientUserId: user.id, defaultToLocationId: operationA.id }, user.id));
  assert.equal(await prisma.issueBatch.count(), beforeConflictBatches); assert.equal((await prisma.asset.findUniqueOrThrow({ where: { id: assets[3].id } })).status, "AVAILABLE");
  const reservationRace = await Promise.allSettled([
    createIssueBatch({ assetIds: [assets[5].id], jobNo: `RACE-A-${suffix}`, defaultRecipientUserId: user.id, defaultToLocationId: operationA.id }, user.id),
    createIssueBatch({ assetIds: [assets[5].id], jobNo: `RACE-B-${suffix}`, defaultRecipientUserId: user.id, defaultToLocationId: operationA.id }, user.id),
  ]);
  assert.equal(reservationRace.filter((result) => result.status === "fulfilled").length, 1); assert.equal(reservationRace.filter((result) => result.status === "rejected").length, 1);
  const raceBatch = reservationRace.find((result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof createIssueBatch>>> => result.status === "fulfilled")!.value; batchIds.push(raceBatch.id);
  const confirmationRace = await Promise.allSettled([compareBatchScans(raceBatch.id, { epcs: [assets[5].epc!.epcCode] }, user.id), compareBatchScans(raceBatch.id, { epcs: [assets[5].epc!.epcCode] }, user.id)]);
  assert.ok(confirmationRace.some((result) => result.status === "fulfilled"));
  assert.equal(await prisma.assetScanConfirmation.count({ where: { issueBatchItemId: raceBatch.items[0].id, confirmationType: "ISSUE_CONFIRMATION" } }), 1);
  assert.equal(await prisma.assetMovement.count({ where: { issueBatchItemId: raceBatch.items[0].id } }), 1);

  const movementBeforeIssue = await prisma.assetMovement.count({ where: { assetId: { in: assets.slice(0, 3).map((a) => a.id) } } });
  for (const asset of assets.slice(0, 3)) { const row = await prisma.asset.findUniqueOrThrow({ where: { id: asset.id } }); assert.equal(row.status, "PENDING_CONFIRMATION"); assert.equal(row.locationId, home.id); }
  assert.equal(await prisma.assetMovement.count({ where: { assetId: { in: assets.slice(0, 3).map((a) => a.id) } } }), movementBeforeIssue);
  assert.equal(await prisma.assetScanConfirmation.count({ where: { assetId: { in: assets.slice(0, 3).map((a) => a.id) } } }), 0);

  const firstPendingItem = batch.items.find((item) => item.assetId === assets[0].id)!;
  await assert.rejects(() => confirmBatchItemIssue(firstPendingItem.id, assets[1].epc!.epcCode, undefined, user.id));
  await confirmBatchItemIssue(firstPendingItem.id, assets[0].epc!.epcCode, undefined, user.id);
  const compare = await compareBatchScans(batch.id, { epcs: [assets[1].epc!.epcCode, assets[3].epc!.epcCode, assets[1].epc!.epcCode, "BAD"] }, user.id);
  assert.deepEqual(compare.results.map((r) => r.classification), ["MATCHED_CONFIRMED", "UNEXPECTED_NOT_SELECTED", "DUPLICATE_SCAN", "INVALID_OR_INACTIVE_EPC"]);
  assert.equal((await prisma.asset.findUniqueOrThrow({ where: { id: assets[2].id } })).status, "PENDING_CONFIRMATION");
  assert.equal((await prisma.asset.findUniqueOrThrow({ where: { id: assets[3].id } })).status, "AVAILABLE");
  const retry = await compareBatchScans(batch.id, { epcs: [assets[1].epc!.epcCode] }, user.id); assert.equal(retry.results[0].classification, "EXPECTED_ALREADY_CONFIRMED");
  const partialCancel = await cancelIssueBatch(batch.id); assert.equal(partialCancel.cancelledCount, 1); assert.equal(partialCancel.confirmedCount, 2);
  assert.equal((await prisma.asset.findUniqueOrThrow({ where: { id: assets[2].id } })).status, "AVAILABLE");
  assert.equal((await prisma.issueBatchItem.findFirstOrThrow({ where: { issueBatchId: batch.id, assetId: assets[2].id } })).status, "CANCELLED");
  assert.equal((await prisma.asset.findUniqueOrThrow({ where: { id: assets[0].id } })).status, "IN_USE");
  assert.equal(await prisma.assetScanConfirmation.count({ where: { issueBatchItem: { issueBatchId: batch.id }, confirmationType: "ISSUE_CONFIRMATION" } }), 2);
  assert.equal(await prisma.assetMovement.count({ where: { issueBatchItem: { issueBatchId: batch.id } } }), 2);
  const issueMovement = (await getAllAssetMovements()).find((movement) => movement.issueBatchItem?.issueBatch.jobNo === `JOB-${suffix}`);
  assert.equal(issueMovement?.issueBatchItem?.issueBatch.jobNo, `JOB-${suffix}`);

  const cancelBatch = await createIssueBatch({ assetIds: [assets[4].id], jobNo: `CANCEL-${suffix}`, defaultRecipientUserId: user.id, defaultToLocationId: operationA.id }, user.id); batchIds.push(cancelBatch.id);
  await cancelIssuedBatchItem(cancelBatch.items[0].id);
  assert.equal((await prisma.asset.findUniqueOrThrow({ where: { id: assets[4].id } })).status, "AVAILABLE");
  assert.equal((await prisma.issueBatchItem.findUniqueOrThrow({ where: { id: cancelBatch.items[0].id } })).status, "CANCELLED");
  assert.equal((await prisma.assetAssignment.findUniqueOrThrow({ where: { issueBatchItemId: cancelBatch.items[0].id } })).status, "CANCELLED");
  assert.equal(await prisma.assetMovement.count({ where: { issueBatchItemId: cancelBatch.items[0].id } }), 0);
  assert.equal(await prisma.assetScanConfirmation.count({ where: { issueBatchItemId: cancelBatch.items[0].id } }), 0);
  await assert.rejects(() => addAssetsToIssueBatch(cancelBatch.id, { assetIds: [assets[4].id], jobNo: `CANCEL-${suffix}`, defaultRecipientUserId: user.id, defaultToLocationId: operationA.id }, user.id), /already cancelled/);

  const firstItem = await prisma.issueBatchItem.findFirstOrThrow({ where: { issueBatchId: batch.id, assetId: assets[0].id } });
  const secondItem = await prisma.issueBatchItem.findFirstOrThrow({ where: { issueBatchId: batch.id, assetId: assets[1].id } });
  const raceItem = await prisma.issueBatchItem.findFirstOrThrow({ where: { issueBatchId: raceBatch.id, assetId: assets[5].id } });
  const originalCondition = (await prisma.asset.findUniqueOrThrow({ where: { id: assets[0].id } })).condition;
  const multiBatchReturn = await returnScan({ epcs: [assets[0].epc!.epcCode.toLowerCase(), assets[5].epc!.epcCode, assets[0].epc!.epcCode, assets[3].epc!.epcCode, "BAD"] }, user.id);
  assert.deepEqual(multiBatchReturn.results.map((result) => result.classification), ["RETURNED", "RETURNED", "DUPLICATE_SCAN", "NOT_IN_USE", "INVALID_OR_INACTIVE_EPC"]);
  for (const asset of [assets[0], assets[5]]) { const returned = await prisma.asset.findUniqueOrThrow({ where: { id: asset.id } }); assert.equal(returned.status, "AVAILABLE"); assert.equal(returned.locationId, home.id); }
  assert.equal((await prisma.asset.findUniqueOrThrow({ where: { id: assets[0].id } })).condition, originalCondition);
  assert.equal((await prisma.issueBatchItem.findUniqueOrThrow({ where: { id: firstItem.id } })).status, "RETURNED");
  const closedAssignment = await prisma.assetAssignment.findUniqueOrThrow({ where: { issueBatchItemId: firstItem.id } });
  assert.equal(closedAssignment.status, "RETURNED"); assert.equal(closedAssignment.isActive, false); assert.ok(closedAssignment.returnedAt);
  assert.equal(await prisma.assetMovement.count({ where: { issueBatchItemId: firstItem.id } }), 2);
  assert.equal(await prisma.assetMovement.count({ where: { issueBatchItemId: raceItem.id } }), 2);
  assert.equal(await prisma.assetScanConfirmation.count({ where: { issueBatchItemId: firstItem.id, confirmationType: "RETURN_CONFIRMATION" } }), 1);
  const returnMovement = (await getAllAssetMovements()).find((movement) => movement.issueBatchItem?.issueBatch.jobNo === `JOB-${suffix}` && movement.reason?.startsWith("RETURN SCAN"));
  assert.equal(returnMovement?.issueBatchItem?.issueBatch.jobNo, `JOB-${suffix}`);
  assert.equal(await prisma.assetScanConfirmation.count({ where: { issueBatchItemId: raceItem.id, confirmationType: "RETURN_CONFIRMATION" } }), 1);
  assert.equal((await prisma.assetScanConfirmation.findFirstOrThrow({ where: { issueBatchItemId: firstItem.id, confirmationType: "RETURN_CONFIRMATION" } })).confirmationSource, "WEB_ADMIN");
  assert.equal((await returnScan({ epcs: [assets[0].epc!.epcCode] }, user.id)).results[0].classification, "ALREADY_RETURNED");

  const movementBeforeReturnRace = await prisma.assetMovement.count({ where: { issueBatchItemId: secondItem.id } });
  const auditBeforeReturnRace = await prisma.assetScanConfirmation.count({ where: { issueBatchItemId: secondItem.id, confirmationType: "RETURN_CONFIRMATION" } });
  const returnRace = await Promise.all([returnScan({ epcs: [assets[1].epc!.epcCode] }, user.id), returnScan({ epcs: [assets[1].epc!.epcCode] }, user.id)]);
  assert.deepEqual(returnRace.flatMap((result) => result.results.map((row) => row.classification)).sort(), ["ALREADY_RETURNED", "RETURNED"]);
  assert.equal(await prisma.assetMovement.count({ where: { issueBatchItemId: secondItem.id } }), movementBeforeReturnRace + 1);
  assert.equal(await prisma.assetScanConfirmation.count({ where: { issueBatchItemId: secondItem.id, confirmationType: "RETURN_CONFIRMATION" } }), auditBeforeReturnRace + 1);
  assert.equal((await prisma.issueBatch.findUniqueOrThrow({ where: { id: batch.id } })).status, "PROCESSING");
  const reopened = await addAssetsToIssueBatch(batch.id, { assetIds: [assets[4].id], jobNo: `JOB-${suffix}`, defaultRecipientUserId: user.id, defaultToLocationId: operationA.id }, user.id);
  assert.equal(reopened.id, batch.id); assert.equal(reopened.items.find((item) => item.assetId === assets[4].id)?.status, "ISSUED");

  const unresolvedBatch = await createIssueBatch({ assetIds: [assets[2].id], jobNo: `UNRESOLVED-${suffix}`, defaultRecipientUserId: user.id, defaultToLocationId: operationA.id }, user.id); batchIds.push(unresolvedBatch.id);
  await confirmBatchItemIssue(unresolvedBatch.items[0].id, assets[2].epc!.epcCode, undefined, user.id);
  await prisma.asset.update({ where: { id: assets[2].id }, data: { homeLocationId: null } });
  const unresolved = await returnScan({ epcs: [assets[2].epc!.epcCode] }, user.id);
  assert.equal(unresolved.results[0].classification, "HOME_LOCATION_UNRESOLVED");
  assert.equal((await prisma.asset.findUniqueOrThrow({ where: { id: assets[2].id } })).status, "IN_USE");
  assert.equal((await prisma.issueBatchItem.findUniqueOrThrow({ where: { id: unresolvedBatch.items[0].id } })).status, "CONFIRMED");
  assert.equal(await prisma.assetScanConfirmation.count({ where: { issueBatchItemId: unresolvedBatch.items[0].id, confirmationType: "RETURN_CONFIRMATION" } }), 0);
  await prisma.asset.update({ where: { id: assets[2].id }, data: { homeLocationId: home.id } });

  console.log(JSON.stringify({ passed: true, assets: 6, directAwaitingConfirmation: 3, atomicReservation: true, oneByOneConfirmation: true, scanAllExpectedConfirmed: true, unexpectedUnchanged: true, duplicateIdempotent: true, individualCancel: true, partialBatchCancel: true, concurrentConfirmation: true, multiBatchReturn: true, repeatReturnIdempotent: true, concurrentReturn: true, conditionPreserved: true, unresolvedHomeBlocked: true }, null, 2));
}

main().finally(async () => {
  try {
    if (assetIds.length) { await prisma.assetScanConfirmation.deleteMany({ where: { assetId: { in: assetIds } } }); await prisma.assetMovement.deleteMany({ where: { assetId: { in: assetIds } } }); await prisma.assetAssignment.deleteMany({ where: { assetId: { in: assetIds } } }); }
    if (batchIds.length) { await prisma.issueBatchItem.deleteMany({ where: { issueBatchId: { in: batchIds } } }); await prisma.issueBatch.deleteMany({ where: { id: { in: batchIds } } }); }
    if (assetIds.length) { await prisma.assetEpc.deleteMany({ where: { assetId: { in: assetIds } } }); await prisma.asset.deleteMany({ where: { id: { in: assetIds } } }); }
    if (categoryId) await prisma.assetCategory.delete({ where: { id: categoryId } }); if (userId) await prisma.user.delete({ where: { id: userId } }); if (locationIds.length) await prisma.location.deleteMany({ where: { id: { in: locationIds } } });
  } finally { await prisma.$disconnect(); }
}).catch((error) => { console.error(error); process.exitCode = 1; });
