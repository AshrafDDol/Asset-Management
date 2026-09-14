import { randomUUID } from "crypto";
import {
  AssetStatus,
  AssignmentStatus,
  ConfirmationSource,
  ConfirmationType,
  EpcStatus,
  IssueBatchItemStatus,
  IssueBatchStatus,
  LocationType,
  MovementType,
  Prisma,
} from "@prisma/client";
import { prisma } from "../../config/prisma";
import { AppError } from "../../utils/AppError";
import { STORAGE_TYPES, validateHomeLocation } from "../assets/assetHome";
import { loadLocationHierarchy, resolveLocationDepartment } from "../locations/locationHierarchy";
import { CreateIssueBatchInput, HandheldIssueConfirmationInput, ReturnScanInput, ScanAllJobsInput, ScanComparisonInput, SwapIssueBatchAssetInput } from "./issueBatch.types";

const OPERATION_LOCATION_TYPES: LocationType[] = [LocationType.PRODUCTION_AREA, LocationType.MACHINE_LOCATION];
const ACTIVE_ITEM_STATUSES: IssueBatchItemStatus[] = [IssueBatchItemStatus.RESERVED, IssueBatchItemStatus.ISSUED, IssueBatchItemStatus.CONFIRMED];
const ACTIVE_BATCH_STATUSES: IssueBatchStatus[] = [IssueBatchStatus.PREPARING, IssueBatchStatus.PROCESSING];

const BATCH_INCLUDE = {
  defaultRecipient: { select: { id: true, username: true, fullName: true } },
  defaultToLocation: { select: { id: true, locationCode: true, name: true, locationType: true } },
  createdBy: { select: { id: true, username: true, fullName: true } },
  items: {
    include: {
      asset: { include: { category: true, location: true, homeLocation: true, epc: true } },
      recipient: { select: { id: true, username: true, fullName: true } },
      toLocation: true,
      assignment: true,
      handheldSwapTasks: { where: { status: "PENDING" }, select: { id: true, status: true, replacementAssetId: true, oldVerifiedEpc: true, newVerifiedEpc: true } },
    },
    orderBy: { id: "asc" as const },
  },
} satisfies Prisma.IssueBatchInclude;

function id(value: unknown, name: string) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new AppError(`${name} must be a valid ID`, 400);
  return parsed;
}

function short(value: string | null | undefined, name: string) {
  const result = value?.trim() || null;
  if (result && result.length > 191) throw new AppError(`${name} must be at most 191 characters`, 400);
  return result;
}

function requiredShort(value: string | null | undefined, name: string) {
  const result = short(value, name);
  if (!result) throw new AppError(`${name} is required.`, 400);
  return result;
}

async function activeUser(tx: Prisma.TransactionClient, userId: number, name = "Recipient") {
  const user = await tx.user.findUnique({ where: { id: id(userId, name) } });
  if (!user?.isActive) throw new AppError(`${name} is invalid or inactive`, 400);
  return user;
}

async function operationalLocation(tx: Prisma.TransactionClient, locationId: number) {
  const location = await tx.location.findUnique({ where: { id: id(locationId, "To Location") } });
  if (!location?.isActive || !OPERATION_LOCATION_TYPES.includes(location.locationType)) {
    throw new AppError("To Location must be an active Production Area or Machine Location", 400);
  }
  return location;
}

async function recalculateBatch(tx: Prisma.TransactionClient, batchId: number) {
  const batch = await tx.issueBatch.findUniqueOrThrow({ where: { id: batchId }, select: { status: true } });
  if (batch.status === IssueBatchStatus.COMPLETED) return batch.status;
  const items = await tx.issueBatchItem.findMany({ where: { issueBatchId: batchId }, select: { status: true } });
  const notStarted: IssueBatchItemStatus[] = [IssueBatchItemStatus.RESERVED, IssueBatchItemStatus.CANCELLED];
  const status = items.length > 0 && items.every((item) => item.status === IssueBatchItemStatus.CANCELLED)
    ? IssueBatchStatus.CANCELLED
    : items.some((item) => !notStarted.includes(item.status))
        ? IssueBatchStatus.PROCESSING
        : IssueBatchStatus.PREPARING;
  await tx.issueBatch.update({ where: { id: batchId }, data: { status } });
  return status;
}

async function eligibleAsset(tx: Prisma.TransactionClient, assetId: number) {
  const asset = await tx.asset.findUnique({ where: { id: assetId }, include: { epc: true, homeLocation: true } });
  if (!asset) throw new AppError(`Asset ${assetId} was not found`, 404);
  const reasons: string[] = [];
  if (!asset.isActive) reasons.push("inactive");
  if (asset.status !== AssetStatus.AVAILABLE) reasons.push(`status is ${asset.status}`);
  if (!asset.epc?.isActive || asset.epc.status !== EpcStatus.ACTIVE) reasons.push("active EPC is missing");
  if (!asset.homeLocation?.isActive) reasons.push("active home location is unresolved");
  if (reasons.length) throw new AppError(`${asset.assetCode} is not eligible: ${reasons.join(", ")}`, 409);
  await validateHomeLocation(tx, asset.homeLocationId);
  const activeItem = await tx.issueBatchItem.findFirst({ where: { assetId, status: { in: ACTIVE_ITEM_STATUSES } } });
  const activeAssignment = await tx.assetAssignment.findFirst({ where: { assetId, status: AssignmentStatus.ACTIVE, isActive: true } });
  if (activeItem || activeAssignment) throw new AppError(`${asset.assetCode} already has an operational claim`, 409);
  return asset;
}

export async function getIssueBatches() {
  return prisma.issueBatch.findMany({ include: BATCH_INCLUDE, orderBy: { createdAt: "desc" } });
}

export async function getIssueBatch(batchId: number) {
  const batch = await prisma.issueBatch.findUnique({ where: { id: id(batchId, "Batch") }, include: BATCH_INCLUDE });
  if (!batch) throw new AppError("Issue Batch not found", 404);
  return batch;
}

export async function getPendingHandheldIssues() {
  const batches = await prisma.issueBatch.findMany({
    where: {
      status: { in: ACTIVE_BATCH_STATUSES },
      items: { some: { status: IssueBatchItemStatus.ISSUED, handheldSwapTasks: { none: { status: "PENDING" } } } },
    },
    include: BATCH_INCLUDE,
    orderBy: { createdAt: "asc" },
  });

  return batches.map((batch) => ({
    id: batch.id,
    batchNo: batch.batchNo,
    jobNo: batch.jobNo,
    status: batch.status,
    recipient: batch.defaultRecipient,
    toLocation: batch.defaultToLocation,
    expectedAssetCount: batch.items.filter((item) => item.status === IssueBatchItemStatus.ISSUED && item.handheldSwapTasks.length === 0).length,
    confirmedAssetCount: batch.items.filter((item) => item.status === IssueBatchItemStatus.CONFIRMED).length,
    createdAt: batch.createdAt,
  }));
}

export async function getHandheldIssue(batchId: number) {
  const batch = await getIssueBatch(batchId);
  const expectedItems = batch.items
    .filter((item) => item.status === IssueBatchItemStatus.ISSUED && item.handheldSwapTasks.length === 0)
    .map((item) => ({
      itemId: item.id,
      assetId: item.assetId,
      assignmentId: item.assignment?.id ?? null,
      assetCode: item.asset.assetCode,
      itemName: item.asset.itemName,
      category: item.asset.category,
      measurementHeight: item.asset.measurementHeight,
      measurementWidth: item.asset.measurementWidth,
      currentLocation: item.asset.location,
      homeLocation: item.asset.homeLocation,
      epc: item.asset.epc?.isActive && item.asset.epc.status === EpcStatus.ACTIVE
        ? item.asset.epc.epcCode.trim().toUpperCase()
        : null,
      recipient: item.recipient,
      toLocation: item.toLocation,
      status: item.status,
    }));

  return {
    id: batch.id,
    batchNo: batch.batchNo,
    jobNo: batch.jobNo,
    status: batch.status,
    recipient: batch.defaultRecipient,
    toLocation: batch.defaultToLocation,
    expectedAssetCount: expectedItems.length,
    expectedItems,
  };
}

export async function createIssueBatch(input: CreateIssueBatchInput, userId: number) {
  const assetIds = [...new Set((input.assetIds || []).map((value) => id(value, "Asset")))];
  if (!assetIds.length) throw new AppError("Select at least one Asset", 400);
  if (assetIds.length !== input.assetIds.length) throw new AppError("Duplicate Assets are not allowed", 400);
  const jobNo = requiredShort(input.jobNo, "Job No.");
  try {
    return await prisma.$transaction(async (tx) => {
      await activeUser(tx, userId, "Authenticated user");
      const existingJob = await tx.issueBatch.findFirst({ where: { jobNo }, select: { id: true } });
      if (existingJob) throw new AppError(`Job No. "${jobNo}" already exists. Select the existing Job to add Assets.`, 409);
      if (input.defaultRecipientUserId) await activeUser(tx, input.defaultRecipientUserId);
      if (input.defaultToLocationId) await operationalLocation(tx, input.defaultToLocationId);
      const overrides = new Map((input.items || []).map((item) => [id(item.assetId, "Asset"), item]));
      if ([...overrides.keys()].some((assetId) => !assetIds.includes(assetId))) throw new AppError("An item override does not belong to the selected Assets", 400);
      for (const override of overrides.values()) {
        if (override.recipientUserId) await activeUser(tx, override.recipientUserId);
        if (override.toLocationId) await operationalLocation(tx, override.toLocationId);
      }
      for (const assetId of assetIds) {
        const override = overrides.get(assetId);
        if (!(override?.recipientUserId ?? input.defaultRecipientUserId)) throw new AppError("Every selected Asset requires a Recipient before preparation is confirmed", 400);
        if (!(override?.toLocationId ?? input.defaultToLocationId)) throw new AppError("Every selected Asset requires a To Location before preparation is confirmed", 400);
      }
      const assets = [];
      for (const assetId of assetIds) assets.push(await eligibleAsset(tx, assetId));
      const batch = await tx.issueBatch.create({
        data: {
          batchNo: `IB-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`,
          jobNo,
          defaultRecipientUserId: input.defaultRecipientUserId || null,
          defaultToLocationId: input.defaultToLocationId || null,
          remarks: short(input.remarks, "Remarks"),
          createdByUserId: userId,
        },
      });
      for (const asset of assets) {
        const claimed = await tx.asset.updateMany({ where: { id: asset.id, status: AssetStatus.AVAILABLE, isActive: true }, data: { status: AssetStatus.RESERVED } });
        if (claimed.count !== 1) throw new AppError(`${asset.assetCode} was concurrently claimed; no batch was created`, 409);
        const override = overrides.get(asset.id);
        await tx.issueBatchItem.create({ data: { issueBatchId: batch.id, assetId: asset.id, recipientUserId: override?.recipientUserId ?? input.defaultRecipientUserId ?? null, toLocationId: override?.toLocationId ?? input.defaultToLocationId ?? null, selectedByUserId: userId, remarks: short(override?.remarks, "Remarks") } });
      }
      const preparedItems = await tx.issueBatchItem.findMany({ where: { issueBatchId: batch.id }, select: { id: true } });
      for (const item of preparedItems) await issueOne(tx, item.id, userId);
      return tx.issueBatch.findUniqueOrThrow({ where: { id: batch.id }, include: BATCH_INCLUDE });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") throw new AppError("Batch reservation conflicted with another user; no Assets were reserved", 409);
    throw error;
  }
}

export async function addAssetsToIssueBatch(batchId: number, input: CreateIssueBatchInput, userId: number) {
  const assetIds = [...new Set((input.assetIds || []).map((value) => id(value, "Asset")))];
  if (!assetIds.length) throw new AppError("Select at least one Asset", 400);
  if (assetIds.length !== input.assetIds.length) throw new AppError("Duplicate Assets are not allowed", 400);
  const jobNo = requiredShort(input.jobNo, "Job No.");
  try {
    return await prisma.$transaction(async (tx) => {
      await activeUser(tx, userId, "Authenticated user");
      const batch = await tx.issueBatch.findUnique({ where: { id: id(batchId, "Batch") } });
      if (!batch) throw new AppError("Issue Batch not found", 404);
      if (!ACTIVE_BATCH_STATUSES.includes(batch.status)) throw new AppError(`Job No. "${batch.jobNo || jobNo}" is already ${batch.status.toLowerCase()}.`, 409);
      if (!batch.jobNo || batch.jobNo.trim().toLowerCase() !== jobNo.toLowerCase()) throw new AppError("Selected Issue Batch does not match the submitted Job No.", 409);
      const activeSameJob = await tx.issueBatch.findMany({ where: { jobNo: batch.jobNo, status: { in: [IssueBatchStatus.PREPARING, IssueBatchStatus.PROCESSING] } }, select: { id: true } });
      if (activeSameJob.length !== 1 || activeSameJob[0].id !== batch.id) throw new AppError(`Job No. "${batch.jobNo}" has multiple active Issue Batches and must be resolved before Assets can be added.`, 409);
      if (input.defaultRecipientUserId) await activeUser(tx, input.defaultRecipientUserId);
      if (input.defaultToLocationId) await operationalLocation(tx, input.defaultToLocationId);
      const overrides = new Map((input.items || []).map((item) => [id(item.assetId, "Asset"), item]));
      if ([...overrides.keys()].some((assetId) => !assetIds.includes(assetId))) throw new AppError("An item override does not belong to the selected Assets", 400);
      for (const override of overrides.values()) {
        if (override.recipientUserId) await activeUser(tx, override.recipientUserId);
        if (override.toLocationId) await operationalLocation(tx, override.toLocationId);
      }
      for (const assetId of assetIds) {
        const override = overrides.get(assetId);
        if (!(override?.recipientUserId ?? input.defaultRecipientUserId)) throw new AppError("Every selected Asset requires a Recipient before preparation is confirmed", 400);
        if (!(override?.toLocationId ?? input.defaultToLocationId)) throw new AppError("Every selected Asset requires a To Location before preparation is confirmed", 400);
      }
      const assets = [];
      for (const assetId of assetIds) assets.push(await eligibleAsset(tx, assetId));
      const newItemIds: number[] = [];
      for (const asset of assets) {
        const claimed = await tx.asset.updateMany({ where: { id: asset.id, status: AssetStatus.AVAILABLE, isActive: true }, data: { status: AssetStatus.RESERVED } });
        if (claimed.count !== 1) throw new AppError(`${asset.assetCode} was concurrently claimed; no Assets were added`, 409);
        const override = overrides.get(asset.id);
        const item = await tx.issueBatchItem.create({ data: { issueBatchId: batch.id, assetId: asset.id, recipientUserId: override?.recipientUserId ?? input.defaultRecipientUserId ?? null, toLocationId: override?.toLocationId ?? input.defaultToLocationId ?? null, selectedByUserId: userId, remarks: short(override?.remarks, "Remarks") || short(input.remarks, "Remarks") } });
        newItemIds.push(item.id);
      }
      for (const itemId of newItemIds) await issueOne(tx, itemId, userId);
      return tx.issueBatch.findUniqueOrThrow({ where: { id: batch.id }, include: BATCH_INCLUDE });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") throw new AppError("Adding Assets conflicted with another operation; no Assets were added", 409);
    throw error;
  }
}

export async function swapIssueBatchAsset(batchId: number, input: SwapIssueBatchAssetInput, userId: number, source: ConfirmationSource = ConfirmationSource.WEB_ADMIN, handheldTaskId?: number) {
  const replacementAssetId = id(input.replacementAssetId, "Replacement Asset");
  const targetItemId = id(input.targetItemId, "Target Item");
  try {
    return await prisma.$transaction(async (tx) => {
      await activeUser(tx, userId, "Authenticated user");
      const batch = await tx.issueBatch.findUnique({ where: { id: id(batchId, "Batch") } });
      if (!batch || !ACTIVE_BATCH_STATUSES.includes(batch.status)) throw new AppError("Only an active Job can accept a Swap", 409);
      if (handheldTaskId) {
        const task = await tx.handheldSwapTask.findUnique({ where: { id: handheldTaskId }, select: { status: true, issueBatchId: true, targetItemId: true, replacementAssetId: true } });
        if (!task || task.status !== "PENDING" || task.issueBatchId !== batch.id || task.targetItemId !== targetItemId || task.replacementAssetId !== replacementAssetId) throw new AppError("Handheld Swap task changed before confirmation", 409, "STALE");
      }
      const target = await tx.issueBatchItem.findUnique({
        where: { id: targetItemId },
        include: { asset: { include: { homeLocation: true } }, assignment: true, recipient: true, toLocation: true, replacementItem: true, handheldSwapTasks: { where: { status: "PENDING" }, select: { id: true } } },
      });
      if (!target || target.issueBatchId !== batch.id) throw new AppError("Selected Asset does not belong to this Job", 409);
      if (target.handheldSwapTasks.some((task) => task.id !== handheldTaskId)) throw new AppError("Selected Asset has pending Handheld Swap verification", 409);
      if (target.replacementItem) throw new AppError("This Job Asset has already been replaced", 409);
      const pending = target.status === IssueBatchItemStatus.ISSUED && target.asset.status === AssetStatus.PENDING_CONFIRMATION;
      const inUse = target.status === IssueBatchItemStatus.CONFIRMED && target.asset.status === AssetStatus.IN_USE;
      if (!pending && !inUse) throw new AppError("Selected Job Asset is no longer eligible for replacement", 409);
      if (!handheldTaskId && inUse) throw new AppError("An IN_USE Asset requires Handheld Swap verification", 409, "VALIDATION_FAILED");
      if (handheldTaskId && pending) throw new AppError("An Asset awaiting EPC confirmation must use Replace Selection, not Handheld Swap", 409, "VALIDATION_FAILED");
      if (!target.assignment?.isActive || target.assignment.status !== AssignmentStatus.ACTIVE) throw new AppError("Selected Job Asset has no active Assignment", 409);
      const recipientUserId = target.assignment.assignedToUserId || target.recipientUserId;
      const toLocationId = target.toLocationId || target.assignment.locationId;
      if (!recipientUserId || !toLocationId) throw new AppError("Selected Job Asset has incomplete preparation details", 409);
      await activeUser(tx, recipientUserId);
      await operationalLocation(tx, toLocationId);
      const replacement = await eligibleAsset(tx, replacementAssetId);
      if (replacement.id === target.assetId) throw new AppError("Replacement Asset must differ from the target Asset", 400);

      const now = new Date();
      if (pending) {
        const itemUpdate = await tx.issueBatchItem.updateMany({ where: { id: target.id, status: IssueBatchItemStatus.ISSUED }, data: { status: IssueBatchItemStatus.CANCELLED, cancelledAt: now } });
        const assetUpdate = await tx.asset.updateMany({ where: { id: target.assetId, status: AssetStatus.PENDING_CONFIRMATION }, data: { status: AssetStatus.AVAILABLE } });
        const assignmentUpdate = await tx.assetAssignment.updateMany({ where: { id: target.assignment.id, status: AssignmentStatus.ACTIVE, isActive: true }, data: { status: AssignmentStatus.CANCELLED, isActive: false } });
        if (itemUpdate.count !== 1 || assetUpdate.count !== 1 || assignmentUpdate.count !== 1) throw new AppError("Swap target changed concurrently", 409);
      } else {
        const epc = input.epc?.trim().toUpperCase();
        if (!epc) throw new AppError("EPC scan is required for an In Use Asset", 400);
        const mapping = await tx.assetEpc.findUnique({ where: { epcCode: epc } });
        if (!mapping?.isActive || mapping.status !== EpcStatus.ACTIVE || mapping.assetId !== target.assetId) throw new AppError("Scanned EPC does not match the selected Asset to replace", 409);
        if (!target.asset.homeLocationId || !target.asset.homeLocation?.isActive || !STORAGE_TYPES.includes(target.asset.homeLocation.locationType)) throw new AppError("Target Asset home location is unresolved", 409);
        const itemUpdate = await tx.issueBatchItem.updateMany({ where: { id: target.id, status: IssueBatchItemStatus.CONFIRMED }, data: { status: IssueBatchItemStatus.RETURNED } });
        const assetUpdate = await tx.asset.updateMany({ where: { id: target.assetId, status: AssetStatus.IN_USE }, data: { status: AssetStatus.AVAILABLE, locationId: target.asset.homeLocationId } });
        const assignmentUpdate = await tx.assetAssignment.updateMany({ where: { id: target.assignment.id, status: AssignmentStatus.ACTIVE, isActive: true, returnedAt: null }, data: { status: AssignmentStatus.RETURNED, isActive: false, returnedAt: now, returnCondition: target.asset.condition, returnLocationId: target.asset.homeLocationId, returnRemarks: short(input.remarks, "Remarks") || `SWAP RETURN: replaced by ${replacement.assetCode}`, returnedByUserId: userId } });
        if (itemUpdate.count !== 1 || assetUpdate.count !== 1 || assignmentUpdate.count !== 1) throw new AppError("Swap target changed concurrently", 409);
        const hierarchy = await loadLocationHierarchy(tx); const fromDepartment = resolveLocationDepartment(target.asset.locationId, hierarchy); const toDepartment = resolveLocationDepartment(target.asset.homeLocationId, hierarchy);
        await tx.assetMovement.create({ data: { movementNo: `MOV-${randomUUID()}`, assetId: target.assetId, issueBatchItemId: target.id, fromDepartmentId: fromDepartment?.id ?? null, toDepartmentId: toDepartment?.id ?? null, fromLocationId: target.asset.locationId, toLocationId: target.asset.homeLocationId, movedByUserId: userId, movementType: MovementType.LOCATION_TRANSFER, movementDate: now, reason: `SWAP RETURN: ${batch.batchNo}`, remarks: short(input.remarks, "Remarks") || `Replaced by ${replacement.assetCode}` } });
        await tx.assetScanConfirmation.create({ data: { assetId: target.assetId, issueBatchItemId: target.id, assignmentId: target.assignment.id, confirmationType: ConfirmationType.RETURN_CONFIRMATION, confirmationSource: source, epc, confirmedByUserId: userId, confirmedAt: now, remarks: short(input.remarks, "Remarks") || `SWAP RETURN: replaced by ${replacement.assetCode}` } });
      }

      const claimed = await tx.asset.updateMany({ where: { id: replacement.id, status: AssetStatus.AVAILABLE, isActive: true }, data: { status: AssetStatus.RESERVED } });
      if (claimed.count !== 1) throw new AppError(`${replacement.assetCode} was concurrently claimed; no Swap was completed`, 409);
      const replacementItem = await tx.issueBatchItem.create({ data: { issueBatchId: batch.id, assetId: replacement.id, recipientUserId, toLocationId, selectedByUserId: userId, replacementForItemId: target.id, remarks: short(input.remarks, "Remarks") || `SWAP: replacing ${target.asset.assetCode}` } });
      await issueOne(tx, replacementItem.id, userId);
      if (input.newEpc) {
        const newEpc = input.newEpc.trim().toUpperCase();
        if (!replacement.epc?.isActive || replacement.epc.status !== EpcStatus.ACTIVE || replacement.epc.epcCode.trim().toUpperCase() !== newEpc) throw new AppError("Scanned EPC does not match the replacement Asset", 409);
        await confirmIssue(tx, replacementItem.id, newEpc, userId, input.remarks, source);
      }
      if (handheldTaskId) {
        const taskUpdate = await tx.handheldSwapTask.updateMany({ where: { id: handheldTaskId, status: "PENDING" }, data: { status: "CONFIRMED", confirmedByUserId: userId, confirmedAt: new Date() } });
        if (taskUpdate.count !== 1) throw new AppError("Handheld Swap task changed during confirmation", 409, "CONFLICT");
      }
      return tx.issueBatch.findUniqueOrThrow({ where: { id: batch.id }, include: BATCH_INCLUDE });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") throw new AppError("Swap conflicted with another operation; refresh and retry", 409, "CONFLICT");
    throw error;
  }
}

export async function cancelIssueBatch(batchId: number) {
  return prisma.$transaction(async (tx) => {
    const batch = await tx.issueBatch.findUnique({ where: { id: id(batchId, "Batch") }, include: { items: { include: { asset: true, handheldSwapTasks: { where: { status: "PENDING" }, select: { id: true } } } } } });
    if (!batch) throw new AppError("Issue Batch not found", 404);
    if (batch.items.some((item) => item.handheldSwapTasks.length > 0)) throw new AppError("Cancel pending Handheld Swap work before cancelling this batch", 409);
    let cancelledCount = 0;
    const unconfirmedStatuses: IssueBatchItemStatus[] = [IssueBatchItemStatus.RESERVED, IssueBatchItemStatus.ISSUED];
    for (const item of batch.items.filter((candidate) => unconfirmedStatuses.includes(candidate.status))) {
      const expectedAssetStatus = item.status === IssueBatchItemStatus.RESERVED ? AssetStatus.RESERVED : AssetStatus.PENDING_CONFIRMATION;
      const assetUpdate = await tx.asset.updateMany({ where: { id: item.assetId, status: expectedAssetStatus }, data: { status: AssetStatus.AVAILABLE } });
      if (assetUpdate.count !== 1) throw new AppError(`${item.asset.assetCode} changed concurrently`, 409);
      await tx.issueBatchItem.update({ where: { id: item.id }, data: { status: IssueBatchItemStatus.CANCELLED, cancelledAt: new Date() } });
      await tx.assetAssignment.updateMany({ where: { issueBatchItemId: item.id, status: AssignmentStatus.ACTIVE, isActive: true }, data: { status: AssignmentStatus.CANCELLED, isActive: false } });
      cancelledCount += 1;
    }
    await recalculateBatch(tx, batch.id);
    const confirmedCount = await tx.issueBatchItem.count({ where: { issueBatchId: batch.id, status: { in: [IssueBatchItemStatus.CONFIRMED, IssueBatchItemStatus.RETURNED] } } });
    return { batch: await tx.issueBatch.findUniqueOrThrow({ where: { id: batch.id }, include: BATCH_INCLUDE }), cancelledCount, confirmedCount };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

async function issueOne(tx: Prisma.TransactionClient, itemId: number, issuedByUserId: number) {
  const item = await tx.issueBatchItem.findUnique({ where: { id: itemId }, include: { asset: true, recipient: true, toLocation: true, assignment: true } });
  if (!item) throw new AppError("Issue Batch Item not found", 404);
  if (item.status !== IssueBatchItemStatus.RESERVED || item.asset.status !== AssetStatus.RESERVED) throw new AppError(`${item.asset.assetCode} is not ready to issue`, 409);
  if (!item.recipientUserId || !item.recipient?.isActive) throw new AppError(`${item.asset.assetCode} requires an active Recipient`, 400);
  if (!item.toLocationId || !item.toLocation?.isActive || !OPERATION_LOCATION_TYPES.includes(item.toLocation.locationType)) throw new AppError(`${item.asset.assetCode} requires an active operational To Location`, 400);
  const assetUpdate = await tx.asset.updateMany({ where: { id: item.assetId, status: AssetStatus.RESERVED }, data: { status: AssetStatus.PENDING_CONFIRMATION } });
  const itemUpdate = await tx.issueBatchItem.updateMany({ where: { id: item.id, status: IssueBatchItemStatus.RESERVED }, data: { status: IssueBatchItemStatus.ISSUED } });
  if (assetUpdate.count !== 1 || itemUpdate.count !== 1) throw new AppError(`${item.asset.assetCode} changed concurrently`, 409);
  if (item.assignment) {
    await tx.assetAssignment.update({ where: { id: item.assignment.id }, data: { assignedToUserId: item.recipientUserId, assignedByUserId: issuedByUserId, locationId: item.toLocationId, issuedAt: new Date(), status: AssignmentStatus.ACTIVE, isActive: true, returnedAt: null } });
  } else {
    await tx.assetAssignment.create({ data: { assignmentNo: `ASG-${Date.now()}-${randomUUID().slice(0, 8)}`, assetId: item.assetId, assignedToUserId: item.recipientUserId, assignedByUserId: issuedByUserId, departmentId: item.toLocation.departmentId, locationId: item.toLocationId, issueBatchItemId: item.id, assignedDate: new Date(), issuedAt: new Date(), status: AssignmentStatus.ACTIVE, isActive: true, remarks: item.remarks } });
  }
  await recalculateBatch(tx, item.issueBatchId);
}

export async function cancelIssuedBatchItem(itemId: number) {
  return prisma.$transaction(async (tx) => {
    const item = await tx.issueBatchItem.findUnique({ where: { id: id(itemId, "Item") }, include: { asset: true, assignment: true, handheldSwapTasks: { where: { status: "PENDING" }, select: { id: true } } } });
    if (!item) throw new AppError("Issue Batch Item not found", 404);
    if (item.handheldSwapTasks.length > 0) throw new AppError("Asset has pending Handheld Swap work", 409);
    if (item.status !== IssueBatchItemStatus.ISSUED || item.asset.status !== AssetStatus.PENDING_CONFIRMATION || !item.assignment?.isActive) throw new AppError("Only an unconfirmed issued item can be recovered", 409);
    const itemUpdate = await tx.issueBatchItem.updateMany({ where: { id: item.id, status: IssueBatchItemStatus.ISSUED }, data: { status: IssueBatchItemStatus.CANCELLED, cancelledAt: new Date() } });
    const assetUpdate = await tx.asset.updateMany({ where: { id: item.assetId, status: AssetStatus.PENDING_CONFIRMATION }, data: { status: AssetStatus.AVAILABLE } });
    if (itemUpdate.count !== 1 || assetUpdate.count !== 1) throw new AppError("Item changed concurrently", 409);
    await tx.assetAssignment.update({ where: { id: item.assignment.id }, data: { status: AssignmentStatus.CANCELLED, isActive: false } });
    await recalculateBatch(tx, item.issueBatchId);
    return tx.issueBatch.findUniqueOrThrow({ where: { id: item.issueBatchId }, include: BATCH_INCLUDE });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

async function confirmIssue(tx: Prisma.TransactionClient, itemId: number, epc: string, userId: number, remarks?: string, source: ConfirmationSource = ConfirmationSource.WEB_ADMIN) {
  const item = await tx.issueBatchItem.findUnique({ where: { id: itemId }, include: { asset: true, assignment: true, issueBatch: true, toLocation: true } });
  if (!item || item.status !== IssueBatchItemStatus.ISSUED || item.asset.status !== AssetStatus.PENDING_CONFIRMATION || !item.assignment?.isActive || !item.toLocationId) throw new AppError("Expected item is no longer awaiting confirmation", 409);
  const itemUpdate = await tx.issueBatchItem.updateMany({ where: { id: item.id, status: IssueBatchItemStatus.ISSUED }, data: { status: IssueBatchItemStatus.CONFIRMED } });
  const assetUpdate = await tx.asset.updateMany({ where: { id: item.assetId, status: AssetStatus.PENDING_CONFIRMATION }, data: { status: AssetStatus.IN_USE, locationId: item.toLocationId } });
  if (itemUpdate.count !== 1 || assetUpdate.count !== 1) throw new AppError("Issue confirmation was already processed", 409);
  const hierarchy = await loadLocationHierarchy(tx);
  const fromDepartment = resolveLocationDepartment(item.asset.locationId, hierarchy);
  const toDepartment = resolveLocationDepartment(item.toLocationId, hierarchy);
  const now = new Date();
  await tx.assetMovement.create({ data: { movementNo: `MOV-${randomUUID()}`, assetId: item.assetId, issueBatchItemId: item.id, fromDepartmentId: fromDepartment?.id ?? null, toDepartmentId: toDepartment?.id ?? null, fromLocationId: item.asset.locationId, toLocationId: item.toLocationId, movedByUserId: userId, movementType: MovementType.LOCATION_TRANSFER, movementDate: now, reason: `ISSUE CONFIRMED: ${item.issueBatch.batchNo}`, remarks: short(remarks, "Remarks") || item.remarks } });
  await tx.assetScanConfirmation.create({ data: { assetId: item.assetId, issueBatchItemId: item.id, assignmentId: item.assignment.id, confirmationType: ConfirmationType.ISSUE_CONFIRMATION, confirmationSource: source, epc, confirmedByUserId: userId, confirmedAt: now, remarks: short(remarks, "Remarks") } });
  await recalculateBatch(tx, item.issueBatchId);
}

type SubmittedIssueItem = { itemId: number; assetId: number; assignmentId: number; epc: string };

async function getConfirmedHandheldRetry(batchId: number, submitted: Map<number, SubmittedIssueItem>) {
  const batch = await prisma.issueBatch.findUnique({
    where: { id: batchId },
    include: {
      items: {
        where: { id: { in: Array.from(submitted.keys()) } },
        include: {
          asset: { include: { epc: true } },
          assignment: true,
          replacementItem: { select: { id: true } },
          handheldSwapTasks: { where: { status: "PENDING" }, select: { id: true } },
          scanConfirmations: { where: { confirmationType: ConfirmationType.ISSUE_CONFIRMATION }, select: { epc: true, assignmentId: true } },
        },
      },
    },
  });
  if (!batch || batch.items.length !== submitted.size) return null;
  const confirmed = batch.items.every((item) => {
    const entry = submitted.get(item.id)!;
    const registeredEpc = item.asset.epc?.isActive && item.asset.epc.status === EpcStatus.ACTIVE ? item.asset.epc.epcCode.trim().toUpperCase() : null;
    return item.assetId === entry.assetId && item.assignment?.id === entry.assignmentId && item.status === IssueBatchItemStatus.CONFIRMED && item.asset.status === AssetStatus.IN_USE && item.assignment.isActive && item.assignment.status === AssignmentStatus.ACTIVE && !item.replacementItem && item.handheldSwapTasks.length === 0 && registeredEpc === entry.epc && item.scanConfirmations.some((confirmation) => confirmation.assignmentId === entry.assignmentId && confirmation.epc.trim().toUpperCase() === entry.epc);
  });
  if (!confirmed) return null;
  return { success: true, status: "ALREADY_CONFIRMED" as const, alreadyConfirmed: true, issueId: batch.id, message: "Issue was already confirmed", confirmedAssetCount: submitted.size };
}

export async function confirmHandheldIssue(batchId: number, input: HandheldIssueConfirmationInput, userId: number, conflictRetry = false) {
  if (!Array.isArray(input.matched) || !input.matched.length) throw new AppError("All expected Asset EPCs are required", 400);
  const submittedBatchId = id(input.issueBatchId, "Issue");
  if (submittedBatchId !== id(batchId, "Issue")) throw new AppError("Submitted Issue identity does not match the requested Issue", 409, "STALE");

  const submitted = new Map<number, SubmittedIssueItem>();
  for (const entry of input.matched) {
    const itemId = id(entry?.itemId, "Issue Batch Item");
    const assetId = id(entry?.assetId, "Asset");
    const assignmentId = id(entry?.assignmentId, "Assignment");
    const epc = String(entry?.epc || "").trim().toUpperCase();
    if (!epc) throw new AppError(`Asset ${assetId} requires an EPC`, 400, "VALIDATION_FAILED");
    if (submitted.has(itemId)) throw new AppError(`Issue Batch Item ${itemId} was submitted more than once`, 400, "VALIDATION_FAILED");
    submitted.set(itemId, { itemId, assetId, assignmentId, epc });
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const batch = await tx.issueBatch.findUnique({
        where: { id: id(batchId, "Issue") },
        select: { id: true, status: true },
      });
      if (!batch) throw new AppError("Issue not found", 404, "STALE");

      const confirmationInclude = { asset: { include: { epc: true } }, assignment: true, handheldSwapTasks: { where: { status: "PENDING" as const }, select: { id: true } }, replacementItem: { select: { id: true } }, scanConfirmations: { where: { confirmationType: ConfirmationType.ISSUE_CONFIRMATION }, select: { epc: true, assignmentId: true } } } satisfies Prisma.IssueBatchItemInclude;
      const submittedItems = await tx.issueBatchItem.findMany({
        where: { issueBatchId: batch.id, id: { in: Array.from(submitted.keys()) } },
        include: confirmationInclude,
        orderBy: { id: "asc" },
      });
      if (submittedItems.length !== submitted.size) throw new AppError("Submitted Asset no longer belongs to this Issue. Refresh the handheld work queue.", 409, "STALE");
      if (submittedItems.some((item) => item.handheldSwapTasks.length > 0)) throw new AppError("Work item changed. A pending Swap now owns one or more submitted Assets. Refresh the handheld work queue.", 409, "STALE");
      const alreadyConfirmed = submittedItems.length === submitted.size && submittedItems.every((item) => {
        const entry = submitted.get(item.id)!;
        const registeredEpc = item.asset.epc?.isActive && item.asset.epc.status === EpcStatus.ACTIVE ? item.asset.epc.epcCode.trim().toUpperCase() : null;
        return item.assetId === entry.assetId && item.assignment?.id === entry.assignmentId && item.status === IssueBatchItemStatus.CONFIRMED && item.asset.status === AssetStatus.IN_USE && item.assignment.isActive && item.assignment.status === AssignmentStatus.ACTIVE && !item.replacementItem && registeredEpc === entry.epc && item.scanConfirmations.some((confirmation) => confirmation.assignmentId === entry.assignmentId && confirmation.epc.trim().toUpperCase() === entry.epc);
      });
      if (alreadyConfirmed) {
        return { success: true, status: "ALREADY_CONFIRMED" as const, alreadyConfirmed: true, issueId: batch.id, message: "Issue was already confirmed", confirmedAssetCount: submitted.size };
      }
      if (!ACTIVE_BATCH_STATUSES.includes(batch.status)) throw new AppError("Work item changed. Issue is no longer confirmable. Refresh the handheld work queue.", 409, "STALE");

      const expected = await tx.issueBatchItem.findMany({
        where: { issueBatchId: batch.id, status: IssueBatchItemStatus.ISSUED, handheldSwapTasks: { none: { status: "PENDING" } } },
        include: confirmationInclude,
        orderBy: { id: "asc" },
      });
      if (!expected.length) throw new AppError("Work item changed. No Assets are awaiting Processing confirmation. Refresh the handheld work queue.", 409, "STALE");

      if (submitted.size !== expected.length || expected.some((item) => !submitted.has(item.id))) {
        throw new AppError("Work item changed. Submitted Assets no longer match the Processing work. Refresh the handheld work queue.", 409, "STALE");
      }

      for (const item of expected) {
        const entry = submitted.get(item.id)!;
        const registeredEpc = item.asset.epc?.isActive && item.asset.epc.status === EpcStatus.ACTIVE
          ? item.asset.epc.epcCode.trim().toUpperCase()
          : null;
        if (!registeredEpc) throw new AppError(`${item.asset.assetCode} has no active EPC registration`, 409, "VALIDATION_FAILED");
        if (entry.assetId !== item.assetId || entry.assignmentId !== item.assignment?.id) throw new AppError(`Work item changed. ${item.asset.assetCode} item or assignment identity no longer matches. Refresh the handheld work queue.`, 409, "STALE");
        if (entry.epc !== registeredEpc) {
          throw new AppError(`Asset EPC no longer matches the prepared issue: ${item.asset.assetCode}`, 409, "VALIDATION_FAILED");
        }
        if (!item.assignment?.isActive || item.asset.status !== AssetStatus.PENDING_CONFIRMATION) {
          throw new AppError(`Work item changed. ${item.asset.assetCode} is no longer awaiting confirmation. Refresh the handheld work queue.`, 409, "STALE");
        }
        if (item.replacementItem) throw new AppError(`Work item changed. ${item.asset.assetCode} has already been replaced. Refresh the handheld work queue.`, 409, "STALE");
      }

      for (const item of expected) {
        await confirmIssue(tx, item.id, submitted.get(item.id)!.epc, userId, input.remarks, ConfirmationSource.HANDHELD);
      }

      return {
        success: true,
        status: "CONFIRMED" as const,
        alreadyConfirmed: false,
        issueId: batch.id,
        message: "Issue confirmed successfully",
        confirmedAssetCount: expected.length,
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034" && !conflictRetry) {
      return confirmHandheldIssue(batchId, input, userId, true);
    }
    if ((error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") || (error instanceof AppError && error.statusCode === 409 && /already processed|concurrent/i.test(error.message))) {
      const retry = await getConfirmedHandheldRetry(batchId, submitted);
      if (retry) return retry;
      throw new AppError("Issue confirmation conflicted with another update; refresh and retry", 409, "CONFLICT");
    }
    throw error;
  }
}

export async function compareBatchScans(batchId: number, input: ScanComparisonInput, userId: number) {
  if (!Array.isArray(input.epcs) || !input.epcs.length) throw new AppError("At least one EPC scan is required", 400);
  try { return await prisma.$transaction(async (tx) => {
    const batch = await tx.issueBatch.findUnique({ where: { id: id(batchId, "Batch") }, include: { items: true } });
    if (!batch) throw new AppError("Issue Batch not found", 404);
    const seen = new Set<string>();
    const results: Array<{ epc: string; classification: string; assetId?: number; itemId?: number }> = [];
    for (const raw of input.epcs) {
      const epc = String(raw || "").trim().toUpperCase();
      if (!epc || seen.has(epc)) { results.push({ epc, classification: "DUPLICATE_SCAN" }); continue; }
      seen.add(epc);
      const resolved = await tx.assetEpc.findUnique({ where: { epcCode: epc } });
      if (!resolved?.isActive || resolved.status !== EpcStatus.ACTIVE) { results.push({ epc, classification: "INVALID_OR_INACTIVE_EPC" }); continue; }
      const expected = batch.items.find((item) => item.assetId === resolved.assetId);
      if (!expected) { results.push({ epc, classification: "UNEXPECTED_NOT_SELECTED", assetId: resolved.assetId }); continue; }
      if (expected.status !== IssueBatchItemStatus.ISSUED) { results.push({ epc, classification: "EXPECTED_ALREADY_CONFIRMED", assetId: resolved.assetId, itemId: expected.id }); continue; }
      await confirmIssue(tx, expected.id, epc, userId, input.remarks);
      expected.status = IssueBatchItemStatus.CONFIRMED;
      results.push({ epc, classification: "MATCHED_CONFIRMED", assetId: resolved.assetId, itemId: expected.id });
    }
    return { batch: await tx.issueBatch.findUniqueOrThrow({ where: { id: batch.id }, include: BATCH_INCLUDE }), results };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }); } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") throw new AppError("Scan confirmation conflicted with another confirmation; refresh and retry", 409);
    throw error;
  }
}

type GlobalScanClassification = "MATCHED_CONFIRMED" | "EXPECTED_ALREADY_CONFIRMED" | "UNEXPECTED_NOT_PREPARED" | "INVALID_OR_INACTIVE_EPC" | "DUPLICATE_SCAN";
type GlobalScanResult = {
  epc: string;
  classification: GlobalScanClassification;
  assetId?: number;
  assetCode?: string;
  itemId?: number;
  batchNo?: string;
  jobNo?: string | null;
  recipient?: string | null;
  toLocation?: string | null;
};

function globalScanContext(item: {
  id: number;
  assetId: number;
  asset: { assetCode: string };
  issueBatch: { batchNo: string; jobNo: string | null };
  recipient: { fullName: string | null; username: string } | null;
  toLocation: { name: string; locationCode: string } | null;
}) {
  return {
    assetId: item.assetId,
    assetCode: item.asset.assetCode,
    itemId: item.id,
    batchNo: item.issueBatch.batchNo,
    jobNo: item.issueBatch.jobNo,
    recipient: item.recipient?.fullName || item.recipient?.username || null,
    toLocation: locationName(item.toLocation),
  };
}

async function scanOneAcrossJobs(epc: string, remarks: string | undefined, userId: number): Promise<GlobalScanResult> {
  return prisma.$transaction(async (tx) => {
    const mapping = await tx.assetEpc.findUnique({ where: { epcCode: epc }, include: { asset: { select: { assetCode: true } } } });
    if (!mapping?.isActive || mapping.status !== EpcStatus.ACTIVE) return { epc, classification: "INVALID_OR_INACTIVE_EPC" };
    const item = await tx.issueBatchItem.findFirst({
      where: {
        assetId: mapping.assetId,
        issueBatch: { status: { in: [IssueBatchStatus.PREPARING, IssueBatchStatus.PROCESSING] } },
        status: { in: [IssueBatchItemStatus.ISSUED, IssueBatchItemStatus.CONFIRMED] },
      },
      include: { asset: true, issueBatch: true, recipient: true, toLocation: true },
      orderBy: { id: "desc" },
    });
    if (!item) return { epc, classification: "UNEXPECTED_NOT_PREPARED", assetId: mapping.assetId, assetCode: mapping.asset.assetCode };
    const context = globalScanContext(item);
    if (item.status === IssueBatchItemStatus.CONFIRMED) return { epc, classification: "EXPECTED_ALREADY_CONFIRMED", ...context };
    if (item.asset.status !== AssetStatus.PENDING_CONFIRMATION) return { epc, classification: "UNEXPECTED_NOT_PREPARED", ...context };
    await confirmIssue(tx, item.id, epc, userId, remarks);
    return { epc, classification: "MATCHED_CONFIRMED", ...context };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function scanAllJobs(input: ScanAllJobsInput, userId: number) {
  if (!Array.isArray(input.epcs) || !input.epcs.length) throw new AppError("At least one EPC scan is required", 400);
  const seen = new Set<string>(); const results: GlobalScanResult[] = [];
  for (const raw of input.epcs) {
    const epc = String(raw || "").trim().toUpperCase();
    if (!epc || seen.has(epc)) { results.push({ epc, classification: "DUPLICATE_SCAN" }); continue; }
    seen.add(epc);
    try { results.push(await scanOneAcrossJobs(epc, input.remarks, userId)); }
    catch (error) {
      if ((error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") || (error instanceof AppError && error.statusCode === 409)) {
        results.push(await scanOneAcrossJobs(epc, input.remarks, userId));
      } else throw error;
    }
  }
  return { results };
}

export async function confirmBatchItemIssue(itemId: number, epcInput: string, remarks: string | undefined, userId: number) {
  const epc = epcInput?.trim().toUpperCase();
  if (!epc) throw new AppError("EPC is required", 400);
  try {
    return await prisma.$transaction(async (tx) => {
      const item = await tx.issueBatchItem.findUnique({ where: { id: id(itemId, "Item") }, include: { asset: true } });
      if (!item) throw new AppError("Issue Batch Item not found", 404);
      if (item.status !== IssueBatchItemStatus.ISSUED || item.asset.status !== AssetStatus.PENDING_CONFIRMATION) throw new AppError("Item is not awaiting EPC confirmation", 409);
      const resolved = await tx.assetEpc.findUnique({ where: { epcCode: epc } });
      if (!resolved?.isActive || resolved.status !== EpcStatus.ACTIVE || resolved.assetId !== item.assetId) throw new AppError("EPC does not match the expected Asset", 409);
      await confirmIssue(tx, item.id, epc, userId, remarks);
      return tx.issueBatch.findUniqueOrThrow({ where: { id: item.issueBatchId }, include: BATCH_INCLUDE });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") throw new AppError("Issue confirmation conflicted with another confirmation; refresh and retry", 409);
    throw error;
  }
}

type ReturnScanClassification = "RETURNED" | "ALREADY_RETURNED" | "NOT_IN_USE" | "INVALID_OR_INACTIVE_EPC" | "DUPLICATE_SCAN" | "HOME_LOCATION_UNRESOLVED" | "NO_ACTIVE_ASSIGNMENT";
type ReturnScanResult = { epc: string; classification: ReturnScanClassification; assetId?: number; assetCode?: string; previousLocation?: string | null; homeLocation?: string | null };
type ReturnSubmission = { epc: string; itemId?: number; assignmentId?: number; assetId?: number };

function locationName(location: { locationCode: string; name: string } | null | undefined) {
  return location ? `${location.name} (${location.locationCode})` : null;
}

async function returnOneScannedAssetInTransaction(tx: Prisma.TransactionClient, submission: ReturnSubmission, remarks: string | undefined, userId: number, source: ConfirmationSource): Promise<ReturnScanResult> {
    const epc = submission.epc;
    const mapping = await tx.assetEpc.findUnique({ where: { epcCode: epc } });
    if (!mapping?.isActive || mapping.status !== EpcStatus.ACTIVE) return { epc, classification: "INVALID_OR_INACTIVE_EPC" };
    const asset = await tx.asset.findUnique({ where: { id: mapping.assetId }, include: { location: true, homeLocation: true } });
    if (!asset) return { epc, classification: "INVALID_OR_INACTIVE_EPC" };
    const base = { epc, assetId: asset.id, assetCode: asset.assetCode, previousLocation: locationName(asset.location), homeLocation: locationName(asset.homeLocation) };
    if (asset.status !== AssetStatus.IN_USE) {
      const priorReturn = asset.status === AssetStatus.AVAILABLE && await tx.assetScanConfirmation.findFirst({ where: { assetId: asset.id, confirmationType: ConfirmationType.RETURN_CONFIRMATION }, select: { id: true } });
      return { ...base, classification: priorReturn ? "ALREADY_RETURNED" : "NOT_IN_USE" };
    }
    if (!asset.homeLocationId || !asset.homeLocation?.isActive || !STORAGE_TYPES.includes(asset.homeLocation.locationType)) return { ...base, classification: "HOME_LOCATION_UNRESOLVED" };
    const assignments = await tx.assetAssignment.findMany({ where: { assetId: asset.id, status: AssignmentStatus.ACTIVE, isActive: true, returnedAt: null }, include: { issueBatchItem: { include: { issueBatch: true } } }, take: 2 });
    if (assignments.length !== 1 || !assignments[0].issueBatchItemId || assignments[0].issueBatchItem?.status !== IssueBatchItemStatus.CONFIRMED) return { ...base, classification: "NO_ACTIVE_ASSIGNMENT" };
    const assignment = assignments[0]; const item = assignment.issueBatchItem!; const now = new Date();
    if ((submission.assetId !== undefined && submission.assetId !== asset.id) || (submission.itemId !== undefined && submission.itemId !== item.id) || (submission.assignmentId !== undefined && submission.assignmentId !== assignment.id)) return { ...base, classification: "NO_ACTIVE_ASSIGNMENT" };
    const pendingSwap = await tx.handheldSwapTask.findFirst({ where: { targetItemId: item.id, status: "PENDING" }, select: { id: true } });
    if (pendingSwap) throw new AppError(`Asset ${asset.assetCode} is currently reserved for a pending Swap task. Refresh the handheld work queue.`, 409);
    const itemUpdate = await tx.issueBatchItem.updateMany({ where: { id: item.id, status: IssueBatchItemStatus.CONFIRMED }, data: { status: IssueBatchItemStatus.RETURNED } });
    const assetUpdate = await tx.asset.updateMany({ where: { id: asset.id, status: AssetStatus.IN_USE }, data: { status: AssetStatus.AVAILABLE, locationId: asset.homeLocationId } });
    const assignmentUpdate = await tx.assetAssignment.updateMany({ where: { id: assignment.id, status: AssignmentStatus.ACTIVE, isActive: true, returnedAt: null }, data: { status: AssignmentStatus.RETURNED, isActive: false, returnedAt: now, returnCondition: asset.condition, returnLocationId: asset.homeLocationId, returnRemarks: short(remarks, "Remarks") || assignment.returnRemarks, returnedByUserId: userId } });
    if (itemUpdate.count !== 1 || assetUpdate.count !== 1 || assignmentUpdate.count !== 1) throw new AppError("Return Scan conflicted with another return", 409);
    const hierarchy = await loadLocationHierarchy(tx); const fromDepartment = resolveLocationDepartment(asset.locationId, hierarchy); const toDepartment = resolveLocationDepartment(asset.homeLocationId, hierarchy);
    await tx.assetMovement.create({ data: { movementNo: `MOV-${randomUUID()}`, assetId: asset.id, issueBatchItemId: item.id, fromDepartmentId: fromDepartment?.id ?? null, toDepartmentId: toDepartment?.id ?? null, fromLocationId: asset.locationId, toLocationId: asset.homeLocationId, movedByUserId: userId, movementType: MovementType.LOCATION_TRANSFER, movementDate: now, reason: `RETURN SCAN: ${item.issueBatch.batchNo}`, remarks: short(remarks, "Remarks") } });
    await tx.assetScanConfirmation.create({ data: { assetId: asset.id, issueBatchItemId: item.id, assignmentId: assignment.id, confirmationType: ConfirmationType.RETURN_CONFIRMATION, confirmationSource: source, epc, confirmedByUserId: userId, confirmedAt: now, remarks: short(remarks, "Remarks") } });
    await recalculateBatch(tx, item.issueBatchId);
    return { ...base, classification: "RETURNED", homeLocation: locationName(asset.homeLocation) };
}

async function returnOneScannedAsset(epc: string, remarks: string | undefined, userId: number, source: ConfirmationSource): Promise<ReturnScanResult> {
  return prisma.$transaction((tx) => returnOneScannedAssetInTransaction(tx, { epc }, remarks, userId, source), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

async function inspectReturnSet(tx: Prisma.TransactionClient, submissions: ReturnSubmission[], issueBatchId?: number) {
  const epcs = submissions.map((submission) => submission.epc);
  const mappings = await tx.assetEpc.findMany({
    where: { epcCode: { in: epcs } },
    include: {
      asset: {
        include: {
          homeLocation: true,
          assignments: { orderBy: { id: "desc" }, include: { issueBatchItem: { include: { movements: true, scanConfirmations: true, handheldSwapTasks: { where: { status: "PENDING" }, select: { id: true } } } } } },
        },
      },
    },
  });
  if (mappings.length !== epcs.length) throw new AppError("One or more scanned EPCs no longer identify an Asset. Refresh the handheld work queue.", 409, "STALE");
  const byEpc = new Map(mappings.map((mapping) => [mapping.epcCode.trim().toUpperCase(), mapping]));
  const states = submissions.map((submission) => {
    const epc = submission.epc;
    const mapping = byEpc.get(epc)!; const asset = mapping.asset;
    if (!mapping.isActive || mapping.status !== EpcStatus.ACTIVE || !asset.isActive) throw new AppError(`EPC ${epc} or its Asset is no longer active. Refresh the handheld work queue.`, 409, "STALE");
    const latestAssignment = asset.assignments[0];
    const returned = latestAssignment && (() => {
      const assignment = latestAssignment;
      const item = assignment.issueBatchItem;
      return item?.status === IssueBatchItemStatus.RETURNED && (!issueBatchId || item.issueBatchId === issueBatchId) && assignment.status === AssignmentStatus.RETURNED && !assignment.isActive && assignment.returnedAt !== null && assignment.returnLocationId === asset.homeLocationId && item.movements.some((movement) => movement.reason?.startsWith("RETURN SCAN:") && movement.toLocationId === asset.homeLocationId) && item.scanConfirmations.some((confirmation) => confirmation.confirmationType === ConfirmationType.RETURN_CONFIRMATION && confirmation.confirmationSource === ConfirmationSource.HANDHELD && confirmation.epc.trim().toUpperCase() === epc);
    })();
    const identityMatchesLatest = (!submission.assetId || submission.assetId === asset.id) && (!submission.itemId || submission.itemId === latestAssignment?.issueBatchItemId) && (!submission.assignmentId || submission.assignmentId === latestAssignment?.id);
    const completed = identityMatchesLatest && asset.status === AssetStatus.AVAILABLE && asset.locationId === asset.homeLocationId && returned === true;
    const active = asset.assignments.filter((assignment) => assignment.status === AssignmentStatus.ACTIVE && assignment.isActive && assignment.returnedAt === null && assignment.issueBatchItem?.status === IssueBatchItemStatus.CONFIRMED);
    const pendingSwap = active.length === 1 && active[0].issueBatchItem!.handheldSwapTasks.length > 0;
    const activeIdentityMatches = active.length === 1 && (!submission.assetId || submission.assetId === asset.id) && (!submission.itemId || submission.itemId === active[0].issueBatchItemId) && (!submission.assignmentId || submission.assignmentId === active[0].id);
    const returnable = activeIdentityMatches && asset.status === AssetStatus.IN_USE && active.length === 1 && (!issueBatchId || active[0].issueBatchItem?.issueBatchId === issueBatchId) && !!asset.homeLocationId && !!asset.homeLocation?.isActive && STORAGE_TYPES.includes(asset.homeLocation.locationType) && !pendingSwap;
    return { epc, asset, completed, returnable, pendingSwap, activeAssignment: active[0], submission };
  });
  return states;
}

export async function returnScannedAssetsAtomically(input: ReturnScanInput, userId: number, source: ConfirmationSource = ConfirmationSource.HANDHELD, conflictRetry = false) {
  const submissions: ReturnSubmission[] = input.items?.map((entry) => ({ itemId: id(entry.itemId, "Issue Batch Item"), assignmentId: id(entry.assignmentId, "Assignment"), assetId: id(entry.assetId, "Asset"), epc: String(entry.epc || "").trim().toUpperCase() })) ?? (input.epcs || []).map((raw) => ({ epc: String(raw || "").trim().toUpperCase() }));
  if (!submissions.length || submissions.some((submission) => !submission.epc)) throw new AppError("At least one valid EPC scan is required", 400);
  const epcs = submissions.map((submission) => submission.epc);
  if (new Set(epcs).size !== epcs.length || new Set(submissions.map((submission) => submission.itemId).filter(Boolean)).size !== submissions.filter((submission) => submission.itemId).length) throw new AppError("Duplicate Return work entries are not allowed", 400, "VALIDATION_FAILED");
  try {
    return await prisma.$transaction(async (tx) => {
    const processor = await tx.user.findUnique({ where: { id: userId }, select: { isActive: true } });
    if (!processor?.isActive) throw new AppError("Authenticated return user is invalid or inactive", 400);
    const states = await inspectReturnSet(tx, submissions, input.issueBatchId);
    if (states.every((state) => state.completed)) {
      return { success: true as const, status: "ALREADY_CONFIRMED" as const, alreadyConfirmed: true, message: "Return was already confirmed", results: states.map((state) => ({ epc: state.epc, classification: "ALREADY_RETURNED" as const, assetId: state.asset.id, assetCode: state.asset.assetCode })) };
    }
    if (states.some((state) => state.completed)) throw new AppError("Return work set changed: some submitted Assets were already returned while others remain pending. Refresh the handheld work queue.", 409, "STALE");
    const swapBlocked = states.filter((state) => state.pendingSwap);
    if (swapBlocked.length) {
      const assetCodes = swapBlocked.map((state) => state.asset.assetCode).join(", ");
      throw new AppError(`Asset${swapBlocked.length > 1 ? "s" : ""} ${assetCodes} ${swapBlocked.length > 1 ? "are" : "is"} currently reserved for pending Swap work. Refresh the handheld work queue.`, 409, "CONFLICT");
    }
    const invalid = states.find((state) => !state.returnable);
    if (invalid) throw new AppError(`Return work changed for Asset ${invalid.asset.assetCode}. Refresh the handheld work queue.`, 409, "STALE");
    const blocked = await tx.handheldSwapTask.findMany({
      where: { status: "PENDING", targetItem: { asset: { epc: { epcCode: { in: epcs } } } } },
      select: { targetItem: { select: { asset: { select: { assetCode: true } } } } },
    });
    if (blocked.length) {
      const assetCodes = blocked.map((task) => task.targetItem.asset.assetCode).join(", ");
      throw new AppError(`Asset${blocked.length > 1 ? "s" : ""} ${assetCodes} ${blocked.length > 1 ? "are" : "is"} currently reserved for pending Swap work. Refresh the handheld work queue.`, 409, "CONFLICT");
    }
    const results: ReturnScanResult[] = [];
    for (const epc of epcs) {
      const submission = submissions.find((entry) => entry.epc === epc)!;
      const result = await returnOneScannedAssetInTransaction(tx, submission, input.remarks, userId, source);
      if (result.classification !== "RETURNED") throw new AppError(`Return work changed for EPC ${epc}: ${result.classification.replace(/_/g, " ").toLowerCase()}. Refresh the handheld work queue.`, 409);
      results.push(result);
    }
    return { success: true as const, status: "CONFIRMED" as const, alreadyConfirmed: false, message: "Return confirmed successfully", results };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      if (!conflictRetry) return returnScannedAssetsAtomically(input, userId, source, true);
      try {
        return await prisma.$transaction(async (tx) => {
          const states = await inspectReturnSet(tx, submissions, input.issueBatchId);
          if (!states.every((state) => state.completed)) throw new AppError("Return confirmation conflicted with another operation. Refresh the handheld work queue.", 409, "CONFLICT");
          return { success: true as const, status: "ALREADY_CONFIRMED" as const, alreadyConfirmed: true, message: "Return was already confirmed", results: states.map((state) => ({ epc: state.epc, classification: "ALREADY_RETURNED" as const, assetId: state.asset.id, assetCode: state.asset.assetCode })) };
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      } catch (proofError) {
        if (proofError instanceof AppError) throw proofError;
        throw new AppError("Return confirmation conflicted with another operation. Refresh the handheld work queue.", 409, "CONFLICT");
      }
    }
    throw error;
  }
}

export async function returnScan(input: ReturnScanInput, userId: number, source: ConfirmationSource = ConfirmationSource.WEB_ADMIN) {
  if (!Array.isArray(input.epcs) || !input.epcs.length) throw new AppError("At least one EPC scan is required", 400);
  const processor = await prisma.user.findUnique({ where: { id: userId } });
  if (!processor?.isActive) throw new AppError("Authenticated return user is invalid or inactive", 400);
  const seen = new Set<string>(); const results: ReturnScanResult[] = [];
  for (const raw of input.epcs) {
    const epc = String(raw || "").trim().toUpperCase();
    if (!epc || seen.has(epc)) { results.push({ epc, classification: "DUPLICATE_SCAN" }); continue; }
    seen.add(epc);
    try { results.push(await returnOneScannedAsset(epc, input.remarks, userId, source)); }
    catch (error) {
      if ((error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") || (error instanceof AppError && error.statusCode === 409)) {
        results.push(await returnOneScannedAsset(epc, input.remarks, userId, source));
      } else throw error;
    }
  }
  return { results };
}
