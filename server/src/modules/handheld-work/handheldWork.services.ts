import {
  AssetStatus,
  AssignmentStatus,
  ConfirmationSource,
  EpcStatus,
  HandheldSwapTaskStatus,
  IssueBatchItemStatus,
  IssueBatchStatus,
  Prisma,
} from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError } from '../../utils/AppError';
import { returnScannedAssetsAtomically, swapIssueBatchAsset } from '../issue-batches/issueBatch.services';
import { CancelSwapInput, ConfirmReturnsInput, ConfirmSwapInput, PrepareSwapInput, VerifySwapInput } from './handheldWork.types';

const normalize = (value: unknown) => String(value || '').trim().toUpperCase();
const validId = (value: unknown, label: string) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new AppError(`${label} must be a valid ID`, 400);
  return parsed;
};

const RETURN_ITEM_INCLUDE = {
  asset: { include: { epc: true, category: true, location: true, homeLocation: true } },
  recipient: { select: { id: true, username: true, fullName: true } },
  toLocation: { select: { id: true, locationCode: true, name: true } },
  assignment: true,
} satisfies Prisma.IssueBatchItemInclude;

export async function getWorkCounts() {
  const [processing, swap, returnGroups] = await Promise.all([
    prisma.issueBatch.count({ where: { status: { in: [IssueBatchStatus.PREPARING, IssueBatchStatus.PROCESSING] }, items: { some: { status: IssueBatchItemStatus.ISSUED, handheldSwapTasks: { none: { status: HandheldSwapTaskStatus.PENDING } } } } } }),
    prisma.handheldSwapTask.count({ where: { status: HandheldSwapTaskStatus.PENDING } }),
    prisma.issueBatch.findMany({ where: { items: { some: { status: IssueBatchItemStatus.CONFIRMED, asset: { status: AssetStatus.IN_USE }, handheldSwapTasks: { none: { status: HandheldSwapTaskStatus.PENDING } } } } }, select: { id: true } }),
  ]);
  return { processing, swap, return: returnGroups.length };
}

export async function getPendingReturns() {
  const batches = await prisma.issueBatch.findMany({
    where: { items: { some: { status: IssueBatchItemStatus.CONFIRMED, asset: { status: AssetStatus.IN_USE }, handheldSwapTasks: { none: { status: HandheldSwapTaskStatus.PENDING } } } } },
    select: {
      id: true, batchNo: true, jobNo: true,
      defaultRecipient: { select: { id: true, username: true, fullName: true } },
      items: { where: { status: IssueBatchItemStatus.CONFIRMED, asset: { status: AssetStatus.IN_USE }, handheldSwapTasks: { none: { status: HandheldSwapTaskStatus.PENDING } } }, include: RETURN_ITEM_INCLUDE, orderBy: { id: 'asc' } },
    },
    orderBy: { createdAt: 'asc' },
  });
  return batches.map((batch) => ({ ...batch, pendingAssetCount: batch.items.length }));
}

export async function confirmHandheldReturns(input: ConfirmReturnsInput, userId: number) {
  if (!Array.isArray(input.items) || input.items.length < 1) throw new AppError('Scan at least one Asset to return', 400);
  const issueBatchId = input.issueBatchId === undefined ? undefined : validId(input.issueBatchId, 'Issue Batch');
  return returnScannedAssetsAtomically({ items: input.items, remarks: input.remarks, issueBatchId }, userId, ConfirmationSource.HANDHELD);
}

export async function prepareHandheldSwap(input: PrepareSwapInput, userId: number) {
  const issueBatchId = validId(input.issueBatchId, 'Issue Batch');
  const targetItemId = validId(input.targetItemId, 'Target Item');
  const replacementAssetId = validId(input.replacementAssetId, 'Replacement Asset');
  return prisma.$transaction(async (tx) => {
    const batch = await tx.issueBatch.findUnique({ where: { id: issueBatchId } });
    const activeBatchStatuses: IssueBatchStatus[] = [IssueBatchStatus.PREPARING, IssueBatchStatus.PROCESSING];
    if (!batch || !activeBatchStatuses.includes(batch.status)) throw new AppError('Only an active Job can accept a Swap', 409);
    const target = await tx.issueBatchItem.findUnique({ where: { id: targetItemId }, include: { asset: { include: { epc: true } }, assignment: true, replacementItem: true } });
    if (!target || target.issueBatchId !== issueBatchId) throw new AppError('Selected Asset does not belong to this Job', 409);
    if (target.replacementItem || target.status !== IssueBatchItemStatus.CONFIRMED || target.asset.status !== AssetStatus.IN_USE || !target.assignment?.isActive || target.assignment.status !== AssignmentStatus.ACTIVE) throw new AppError('Handheld Swap requires an IN_USE Asset with an active confirmed assignment', 409, 'STALE');
    if (!target.asset.epc?.isActive || target.asset.epc.status !== EpcStatus.ACTIVE) throw new AppError('Existing Asset requires an active EPC', 409);
    const oldVerifiedEpc = normalize(input.oldVerifiedEpc);
    if (oldVerifiedEpc && oldVerifiedEpc !== normalize(target.asset.epc.epcCode)) throw new AppError(`EPC does not match ${target.asset.assetCode}`, 409, 'VALIDATION_FAILED');
    const replacement = await tx.asset.findUnique({ where: { id: replacementAssetId }, include: { epc: true, homeLocation: true } });
    if (!replacement || !replacement.isActive || replacement.status !== AssetStatus.AVAILABLE || !replacement.epc?.isActive || replacement.epc.status !== EpcStatus.ACTIVE || !replacement.homeLocation?.isActive) throw new AppError('Replacement Asset is no longer eligible', 409);
    if (replacement.id === target.assetId) throw new AppError('Replacement Asset must differ from the existing Asset', 400);
    const conflict = await tx.handheldSwapTask.findFirst({ where: { status: HandheldSwapTaskStatus.PENDING, OR: [{ targetItemId }, { replacementAssetId }] } });
    if (conflict) throw new AppError('The existing or replacement Asset already has pending Swap work', 409);
    return tx.handheldSwapTask.create({
      data: {
        issueBatchId,
        targetItemId,
        replacementAssetId,
        createdByUserId: userId,
        remarks: input.remarks?.trim() || null,
        oldVerifiedEpc: oldVerifiedEpc || null,
        oldVerifiedAt: oldVerifiedEpc ? new Date() : null,
        oldVerifiedSource: oldVerifiedEpc ? ConfirmationSource.WEB_ADMIN : null,
      },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

const SWAP_INCLUDE = {
  issueBatch: { select: { id: true, batchNo: true, jobNo: true } },
  targetItem: { include: { asset: { include: { epc: true, category: true } }, recipient: true, toLocation: true, assignment: true, replacementItem: { select: { id: true } } } },
  replacementAsset: { include: { epc: true, category: true, location: true, homeLocation: true } },
} satisfies Prisma.HandheldSwapTaskInclude;

export async function getPendingSwaps() {
  return prisma.handheldSwapTask.findMany({ where: { status: HandheldSwapTaskStatus.PENDING }, include: SWAP_INCLUDE, orderBy: { createdAt: 'asc' } });
}

export async function getPendingSwap(taskId: number) {
  const task = await prisma.handheldSwapTask.findUnique({ where: { id: validId(taskId, 'Swap Task') }, include: SWAP_INCLUDE });
  if (!task || task.status !== HandheldSwapTaskStatus.PENDING) throw new AppError('Swap task is no longer pending', 409, 'STALE');
  const targetPending = task.targetItem.status === IssueBatchItemStatus.ISSUED && task.targetItem.asset.status === AssetStatus.PENDING_CONFIRMATION;
  const targetInUse = task.targetItem.status === IssueBatchItemStatus.CONFIRMED && task.targetItem.asset.status === AssetStatus.IN_USE;
  if ((!targetPending && !targetInUse) || task.targetItem.replacementItem || !task.targetItem.assignment?.isActive || task.targetItem.assignment.status !== AssignmentStatus.ACTIVE) {
    throw new AppError('Swap task is stale because the existing Asset or assignment has changed. Ask an administrator to cancel this Handheld Swap.', 409, 'STALE');
  }
  if (!task.replacementAsset.isActive || task.replacementAsset.status !== AssetStatus.AVAILABLE) {
    throw new AppError('Swap task is stale because the replacement Asset is no longer available. Ask an administrator to cancel this Handheld Swap.', 409, 'STALE');
  }
  return task;
}

export async function verifyHandheldSwapEpc(taskId: number, input: VerifySwapInput) {
  const id = validId(taskId, 'Swap Task');
  const epc = normalize(input.epc);
  if (input.step !== 'OLD' && input.step !== 'REPLACEMENT') throw new AppError('Swap verification step is invalid', 400);
  if (input.source !== ConfirmationSource.WEB_ADMIN && input.source !== ConfirmationSource.HANDHELD) throw new AppError('Swap verification source is invalid', 400);
  if (!epc) throw new AppError('EPC is required', 400);

  return prisma.$transaction(async (tx) => {
    const task = await tx.handheldSwapTask.findUnique({ where: { id }, include: SWAP_INCLUDE });
    if (!task) throw new AppError('Swap task not found', 404, 'STALE');
    if (task.status !== HandheldSwapTaskStatus.PENDING) throw new AppError('Swap task is no longer pending', 409, 'STALE');
    const sourceIsCurrent = task.targetItem.status === IssueBatchItemStatus.CONFIRMED
      && task.targetItem.asset.status === AssetStatus.IN_USE
      && !task.targetItem.replacementItem
      && !!task.targetItem.assignment?.isActive
      && task.targetItem.assignment.status === AssignmentStatus.ACTIVE;
    if (!sourceIsCurrent) throw new AppError('Swap task is stale because the existing Asset or assignment has changed. Refresh the work queue.', 409, 'STALE');
    if (!task.replacementAsset.isActive || task.replacementAsset.status !== AssetStatus.AVAILABLE) throw new AppError('Swap task is stale because the replacement Asset is no longer available. Refresh the work queue.', 409, 'STALE');

    const oldEpc = normalize(task.targetItem.asset.epc?.epcCode);
    const newEpc = normalize(task.replacementAsset.epc?.epcCode);
    if (!task.targetItem.asset.epc?.isActive || task.targetItem.asset.epc.status !== EpcStatus.ACTIVE || !oldEpc) throw new AppError('Existing Asset EPC is inactive', 409, 'VALIDATION_FAILED');
    if (!task.replacementAsset.epc?.isActive || task.replacementAsset.epc.status !== EpcStatus.ACTIVE || !newEpc) throw new AppError('Replacement Asset EPC is inactive', 409, 'VALIDATION_FAILED');
    const expectedEpc = input.step === 'OLD' ? oldEpc : newEpc;
    if (epc !== expectedEpc) throw new AppError(input.step === 'OLD' ? 'Scanned EPC does not match the existing Asset' : 'Scanned EPC does not match the replacement Asset', 409, 'VALIDATION_FAILED');
    if (input.step === 'REPLACEMENT' && normalize(task.oldVerifiedEpc) !== oldEpc) throw new AppError('Verify the existing Asset EPC before the replacement Asset', 409, 'VALIDATION_FAILED');

    const data = input.step === 'OLD'
      ? { oldVerifiedEpc: epc, oldVerifiedAt: new Date(), oldVerifiedSource: input.source }
      : { newVerifiedEpc: epc, newVerifiedAt: new Date(), newVerifiedSource: input.source };
    const updated = await tx.handheldSwapTask.updateMany({ where: { id, status: HandheldSwapTaskStatus.PENDING }, data });
    if (updated.count !== 1) throw new AppError('Swap task changed during EPC verification. Refresh the work queue.', 409, 'CONFLICT');
    return tx.handheldSwapTask.findUniqueOrThrow({ where: { id }, include: SWAP_INCLUDE });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function cancelHandheldSwap(taskId: number, input: CancelSwapInput, userId: number) {
  const reason = input.reason?.trim() || 'Cancelled by administrator';
  if (reason.length > 191) throw new AppError('Cancellation reason must be at most 191 characters', 400);
  return prisma.$transaction(async (tx) => {
    const task = await tx.handheldSwapTask.findUnique({ where: { id: validId(taskId, 'Swap Task') }, select: { id: true, status: true } });
    if (!task) throw new AppError('Swap task not found', 404);
    if (task.status !== HandheldSwapTaskStatus.PENDING) throw new AppError('Only a pending Handheld Swap can be cancelled', 409);
    const result = await tx.handheldSwapTask.updateMany({
      where: { id: task.id, status: HandheldSwapTaskStatus.PENDING },
      data: { status: HandheldSwapTaskStatus.CANCELLED, cancelledByUserId: userId, cancelledAt: new Date(), cancellationReason: reason },
    });
    if (result.count !== 1) throw new AppError('Swap task changed while it was being cancelled', 409);
    return { success: true, status: 'CANCELLED' as const, taskId: task.id, message: 'Handheld Swap cancelled' };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

const SWAP_PROOF_INCLUDE = {
  issueBatch: { select: { id: true, status: true } },
  replacementAsset: { include: { epc: true } },
  targetItem: {
    include: {
      asset: { include: { epc: true } },
      assignment: true,
      movements: true,
      scanConfirmations: true,
      replacementItem: { include: { asset: { include: { epc: true } }, assignment: true, movements: true, scanConfirmations: true } },
    },
  },
} satisfies Prisma.HandheldSwapTaskInclude;

function completedSwapIsProven(task: Prisma.HandheldSwapTaskGetPayload<{ include: typeof SWAP_PROOF_INCLUDE }>, oldEpc: string, newEpc: string) {
  if (task.status !== HandheldSwapTaskStatus.CONFIRMED) return false;
  if (!task.targetItem.asset.epc?.isActive || task.targetItem.asset.epc.status !== EpcStatus.ACTIVE || normalize(task.targetItem.asset.epc.epcCode) !== oldEpc) return false;
  if (!task.replacementAsset.epc?.isActive || task.replacementAsset.epc.status !== EpcStatus.ACTIVE || normalize(task.replacementAsset.epc.epcCode) !== newEpc) return false;
  const replacement = task.targetItem.replacementItem;
  if (!replacement || replacement.issueBatchId !== task.issueBatchId || replacement.assetId !== task.replacementAssetId || replacement.replacementForItemId !== task.targetItemId) return false;
  if (replacement.status !== IssueBatchItemStatus.CONFIRMED || replacement.asset.status !== AssetStatus.IN_USE || !replacement.assignment?.isActive || replacement.assignment.status !== AssignmentStatus.ACTIVE) return false;
  if (!replacement.movements.some((movement) => movement.reason?.startsWith('ISSUE CONFIRMED:'))) return false;
  if (!replacement.scanConfirmations.some((confirmation) => confirmation.confirmationType === 'ISSUE_CONFIRMATION' && normalize(confirmation.epc) === newEpc)) return false;
  const oldReturned = task.targetItem.status === IssueBatchItemStatus.RETURNED && task.targetItem.asset.status === AssetStatus.AVAILABLE && task.targetItem.assignment?.status === AssignmentStatus.RETURNED && !task.targetItem.assignment.isActive && task.targetItem.movements.some((movement) => movement.reason?.startsWith('SWAP RETURN:')) && task.targetItem.scanConfirmations.some((confirmation) => confirmation.confirmationType === 'RETURN_CONFIRMATION' && normalize(confirmation.epc) === oldEpc);
  const oldCancelled = task.targetItem.status === IssueBatchItemStatus.CANCELLED && task.targetItem.asset.status === AssetStatus.AVAILABLE && task.targetItem.assignment?.status === AssignmentStatus.CANCELLED && !task.targetItem.assignment.isActive;
  return oldReturned || oldCancelled;
}

async function getSwapProof(taskId: number) {
  return prisma.handheldSwapTask.findUnique({ where: { id: validId(taskId, 'Swap Task') }, include: SWAP_PROOF_INCLUDE });
}

export async function confirmHandheldSwap(taskId: number, input: ConfirmSwapInput, userId: number, conflictRetry = false) {
  const oldEpc = normalize(input.oldEpc);
  const newEpc = normalize(input.newEpc);
  if (!oldEpc || !newEpc) throw new AppError('Both existing and replacement EPC scans are required', 400);
  const proof = await getSwapProof(taskId);
  if (!proof) throw new AppError('Swap task not found', 404, 'STALE');
  if (proof.status === HandheldSwapTaskStatus.CANCELLED) throw new AppError('Handheld Swap was cancelled and cannot be confirmed. Refresh the work queue.', 409, 'STALE');
  if (proof.status === HandheldSwapTaskStatus.CONFIRMED) {
    if (!completedSwapIsProven(proof, oldEpc, newEpc)) throw new AppError('Completed Swap state does not match this confirmation request', 409, 'CONFLICT');
    return { success: true, status: 'ALREADY_CONFIRMED' as const, alreadyConfirmed: true, taskId: proof.id, issueBatchId: proof.issueBatchId, message: 'Swap was already confirmed' };
  }
  const task = await getPendingSwap(taskId);
  if (normalize(task.targetItem.asset.epc?.epcCode) !== oldEpc) throw new AppError('Existing Asset EPC no longer matches the Swap task', 409, 'VALIDATION_FAILED');
  if (normalize(task.replacementAsset.epc?.epcCode) !== newEpc) throw new AppError('Replacement Asset EPC no longer matches the Swap task', 409, 'VALIDATION_FAILED');
  if (!task.targetItem.asset.epc?.isActive || task.targetItem.asset.epc.status !== EpcStatus.ACTIVE) throw new AppError('Existing Asset EPC is inactive', 409, 'VALIDATION_FAILED');
  if (!task.replacementAsset.epc?.isActive || task.replacementAsset.epc.status !== EpcStatus.ACTIVE || task.replacementAsset.status !== AssetStatus.AVAILABLE) throw new AppError('Replacement Asset is no longer available', 409, 'STALE');
  if (!task.targetItem.assignment?.isActive || task.targetItem.assignment.status !== AssignmentStatus.ACTIVE) throw new AppError('Existing Asset no longer has the expected active assignment', 409, 'STALE');

  try {
    const batch = await swapIssueBatchAsset(task.issueBatchId, {
      targetItemId: task.targetItemId,
      replacementAssetId: task.replacementAssetId,
      epc: oldEpc,
      newEpc,
      remarks: task.remarks || undefined,
    }, userId, ConfirmationSource.HANDHELD, task.id);
    return { success: true, status: 'CONFIRMED' as const, alreadyConfirmed: false, taskId: task.id, issueBatchId: batch.id, message: 'Swap confirmed successfully' };
  } catch (error) {
    if (error instanceof AppError && /Swap conflicted with another operation/.test(error.message) && !conflictRetry) return confirmHandheldSwap(taskId, input, userId, true);
    const completed = await getSwapProof(taskId);
    if (completed && completedSwapIsProven(completed, oldEpc, newEpc)) return { success: true, status: 'ALREADY_CONFIRMED' as const, alreadyConfirmed: true, taskId: completed.id, issueBatchId: completed.issueBatchId, message: 'Swap was already confirmed' };
    if (error instanceof AppError) throw error;
    throw new AppError('Swap confirmation conflicted with another operation. Refresh the work queue.', 409, 'CONFLICT');
  }
}
