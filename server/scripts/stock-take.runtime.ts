import assert from 'node:assert/strict';
import { prisma } from '../src/config/prisma';
import { createAsset } from '../src/modules/assets/asset.service';
import { confirmHandheldReturns } from '../src/modules/handheld-work/handheldWork.services';
import { confirmHandheldIssue, createIssueBatch } from '../src/modules/issue-batches/issueBatch.services';
import { completeStockTake, createStockTake, recordStockTakeScans } from '../src/modules/stock-takes/stockTake.services';

const suffix = Date.now().toString();
let userId = 0; let categoryId = 0; const locationIds: number[] = []; const assetIds: number[] = []; const batchIds: number[] = []; const sessionIds: number[] = [];
async function main() {
  const role = await prisma.role.findFirstOrThrow({ where: { isActive: true } });
  const user = await prisma.user.create({ data: { username: `stock-take-${suffix}`, fullName: 'Stock Take Runtime', email: `stock-take-${suffix}@example.test`, passwordHash: 'runtime-only', roleId: role.id } }); userId = user.id;
  const category = await prisma.assetCategory.create({ data: { categoryCode: `ST${suffix.slice(-8)}`, name: 'Stock Take Runtime' } }); categoryId = category.id;
  const home = await prisma.location.create({ data: { locationCode: `STH${suffix.slice(-7)}`, name: 'Stock Take Rack', locationType: 'RACK' } }); locationIds.push(home.id);
  const production = await prisma.location.create({ data: { locationCode: `STP${suffix.slice(-7)}`, name: 'Stock Take Production', locationType: 'PRODUCTION_AREA' } }); locationIds.push(production.id);
  const asset = await createAsset({ assetCode: `ST-${suffix}`, itemName: 'Counted Asset', categoryId, locationId: home.id, autoGenerateEpc: true }); assetIds.push(asset.id);
  const before = await prisma.asset.findUniqueOrThrow({ where: { id: asset.id } });
  const lifecycleBefore = { assignments: await prisma.assetAssignment.count({ where: { assetId: asset.id } }), items: await prisma.issueBatchItem.count({ where: { assetId: asset.id } }), movements: await prisma.assetMovement.count({ where: { assetId: asset.id } }), swaps: await prisma.handheldSwapTask.count({ where: { replacementAssetId: asset.id } }) };

  const stockTake = await createStockTake({ locationId: home.id, stockTakeDate: new Date().toISOString().slice(0, 10), pic: 'Runtime PIC' }, user.id); sessionIds.push(stockTake.id);
  assert.equal(stockTake.summary.expected, 1); assert.equal(stockTake.items[0].expectedAssetCode, asset.assetCode); assert.equal(stockTake.items[0].expectedEpc, asset.epc!.epcCode.trim().toUpperCase());
  const afterCreate = await prisma.asset.findUniqueOrThrow({ where: { id: asset.id } });
  assert.deepEqual({ status: afterCreate.status, locationId: afterCreate.locationId }, { status: before.status, locationId: before.locationId });
  assert.deepEqual(lifecycleBefore, { assignments: await prisma.assetAssignment.count({ where: { assetId: asset.id } }), items: await prisma.issueBatchItem.count({ where: { assetId: asset.id } }), movements: await prisma.assetMovement.count({ where: { assetId: asset.id } }), swaps: await prisma.handheldSwapTask.count({ where: { replacementAssetId: asset.id } }) });

  const batch = await createIssueBatch({ assetIds: [asset.id], jobNo: `STOCK-NR-${suffix}`, defaultRecipientUserId: user.id, defaultToLocationId: production.id }, user.id); batchIds.push(batch.id);
  const item = batch.items[0];
  await confirmHandheldIssue(batch.id, { issueBatchId: batch.id, matched: [{ itemId: item.id, assetId: asset.id, assignmentId: item.assignment!.id, epc: asset.epc!.epcCode }] }, user.id);
  const snapshotAfterIssue = await prisma.stockTakeItem.findMany({ where: { sessionId: stockTake.id } });
  assert.equal(snapshotAfterIssue.length, 1); assert.equal(snapshotAfterIssue[0].expectedAssetCode, asset.assetCode);

  const mutationBaseline = await prisma.asset.findUniqueOrThrow({ where: { id: asset.id } });
  const movementBaseline = await prisma.assetMovement.count({ where: { assetId: asset.id } });
  const scanned = await recordStockTakeScans(stockTake.id, { epcs: [`  ${asset.epc!.epcCode.toLowerCase()}  `, ' unexpected-epc '] });
  assert.deepEqual(scanned.summary, { expected: 1, found: 1, missing: 0, unexpected: 1 });
  assert.deepEqual(await prisma.asset.findUniqueOrThrow({ where: { id: asset.id } }), mutationBaseline);
  assert.equal(await prisma.assetMovement.count({ where: { assetId: asset.id } }), movementBaseline);
  const completed = await completeStockTake(stockTake.id, user.id); assert.equal(completed.status, 'COMPLETED');
  assert.deepEqual(await prisma.asset.findUniqueOrThrow({ where: { id: asset.id } }), mutationBaseline);
  assert.equal(await prisma.assetMovement.count({ where: { assetId: asset.id } }), movementBaseline);

  const inUseStockTake = await createStockTake({ locationId: production.id, stockTakeDate: new Date().toISOString().slice(0, 10), pic: 'Runtime PIC' }, user.id); sessionIds.push(inUseStockTake.id);
  assert.equal(inUseStockTake.summary.expected, 1);
  assert.equal((await prisma.asset.findUniqueOrThrow({ where: { id: asset.id } })).status, 'IN_USE');
  const activeItem = (await prisma.issueBatch.findUniqueOrThrow({ where: { id: batch.id }, include: { items: { include: { assignment: true } } } })).items[0];
  await confirmHandheldReturns({ issueBatchId: batch.id, items: [{ itemId: activeItem.id, assignmentId: activeItem.assignment!.id, assetId: asset.id, epc: asset.epc!.epcCode }] }, user.id);
  assert.equal((await prisma.asset.findUniqueOrThrow({ where: { id: asset.id } })).status, 'AVAILABLE');
  console.log(JSON.stringify({ passed: true, issueNotBlocked: true, stockTakeCreatedWhileInUse: true, returnNotBlocked: true, snapshotFrozen: true, normalizedExactMatch: true, unexpectedNoMutation: true, completionNoMutation: true }, null, 2));
}

main().finally(async () => {
  try {
    if (sessionIds.length) await prisma.stockTakeSession.deleteMany({ where: { id: { in: sessionIds } } });
    if (assetIds.length) { await prisma.assetScanConfirmation.deleteMany({ where: { assetId: { in: assetIds } } }); await prisma.assetMovement.deleteMany({ where: { assetId: { in: assetIds } } }); await prisma.assetAssignment.deleteMany({ where: { assetId: { in: assetIds } } }); }
    if (batchIds.length) { await prisma.issueBatchItem.deleteMany({ where: { issueBatchId: { in: batchIds } } }); await prisma.issueBatch.deleteMany({ where: { id: { in: batchIds } } }); }
    if (assetIds.length) { await prisma.assetEpc.deleteMany({ where: { assetId: { in: assetIds } } }); await prisma.asset.deleteMany({ where: { id: { in: assetIds } } }); }
    if (categoryId) await prisma.assetCategory.delete({ where: { id: categoryId } }); if (userId) await prisma.user.delete({ where: { id: userId } }); if (locationIds.length) await prisma.location.deleteMany({ where: { id: { in: locationIds } } });
  } finally { await prisma.$disconnect(); }
}).catch(error => { console.error(error); process.exitCode = 1; });
