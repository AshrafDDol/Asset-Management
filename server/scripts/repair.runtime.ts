import assert from 'node:assert/strict';
import { prisma } from '../src/config/prisma';
import { createAsset } from '../src/modules/assets/asset.service';
import { confirmHandheldIssue, createIssueBatch } from '../src/modules/issue-batches/issueBatch.services';
import { prepareHandheldSwap } from '../src/modules/handheld-work/handheldWork.services';
import { cancelRepairTask, confirmRepairTask, prepareCompleteRepair, prepareStartRepair } from '../src/modules/repairs/repair.services';

const suffix = Date.now().toString();
const assetIds: number[] = []; const batchIds: number[] = []; const repairIds: number[] = []; const locationIds: number[] = [];
let userId = 0; let categoryId = 0;
async function main() {
  const role = await prisma.role.findFirstOrThrow({ where: { isActive: true } });
  const user = await prisma.user.create({ data: { username: `repair-${suffix}`, fullName: 'Repair Runtime', email: `repair-${suffix}@example.test`, passwordHash: 'runtime-only', roleId: role.id } }); userId = user.id;
  const category = await prisma.assetCategory.create({ data: { categoryCode: `RP${suffix.slice(-8)}`, name: 'Repair Runtime' } }); categoryId = category.id;
  const home = await prisma.location.create({ data: { locationCode: `RPH${suffix.slice(-7)}`, name: 'Repair Home', locationType: 'STORAGE' } }); locationIds.push(home.id);
  const repairLocation = await prisma.location.create({ data: { locationCode: `RPR${suffix.slice(-7)}`, name: 'Repair Workshop', locationType: 'REPAIR' } }); locationIds.push(repairLocation.id);
  const operation = await prisma.location.create({ data: { locationCode: `RPO${suffix.slice(-7)}`, name: 'Repair Operation', locationType: 'OPERATION' } }); locationIds.push(operation.id);
  const assets = [];
  for (let index = 0; index < 4; index += 1) { const asset = await createAsset({ assetCode: `RP-${suffix}-${index}`, itemName: `Repair Asset ${index}`, categoryId, locationId: home.id, epcCode: `AA${suffix}${index}`.padEnd(16, '0').slice(0, 16) }); assets.push(asset); assetIds.push(asset.id); }
  const [staleAsset, repairAsset, inUseAsset, cancelAsset] = assets;

  const staleTask = await prepareStartRepair({ assetId: staleAsset.id, reason: 'Stale scenario', repairLocationId: repairLocation.id }, userId); repairIds.push(staleTask.repairId);
  let current = await prisma.asset.findUniqueOrThrow({ where: { id: staleAsset.id } }); assert.equal(current.status, 'AVAILABLE'); assert.equal(current.locationId, home.id);
  const staleBatch = await createIssueBatch({ assetIds: [staleAsset.id], jobNo: `REPAIR-STALE-${suffix}`, defaultRecipientUserId: userId, defaultToLocationId: operation.id }, userId); batchIds.push(staleBatch.id);
  await assert.rejects(() => confirmRepairTask(staleTask.id, { epc: staleAsset.epc!.epcCode }, userId), /stale/i);
  assert.equal((await prisma.repairTask.findUniqueOrThrow({ where: { id: staleTask.id } })).status, 'PENDING');

  const cancelledTask = await prepareStartRepair({ assetId: cancelAsset.id, reason: 'Cancellation', repairLocationId: repairLocation.id }, userId); repairIds.push(cancelledTask.repairId);
  const cancelBefore = await prisma.asset.findUniqueOrThrow({ where: { id: cancelAsset.id } }); await cancelRepairTask(cancelledTask.id, userId); const cancelAfter = await prisma.asset.findUniqueOrThrow({ where: { id: cancelAsset.id } }); assert.deepEqual({ status: cancelAfter.status, locationId: cancelAfter.locationId }, { status: cancelBefore.status, locationId: cancelBefore.locationId });
  assert.equal(await prisma.assetMovement.count({ where: { assetId: cancelAsset.id } }), 0);

  const startTask = await prepareStartRepair({ assetId: repairAsset.id, reason: 'Blade inspection', repairLocationId: repairLocation.id, remarks: 'POC repair' }, userId); repairIds.push(startTask.repairId);
  const prepared = await prisma.asset.findUniqueOrThrow({ where: { id: repairAsset.id } }); assert.equal(prepared.status, 'AVAILABLE'); assert.equal(prepared.locationId, home.id);
  assert.equal(await prisma.assetMovement.count({ where: { assetId: repairAsset.id } }), 0);
  await assert.rejects(() => confirmRepairTask(startTask.id, { epc: inUseAsset.epc!.epcCode }, userId), /no longer matches/);
  assert.deepEqual({ status: (await prisma.asset.findUniqueOrThrow({ where: { id: repairAsset.id } })).status, task: (await prisma.repairTask.findUniqueOrThrow({ where: { id: startTask.id } })).status }, { status: 'AVAILABLE', task: 'PENDING' });
  assert.equal(await prisma.assetMovement.count({ where: { assetId: repairAsset.id } }), 0);
  const started = await confirmRepairTask(startTask.id, { epc: ` ${repairAsset.epc!.epcCode.toLowerCase()} ` }, userId);
  assert.equal(started.status, 'IN_PROGRESS'); assert.ok(started.startedAt); assert.equal(started.startedByUserId, userId);
  current = await prisma.asset.findUniqueOrThrow({ where: { id: repairAsset.id } }); assert.equal(current.status, 'UNDER_REPAIR'); assert.equal(current.locationId, repairLocation.id);
  let repairMovements = await prisma.assetMovement.findMany({ where: { assetId: repairAsset.id, movementType: 'REPAIR_TRANSFER' }, orderBy: { movementDate: 'asc' } });
  assert.equal(repairMovements.length, 1); assert.deepEqual({ from: repairMovements[0].fromLocationId, to: repairMovements[0].toLocationId, user: repairMovements[0].movedByUserId }, { from: home.id, to: repairLocation.id, user: userId }); assert.equal(repairMovements[0].movementDate.getTime(), started.startedAt!.getTime());
  await assert.rejects(() => confirmRepairTask(startTask.id, { epc: repairAsset.epc!.epcCode }, userId), /no longer pending/i);
  assert.equal(await prisma.assetMovement.count({ where: { assetId: repairAsset.id, movementType: 'REPAIR_TRANSFER' } }), 1);
  await assert.rejects(() => createIssueBatch({ assetIds: [repairAsset.id], jobNo: `REPAIR-BLOCK-${suffix}`, defaultRecipientUserId: userId, defaultToLocationId: operation.id }, userId), /not eligible/);

  const inUseBatch = await createIssueBatch({ assetIds: [inUseAsset.id], jobNo: `REPAIR-SWAP-${suffix}`, defaultRecipientUserId: userId, defaultToLocationId: operation.id }, userId); batchIds.push(inUseBatch.id);
  await confirmHandheldIssue(inUseBatch.id, { issueBatchId: inUseBatch.id, matched: [{ itemId: inUseBatch.items[0].id, assetId: inUseAsset.id, assignmentId: inUseBatch.items[0].assignment!.id, epc: inUseAsset.epc!.epcCode }] }, userId);
  await assert.rejects(() => prepareHandheldSwap({ issueBatchId: inUseBatch.id, targetItemId: inUseBatch.items[0].id, replacementAssetId: repairAsset.id }, userId), /no longer eligible/);

  const completeTask = await prepareCompleteRepair(started.id, userId);
  current = await prisma.asset.findUniqueOrThrow({ where: { id: repairAsset.id } }); assert.equal(current.status, 'UNDER_REPAIR'); assert.equal(current.locationId, repairLocation.id);
  assert.equal(await prisma.assetMovement.count({ where: { assetId: repairAsset.id, movementType: 'REPAIR_TRANSFER' } }), 1);
  const completed = await confirmRepairTask(completeTask.id, { epc: repairAsset.epc!.epcCode, completionRemarks: 'Passed inspection' }, userId);
  assert.equal(completed.status, 'COMPLETED'); assert.ok(completed.completedAt); assert.ok(completed.startedAt); assert.equal(completed.completedByUserId, userId); assert.equal(completed.completionRemarks, 'Passed inspection'); assert.equal(completed.durationMs, completed.completedAt!.getTime() - completed.startedAt!.getTime());
  current = await prisma.asset.findUniqueOrThrow({ where: { id: repairAsset.id } }); assert.equal(current.status, 'AVAILABLE'); assert.equal(current.locationId, home.id);
  repairMovements = await prisma.assetMovement.findMany({ where: { assetId: repairAsset.id, movementType: 'REPAIR_TRANSFER' }, orderBy: { movementDate: 'asc' } });
  assert.equal(repairMovements.length, 2); assert.deepEqual({ from: repairMovements[1].fromLocationId, to: repairMovements[1].toLocationId, user: repairMovements[1].movedByUserId }, { from: repairLocation.id, to: home.id, user: userId }); assert.equal(repairMovements[1].movementDate.getTime(), completed.completedAt!.getTime());
  await assert.rejects(() => confirmRepairTask(completeTask.id, { epc: repairAsset.epc!.epcCode }, userId), /no longer pending/i);
  assert.equal(await prisma.assetMovement.count({ where: { assetId: repairAsset.id, movementType: 'REPAIR_TRANSFER' } }), 2);
  assert.equal(await prisma.assetAssignment.count({ where: { assetId: repairAsset.id } }), 0); assert.equal(await prisma.issueBatchItem.count({ where: { assetId: repairAsset.id } }), 0);
  console.log(JSON.stringify({ passed: true, preparationNonMutating: true, issueBeforeStartAllowed: true, staleStartRejected: true, wrongEpcNonMutating: true, startRepair: true, startRepairMovement: true, duplicateStartMovementPrevented: true, underRepairIssueBlocked: true, underRepairSwapReplacementBlocked: true, completePreparationNonMutating: true, completeRepair: true, completeRepairMovement: true, duplicateCompleteMovementPrevented: true, durationFromTimestamps: true, pendingCancellationNonMutating: true, cancelledTaskCreatesNoMovement: true }, null, 2));
}
main().finally(async () => {
  try {
    if (repairIds.length) { await prisma.repairTask.deleteMany({ where: { repairId: { in: repairIds } } }); await prisma.assetRepair.deleteMany({ where: { id: { in: repairIds } } }); }
    if (assetIds.length) { await prisma.assetScanConfirmation.deleteMany({ where: { assetId: { in: assetIds } } }); await prisma.assetMovement.deleteMany({ where: { assetId: { in: assetIds } } }); await prisma.assetAssignment.deleteMany({ where: { assetId: { in: assetIds } } }); }
    if (batchIds.length) { await prisma.issueBatchItem.deleteMany({ where: { issueBatchId: { in: batchIds } } }); await prisma.issueBatch.deleteMany({ where: { id: { in: batchIds } } }); }
    if (assetIds.length) { await prisma.assetEpc.deleteMany({ where: { assetId: { in: assetIds } } }); await prisma.asset.deleteMany({ where: { id: { in: assetIds } } }); }
    if (categoryId) await prisma.assetCategory.delete({ where: { id: categoryId } }); if (userId) await prisma.user.delete({ where: { id: userId } }); if (locationIds.length) await prisma.location.deleteMany({ where: { id: { in: locationIds } } });
  } finally { await prisma.$disconnect(); }
}).catch(error => { console.error(error); process.exitCode = 1; });
