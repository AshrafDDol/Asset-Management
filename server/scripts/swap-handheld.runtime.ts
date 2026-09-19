import assert from "node:assert/strict";
import { prisma } from "../src/config/prisma";
import { createAsset } from "../src/modules/assets/asset.service";
import { confirmHandheldSwap, prepareHandheldSwap, cancelHandheldSwap, getPendingSwap, verifyHandheldSwapEpc } from "../src/modules/handheld-work/handheldWork.services";
import { confirmHandheldIssue, createIssueBatch } from "../src/modules/issue-batches/issueBatch.services";

const suffix = Date.now().toString();
const assetIds: number[] = []; const batchIds: number[] = []; const locationIds: number[] = []; const taskIds: number[] = [];
let categoryId = 0; let userId = 0;

async function main() {
  const role = await prisma.role.findFirstOrThrow({ where: { isActive: true } });
  const user = await prisma.user.create({ data: { username: `swap-proof-${suffix}`, fullName: "Swap Proof Runtime", email: `swap-proof-${suffix}@example.test`, passwordHash: "runtime-only", roleId: role.id } }); userId = user.id;
  const category = await prisma.assetCategory.create({ data: { categoryCode: `SH${suffix.slice(-8)}`, name: `Swap Proof ${suffix}` } }); categoryId = category.id;
  const home = await prisma.location.create({ data: { locationCode: `SHH${suffix.slice(-7)}`, name: "Swap Home", locationType: "STORAGE" } }); locationIds.push(home.id);
  const operation = await prisma.location.create({ data: { locationCode: `SHO${suffix.slice(-7)}`, name: "Swap Operation", locationType: "OPERATION" } }); locationIds.push(operation.id);
  const assets: Awaited<ReturnType<typeof createAsset>>[] = [];
  for (let index = 0; index < 10; index += 1) { const asset = await createAsset({ assetCode: `SH-${suffix}-${index}`, itemName: `Swap ${index}`, categoryId, locationId: home.id, autoGenerateEpc: true }); assets.push(asset); assetIds.push(asset.id); }
  const makeTask = async (sourceIndex: number, replacementIndex: number, label: string, verifyOldBeforeCreate = false) => {
    const source = assets[sourceIndex]; const replacement = assets[replacementIndex];
    const batch = await createIssueBatch({ assetIds: [source.id], jobNo: `${label}-${suffix}`, defaultRecipientUserId: user.id, defaultToLocationId: operation.id }, user.id); batchIds.push(batch.id);
    await confirmHandheldIssue(batch.id, { issueBatchId: batch.id, matched: [{ itemId: batch.items[0].id, assetId: source.id, assignmentId: batch.items[0].assignment!.id, epc: source.epc!.epcCode }] }, user.id);
    const task = await prepareHandheldSwap({ issueBatchId: batch.id, targetItemId: batch.items[0].id, replacementAssetId: replacement.id, oldVerifiedEpc: verifyOldBeforeCreate ? source.epc!.epcCode : undefined }, user.id); taskIds.push(task.id);
    return { source, replacement, batch, task, input: { oldEpc: source.epc!.epcCode, newEpc: replacement.epc!.epcCode } };
  };

  const normal = await makeTask(0, 1, "NORMAL");
  const beforeVerification = {
    items: await prisma.issueBatchItem.count({ where: { issueBatchId: normal.batch.id } }),
    movements: await prisma.assetMovement.count({ where: { assetId: { in: [normal.source.id, normal.replacement.id] } } }),
    confirmations: await prisma.assetScanConfirmation.count({ where: { assetId: { in: [normal.source.id, normal.replacement.id] } } }),
  };
  await verifyHandheldSwapEpc(normal.task.id, { step: "OLD", epc: normal.input.oldEpc, source: "WEB_ADMIN" });
  const sharedAfterWeb = await getPendingSwap(normal.task.id);
  assert.equal(sharedAfterWeb.oldVerifiedSource, "WEB_ADMIN");
  assert.equal(sharedAfterWeb.oldVerifiedEpc, normal.input.oldEpc);
  await verifyHandheldSwapEpc(normal.task.id, { step: "REPLACEMENT", epc: normal.input.newEpc, source: "HANDHELD" });
  const sharedAfterHandheld = await getPendingSwap(normal.task.id);
  assert.equal(sharedAfterHandheld.newVerifiedSource, "HANDHELD");
  assert.equal(sharedAfterHandheld.newVerifiedEpc, normal.input.newEpc);
  assert.equal(sharedAfterHandheld.status, "PENDING");
  assert.equal(await prisma.issueBatchItem.count({ where: { issueBatchId: normal.batch.id } }), beforeVerification.items);
  assert.equal(await prisma.assetMovement.count({ where: { assetId: { in: [normal.source.id, normal.replacement.id] } } }), beforeVerification.movements);
  assert.equal(await prisma.assetScanConfirmation.count({ where: { assetId: { in: [normal.source.id, normal.replacement.id] } } }), beforeVerification.confirmations);
  const first = await confirmHandheldSwap(normal.task.id, normal.input, user.id); assert.equal(first.status, "CONFIRMED"); assert.equal(first.alreadyConfirmed, false);
  const retry = await confirmHandheldSwap(normal.task.id, normal.input, user.id); assert.equal(retry.status, "ALREADY_CONFIRMED"); assert.equal(retry.alreadyConfirmed, true);
  const replacementItem = await prisma.issueBatchItem.findUniqueOrThrow({ where: { replacementForItemId: normal.batch.items[0].id } });
  assert.equal(await prisma.issueBatchItem.count({ where: { replacementForItemId: normal.batch.items[0].id } }), 1);
  assert.equal(await prisma.assetAssignment.count({ where: { issueBatchItemId: replacementItem.id } }), 1);
  assert.equal(await prisma.assetMovement.count({ where: { issueBatchItemId: normal.batch.items[0].id } }), 2);
  assert.equal(await prisma.assetMovement.count({ where: { issueBatchItemId: replacementItem.id } }), 1);
  assert.equal(await prisma.assetScanConfirmation.count({ where: { issueBatchItemId: normal.batch.items[0].id } }), 2);
  assert.equal(await prisma.assetScanConfirmation.count({ where: { issueBatchItemId: replacementItem.id } }), 1);

  const race = await makeTask(2, 3, "RACE");
  const raceSettled = await Promise.allSettled([confirmHandheldSwap(race.task.id, race.input, user.id), confirmHandheldSwap(race.task.id, race.input, user.id)]);
  const raceSuccesses = raceSettled.filter((result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof confirmHandheldSwap>>> => result.status === "fulfilled").map((result) => result.value.status);
  const raceConflicts = raceSettled.filter((result) => result.status === "rejected");
  assert.equal(raceSuccesses.filter((status) => status === "CONFIRMED").length, 1);
  assert.ok(raceSuccesses.includes("ALREADY_CONFIRMED") || raceConflicts.length === 1);
  if (raceConflicts.length) {
    const authoritativeRetry = await confirmHandheldSwap(race.task.id, race.input, user.id);
    assert.equal(authoritativeRetry.status, "ALREADY_CONFIRMED");
  }
  const raceReplacement = await prisma.issueBatchItem.findUniqueOrThrow({ where: { replacementForItemId: race.batch.items[0].id } });
  assert.equal(await prisma.issueBatchItem.count({ where: { replacementForItemId: race.batch.items[0].id } }), 1);
  assert.equal(await prisma.assetAssignment.count({ where: { issueBatchItemId: raceReplacement.id } }), 1);
  assert.equal(await prisma.assetMovement.count({ where: { issueBatchItemId: race.batch.items[0].id } }), 2);
  assert.equal(await prisma.assetMovement.count({ where: { issueBatchItemId: raceReplacement.id } }), 1);

  const cancelled = await makeTask(4, 5, "CANCELLED", true);
  assert.equal(cancelled.task.oldVerifiedEpc, cancelled.input.oldEpc);
  assert.equal(cancelled.task.oldVerifiedSource, "WEB_ADMIN");
  await cancelHandheldSwap(cancelled.task.id, { reason: "Runtime cancellation" }, user.id);
  await assert.rejects(() => confirmHandheldSwap(cancelled.task.id, cancelled.input, user.id), (error: unknown) => error instanceof Error && /cancelled/.test(error.message));
  await assert.rejects(() => cancelHandheldSwap(normal.task.id, {}, user.id), (error: unknown) => error instanceof Error && /Only a pending/.test(error.message));

  const stale = await makeTask(6, 7, "STALE");
  await prisma.assetAssignment.update({ where: { issueBatchItemId: stale.batch.items[0].id }, data: { isActive: false, status: "CANCELLED" } });
  await assert.rejects(() => confirmHandheldSwap(stale.task.id, stale.input, user.id), (error: unknown) => error instanceof Error && /assignment/.test(error.message));
  assert.equal(await prisma.issueBatchItem.count({ where: { replacementForItemId: stale.batch.items[0].id } }), 0);

  const consumed = await makeTask(8, 9, "CONSUMED");
  await prisma.asset.update({ where: { id: consumed.replacement.id }, data: { status: "RESERVED" } });
  await assert.rejects(() => confirmHandheldSwap(consumed.task.id, consumed.input, user.id), (error: unknown) => error instanceof Error && /replacement Asset/.test(error.message));
  assert.equal(await prisma.issueBatchItem.count({ where: { replacementForItemId: consumed.batch.items[0].id } }), 0);
  console.log(JSON.stringify({ passed: true, sharedWebHandheldVerification: true, verificationDoesNotMutateLifecycle: true, normal: true, retryIdempotent: true, concurrentClients: true, replacementItemCount: 1, replacementAssignmentCount: 1, duplicateMovements: false, duplicateConfirmations: false, cancelledRejected: true, confirmedCancellationRejected: true, staleAssignmentRejected: true, consumedReplacementRejected: true }, null, 2));
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
