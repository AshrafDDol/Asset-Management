import { randomUUID } from 'node:crypto';
import { AssetRepairStatus, AssetStatus, EpcStatus, IssueBatchItemStatus, LocationType, MovementType, Prisma, RepairAction, RepairTaskStatus } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError } from '../../utils/AppError';
import { validateNewEpcCode } from '../asset-epcs/assetEpc.services';
import { loadLocationHierarchy, resolveLocationDepartment } from '../locations/locationHierarchy';
import { ConfirmRepairInput, PrepareStartRepairInput } from './repair.types';

const validId = (value: unknown, label: string) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new AppError(`${label} must be a valid ID`, 400);
  return parsed;
};
const text = (value: unknown, label: string, required = false) => {
  const result = String(value ?? '').trim();
  if (required && !result) throw new AppError(`${label} is required`, 400);
  if (result.length > 191) throw new AppError(`${label} must be at most 191 characters`, 400);
  return result || null;
};
const taskInclude = {
  repair: {
    include: {
      asset: { include: { epc: true, location: true, homeLocation: true, category: true } },
      repairLocation: { select: { id: true, locationCode: true, name: true, isActive: true } },
    },
  },
};
const repairInclude = {
  asset: { include: { epc: true, location: true, homeLocation: true, category: true } },
  repairLocation: { select: { id: true, locationCode: true, name: true, isActive: true } },
  startedBy: { select: { id: true, fullName: true } },
  completedBy: { select: { id: true, fullName: true } },
  tasks: { orderBy: { createdAt: 'desc' as const } },
};
const presentRepair = <T extends { startedAt: Date | null; completedAt: Date | null }>(repair: T) => ({
  ...repair,
  durationMs: repair.startedAt ? (repair.completedAt?.getTime() ?? Date.now()) - repair.startedAt.getTime() : null,
});

export async function listRepairs() {
  return (await prisma.assetRepair.findMany({ include: repairInclude, orderBy: { createdAt: 'desc' } })).map(presentRepair);
}
export async function getRepair(value: unknown) {
  const repair = await prisma.assetRepair.findUnique({ where: { id: validId(value, 'Repair') }, include: repairInclude });
  if (!repair) throw new AppError('Repair not found', 404);
  return presentRepair(repair);
}
export async function getPendingRepairTasks() {
  const tasks = await prisma.repairTask.findMany({ where: { status: RepairTaskStatus.PENDING }, include: taskInclude, orderBy: { createdAt: 'asc' } });
  return tasks.map(task => ({ ...task, repair: presentRepair(task.repair) }));
}
export async function getPendingRepairTask(value: unknown) {
  const task = await prisma.repairTask.findUnique({ where: { id: validId(value, 'Repair Task') }, include: taskInclude });
  if (!task) throw new AppError('Repair task not found', 404, 'STALE');
  if (task.status !== RepairTaskStatus.PENDING) throw new AppError('Repair task is no longer pending', 409, 'STALE');
  return { ...task, repair: presentRepair(task.repair) };
}

export async function prepareStartRepair(input: PrepareStartRepairInput, userId: number) {
  const assetId = validId(input.assetId, 'Asset');
  const repairLocationId = validId(input.repairLocationId, 'Repair Location');
  const reason = text(input.reason, 'Reason', true)!;
  const remarks = text(input.remarks, 'Remarks');
  return prisma.$transaction(async tx => {
    const asset = await tx.asset.findUnique({ where: { id: assetId }, include: { epc: true } });
    if (!asset || !asset.isActive) throw new AppError('Asset not found or inactive', 404);
    if (asset.status !== AssetStatus.AVAILABLE) throw new AppError(`Start Repair can only be prepared for an AVAILABLE Asset; current status is ${asset.status}`, 409);
    if (!asset.epc?.isActive || asset.epc.status !== EpcStatus.ACTIVE) throw new AppError('Asset requires an active EPC before Repair can be prepared', 409);
    const location = await tx.location.findUnique({ where: { id: repairLocationId }, select: { isActive: true, locationType: true } });
    if (!location?.isActive || location.locationType !== LocationType.REPAIR) throw new AppError('Select an active Repair Location', 400);
    const existing = await tx.assetRepair.findFirst({ where: { assetId, status: { in: [AssetRepairStatus.PREPARED, AssetRepairStatus.IN_PROGRESS] } } });
    if (existing) throw new AppError('Asset already has a prepared or in-progress Repair', 409);
    const repair = await tx.assetRepair.create({ data: { assetId, repairLocationId, reason, remarks }, select: { id: true } });
    return tx.repairTask.create({ data: { repairId: repair.id, action: RepairAction.START_REPAIR, createdByUserId: userId }, include: taskInclude });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function prepareCompleteRepair(repairValue: unknown, userId: number) {
  const repairId = validId(repairValue, 'Repair');
  return prisma.$transaction(async tx => {
    const repair = await tx.assetRepair.findUnique({ where: { id: repairId }, include: { asset: { include: { epc: true } }, tasks: { where: { status: RepairTaskStatus.PENDING } } } });
    if (!repair) throw new AppError('Repair not found', 404);
    if (repair.status !== AssetRepairStatus.IN_PROGRESS || repair.asset.status !== AssetStatus.UNDER_REPAIR) throw new AppError('Complete Repair can only be prepared for an in-progress UNDER_REPAIR Asset', 409);
    if (!repair.asset.isActive || !repair.asset.epc?.isActive || repair.asset.epc.status !== EpcStatus.ACTIVE) throw new AppError('Asset and EPC must remain active', 409);
    if (repair.tasks.length) throw new AppError('This Repair already has a pending action', 409);
    return tx.repairTask.create({ data: { repairId, action: RepairAction.COMPLETE_REPAIR, createdByUserId: userId }, include: taskInclude });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

async function assertNoLifecycleConflict(tx: Prisma.TransactionClient, assetId: number) {
  const [assignment, item, swap] = await Promise.all([
    tx.assetAssignment.findFirst({ where: { assetId, isActive: true }, select: { id: true } }),
    tx.issueBatchItem.findFirst({ where: { assetId, status: { in: [IssueBatchItemStatus.RESERVED, IssueBatchItemStatus.ISSUED, IssueBatchItemStatus.CONFIRMED] } }, select: { id: true } }),
    tx.handheldSwapTask.findFirst({ where: { replacementAssetId: assetId, status: 'PENDING' }, select: { id: true } }),
  ]);
  if (assignment || item || swap) throw new AppError('Asset has conflicting current lifecycle work. Repair task is stale.', 409, 'STALE');
}

export async function confirmRepairTask(taskValue: unknown, input: ConfirmRepairInput, userId: number) {
  const taskId = validId(taskValue, 'Repair Task');
  const epc = validateNewEpcCode(input.epc);
  const completionRemarks = text(input.completionRemarks, 'Completion Remarks');
  return prisma.$transaction(async tx => {
    const task = await tx.repairTask.findUnique({ where: { id: taskId }, include: taskInclude });
    if (!task || task.status !== RepairTaskStatus.PENDING) throw new AppError('Repair task is no longer pending', 409, 'STALE');
    const { repair } = task;
    const asset = repair.asset;
    if (!asset.isActive) throw new AppError('Asset is inactive. Repair task is stale.', 409, 'STALE');
    if (!asset.epc?.isActive || asset.epc.status !== EpcStatus.ACTIVE || asset.epc.epcCode.trim().toUpperCase() !== epc) throw new AppError('EPC is inactive or no longer matches the Repair Asset', 409, 'STALE');
    const now = new Date();
    if (task.action === RepairAction.START_REPAIR) {
      if (repair.status !== AssetRepairStatus.PREPARED || asset.status !== AssetStatus.AVAILABLE) throw new AppError(`Start Repair is stale; Asset status is ${asset.status}`, 409, 'STALE');
      await assertNoLifecycleConflict(tx, asset.id);
      const assetChanged = await tx.asset.updateMany({ where: { id: asset.id, isActive: true, status: AssetStatus.AVAILABLE }, data: { status: AssetStatus.UNDER_REPAIR, locationId: repair.repairLocationId } });
      const repairChanged = await tx.assetRepair.updateMany({ where: { id: repair.id, status: AssetRepairStatus.PREPARED }, data: { status: AssetRepairStatus.IN_PROGRESS, startedAt: now, startedByUserId: userId } });
      const taskChanged = await tx.repairTask.updateMany({ where: { id: task.id, status: RepairTaskStatus.PENDING }, data: { status: RepairTaskStatus.CONFIRMED, confirmedAt: now, confirmedByUserId: userId } });
      if (assetChanged.count !== 1 || repairChanged.count !== 1 || taskChanged.count !== 1) throw new AppError('Repair conflicted with another action. Refresh the queue.', 409, 'CONFLICT');
      const hierarchy = await loadLocationHierarchy(tx);
      const fromDepartment = resolveLocationDepartment(asset.locationId, hierarchy);
      const toDepartment = resolveLocationDepartment(repair.repairLocationId, hierarchy);
      await tx.assetMovement.create({ data: { movementNo: `MOV-${randomUUID()}`, assetId: asset.id, fromDepartmentId: fromDepartment?.id ?? null, toDepartmentId: toDepartment?.id ?? null, fromLocationId: asset.locationId, toLocationId: repair.repairLocationId, movedByUserId: userId, movementType: MovementType.REPAIR_TRANSFER, movementDate: now, reason: 'REPAIR START CONFIRMED', remarks: `Repair ID ${repair.id}` } });
    } else {
      if (repair.status !== AssetRepairStatus.IN_PROGRESS || asset.status !== AssetStatus.UNDER_REPAIR) throw new AppError(`Complete Repair is stale; Asset status is ${asset.status}`, 409, 'STALE');
      if (!asset.homeLocation?.isActive) throw new AppError('Asset home location is unresolved or inactive', 409, 'STALE');
      const assetChanged = await tx.asset.updateMany({ where: { id: asset.id, isActive: true, status: AssetStatus.UNDER_REPAIR }, data: { status: AssetStatus.AVAILABLE, locationId: asset.homeLocationId } });
      const repairChanged = await tx.assetRepair.updateMany({ where: { id: repair.id, status: AssetRepairStatus.IN_PROGRESS }, data: { status: AssetRepairStatus.COMPLETED, completedAt: now, completedByUserId: userId, completionRemarks } });
      const taskChanged = await tx.repairTask.updateMany({ where: { id: task.id, status: RepairTaskStatus.PENDING }, data: { status: RepairTaskStatus.CONFIRMED, confirmedAt: now, confirmedByUserId: userId } });
      if (assetChanged.count !== 1 || repairChanged.count !== 1 || taskChanged.count !== 1) throw new AppError('Repair completion conflicted with another action. Refresh the queue.', 409, 'CONFLICT');
      const hierarchy = await loadLocationHierarchy(tx);
      const fromDepartment = resolveLocationDepartment(asset.locationId, hierarchy);
      const toDepartment = resolveLocationDepartment(asset.homeLocationId, hierarchy);
      await tx.assetMovement.create({ data: { movementNo: `MOV-${randomUUID()}`, assetId: asset.id, fromDepartmentId: fromDepartment?.id ?? null, toDepartmentId: toDepartment?.id ?? null, fromLocationId: asset.locationId, toLocationId: asset.homeLocationId, movedByUserId: userId, movementType: MovementType.REPAIR_TRANSFER, movementDate: now, reason: 'REPAIR COMPLETION CONFIRMED', remarks: `Repair ID ${repair.id}` } });
    }
    const result = await tx.assetRepair.findUniqueOrThrow({ where: { id: repair.id }, include: repairInclude });
    return presentRepair(result);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function cancelRepairTask(taskValue: unknown, userId: number) {
  const taskId = validId(taskValue, 'Repair Task');
  return prisma.$transaction(async tx => {
    const task = await tx.repairTask.findUnique({ where: { id: taskId }, include: { repair: true } });
    if (!task) throw new AppError('Repair task not found', 404);
    if (task.status !== RepairTaskStatus.PENDING) throw new AppError('Only a pending Repair task can be cancelled', 409);
    const changed = await tx.repairTask.updateMany({ where: { id: taskId, status: RepairTaskStatus.PENDING }, data: { status: RepairTaskStatus.CANCELLED, cancelledAt: new Date(), cancelledByUserId: userId } });
    if (changed.count !== 1) throw new AppError('Repair task changed while it was being cancelled', 409, 'CONFLICT');
    if (task.action === RepairAction.START_REPAIR) await tx.assetRepair.updateMany({ where: { id: task.repairId, status: AssetRepairStatus.PREPARED }, data: { status: AssetRepairStatus.CANCELLED } });
    return { taskId, status: RepairTaskStatus.CANCELLED };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
