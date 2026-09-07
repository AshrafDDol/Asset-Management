import { validateRequestDestination, validateRequestRoot } from "./requestLocation";
import { randomUUID } from "crypto";
import { AssetRequestStatus, Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { AppError } from "../../utils/AppError";
import { calculateLineProgress, calculateRequestProgress } from "./assetRequest.progress";
import {
  AssetRequestFilters,
  AssetRequestLineInput,
  CreateAssetRequestInput,
  UpdateAssetRequestInput,
} from "./assetRequest.types";

const REQUEST_RELATIONS = {
  rootLocation: { select: { id: true, name: true, locationCode: true, isActive: true } },
  machine: { select: { id: true, machineCode: true, machineName: true, isActive: true } },
  requestedBy: { select: { id: true, username: true, fullName: true, email: true } },
  lines: {
    orderBy: { lineNo: "asc" as const },
    include: {
      bladeSku: {
        include: {
          category: { select: { id: true, categoryCode: true, name: true } },
        },
      },
      preparedRecipient: { select: { id: true, fullName: true, username: true, isActive: true } },
      specificLocation: { select: { id: true, name: true, isActive: true } },
      assetCategory: { select: { id: true, categoryCode: true, name: true, isActive: true } },
      allocations: {
        orderBy: { reservedAt: "desc" as const },
        include: {
          scanConfirmations: { select: { id: true, confirmationType: true, confirmationSource: true, confirmedAt: true, epc: true, remarks: true, confirmedBy: { select: { id: true, fullName: true } } } },
          reservedBy: { select: { id: true, username: true, fullName: true } },
          asset: {
            include: {
              epc: { select: { id: true, epcCode: true, status: true, isActive: true } },
              location: { select: { id: true, locationCode: true, name: true, locationType: true, parentLocationId: true } },
            },
          },
          assignment: {
            include: {
              assignedToUser: { select: { id: true, username: true, fullName: true } },
              assignedByUser: { select: { id: true, username: true, fullName: true } },
              location: { select: { id: true, locationCode: true, name: true, locationType: true, parentLocationId: true } },
              returnLocation: { select: { id: true, locationCode: true, name: true, locationType: true, parentLocationId: true } },
              returnedByUser: { select: { id: true, username: true, fullName: true } },
            },
          },
        },
      },
    },
  },
};

function requiredText(value: string | undefined, fieldName: string) {
  const normalized = value?.trim();
  if (!normalized) throw new AppError(`${fieldName} is required`, 400);
  return normalized;
}

function optionalText(value: string | null | undefined) {
  if (value === undefined) return undefined;
  return value?.trim() || null;
}

function positiveId(value: unknown, fieldName: string) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new AppError(`${fieldName} must be a valid ID`, 400);
  return parsed;
}

function validSequence(value: unknown) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) throw new AppError("Sequence must be a non-negative integer", 400);
  return parsed;
}

function optionalMeasurement(value: number | string | null | undefined, fieldName: string) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new AppError(`${fieldName} must be greater than zero`, 400);
  return new Prisma.Decimal(parsed);
}

async function validateRequester(tx: Prisma.TransactionClient, userId: number) {
  const user = await tx.user.findUnique({ where: { id: userId } });
  if (!user || !user.isActive) throw new AppError("Authenticated requester is invalid or inactive", 400);
}

async function validateLines(tx: Prisma.TransactionClient, lines: AssetRequestLineInput[]) {
  if (!Array.isArray(lines) || lines.length === 0) throw new AppError("At least one request line is required", 400);
  const normalized = lines.map((line, index) => {
    const assetCategoryId = positiveId(line.assetCategoryId, `Line ${index + 1} Asset Category`);
    const measurementHeight = optionalMeasurement(line.measurementHeight, `Line ${index + 1} Measurement height`);
    const measurementWidth = optionalMeasurement(line.measurementWidth, `Line ${index + 1} Measurement width`);
    if (!measurementHeight || !measurementWidth) throw new AppError(`Line ${index + 1} requires Measurement height and width`, 400);
    return { assetCategoryId, measurementHeight, measurementWidth, quantityRequested: 1, remarks: optionalText(line.remarks), preparedRecipientUserId: line.preparedRecipientUserId == null ? null : positiveId(line.preparedRecipientUserId, "Recipient"), specificLocationId: line.specificLocationId == null ? null : positiveId(line.specificLocationId, "Specific Location") };
  });

  const uniqueIds = [...new Set(normalized.map((line) => line.assetCategoryId))];
  const activeCount = await tx.assetCategory.count({ where: { id: { in: uniqueIds }, isActive: true } });
  if (activeCount !== uniqueIds.length) throw new AppError("One or more Asset Categories are invalid or inactive", 400);
  return normalized;
}

async function validatePreparation(tx: Prisma.TransactionClient, rootId: number | null, recipientId: number | null, locationId: number | null) {
  if (recipientId) {
    const recipient = await tx.user.findUnique({ where: { id: recipientId } });
    if (!recipient?.isActive) throw new AppError("Recipient must be an active user", 400);
  }
  if (locationId) await validateRequestDestination(tx, rootId, locationId);
}

function requestData(input: CreateAssetRequestInput | UpdateAssetRequestInput) {
  return {
    rootLocationId: input.rootLocationId === undefined ? undefined : positiveId(input.rootLocationId, "Root Location"),
    jobNo: input.jobNo === undefined ? undefined : requiredText(input.jobNo, "Job number"),
    remarks: optionalText(input.remarks),
  };
}

type LocationNode = { id: number; name: string; parentLocationId: number | null };

function locationPath(locationId: number | null, locations: Map<number, LocationNode>) {
  const names: string[] = [];
  const visited = new Set<number>();
  let current = locationId ? locations.get(locationId) : undefined;
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    names.unshift(current.name);
    current = current.parentLocationId ? locations.get(current.parentLocationId) : undefined;
  }
  return names.join(" / ") || null;
}

function withProgress<T extends { lines: Array<{ quantityRequested: number; allocations: Array<{ status: "RESERVED" | "ISSUED" | "CONFIRMED" | "RETURN_PENDING" | "RETURNED" | "CANCELLED"; asset: { locationId: number | null; homeLocationId?: number | null } }> }> }>(request: T, locations: Map<number, LocationNode>) {
  const lines = request.lines.map((line) => ({
    ...line,
    allocations: line.allocations.map((allocation) => ({
      ...allocation,
      asset: { ...allocation.asset, locationPath: locationPath(allocation.asset.locationId, locations), homeLocationPath: locationPath(allocation.asset.homeLocationId ?? null, locations) },
    })),
    progress: calculateLineProgress(line),
  }));
  return { ...request, lines, progress: calculateRequestProgress(request.lines) };
}

export async function getAllAssetRequests(filters: AssetRequestFilters = {}) {
  const status = filters.status
    ? Object.values(AssetRequestStatus).includes(filters.status as AssetRequestStatus)
      ? filters.status as AssetRequestStatus
      : (() => { throw new AppError("Invalid request status", 400); })()
    : undefined;
  const requests = await prisma.assetRequest.findMany({
    where: {
      status,
      jobNo: filters.jobNo ? { contains: filters.jobNo.trim() } : undefined,
      requestedByUserId: filters.requestedBy,
      OR: filters.search ? [
        { requestNo: { contains: filters.search.trim() } },
        { jobNo: { contains: filters.search.trim() } },
        { productionOrderNo: { contains: filters.search.trim() } },
        { salesOrderNo: { contains: filters.search.trim() } },
        { partCode: { contains: filters.search.trim() } },
        { lines: { some: { allocations: { some: { asset: { OR: [{ assetCode: { contains: filters.search.trim() } }, { epc: { is: { epcCode: { contains: filters.search.trim() } } } }] } } } } } },
      ] : undefined,
    },
    include: REQUEST_RELATIONS,
    orderBy: { createdAt: "desc" },
  });
  const locationRows = await prisma.location.findMany({ select: { id: true, name: true, parentLocationId: true } });
  const locations = new Map(locationRows.map((item) => [item.id, item]));
  return requests.map((request) => withProgress(request, locations));
}

export async function getAssetRequestById(id: number) {
  if (!Number.isInteger(id) || id <= 0) throw new AppError("Invalid Asset Request ID", 400);
  const request = await prisma.assetRequest.findUnique({ where: { id }, include: REQUEST_RELATIONS });
  if (!request) throw new AppError("Asset Request not found", 404);
  const locationRows = await prisma.location.findMany({ select: { id: true, name: true, parentLocationId: true } });
  return withProgress(request, new Map(locationRows.map((item) => [item.id, item])));
}

export async function createAssetRequest(input: CreateAssetRequestInput, requestedByUserId: number) {
  const data = requestData(input);
  if (!data.jobNo) throw new AppError("Job number is required", 400);

  return prisma.$transaction(async (tx) => {
    await validateRequester(tx, requestedByUserId);
    await validateRequestRoot(tx, Number(input.rootLocationId));
    const lines = await validateLines(tx, input.lines);
    for (const line of lines) await validatePreparation(tx, Number(input.rootLocationId), line.preparedRecipientUserId, line.specificLocationId);
    const created = await tx.assetRequest.create({
      data: {
        ...data,
        jobNo: data.jobNo!,
        requestNo: `TMP-${randomUUID()}`,
        requestedByUserId,
        lines: {
          create: lines.map((line, index) => ({ ...line, lineNo: index + 1 })),
        },
      },
    });
    const requestNo = `REQ-${String(created.id).padStart(6, "0")}`;
    const request = await tx.assetRequest.update({ where: { id: created.id }, data: { requestNo }, include: REQUEST_RELATIONS });
    const locationRows = await tx.location.findMany({ select: { id: true, name: true, parentLocationId: true } });
    return withProgress(request, new Map(locationRows.map((item) => [item.id, item])));
  });
}

export async function updateAssetRequest(id: number, input: UpdateAssetRequestInput) {
  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.assetRequest.findUnique({ where: { id }, include: { lines: { orderBy: { lineNo: "asc" }, include: { allocations: true } } } });
      if (!existing) throw new AppError("Asset Request not found", 404);
      if (existing.status !== "PENDING" && existing.status !== "PROCESSING") throw new AppError("Only PENDING / PROCESSING requests have editable preparation", 409);
      const data = requestData(input);
      const hasIssuedHistory = existing.lines.some((line) => line.allocations.some((a) => !["CANCELLED", "RESERVED"].includes(a.status)));
      if (hasIssuedHistory && ((data.jobNo !== undefined && data.jobNo !== existing.jobNo) || (data.rootLocationId !== undefined && data.rootLocationId !== existing.rootLocationId))) {
        throw new AppError("Job/root fields are locked after issue; edit only unissued requirements or use Swap Asset", 409);
      }
      const rootId = data.rootLocationId ?? existing.rootLocationId;
      if (data.rootLocationId !== undefined) await validateRequestRoot(tx, data.rootLocationId);
      if (input.lines) {
        const seen = new Set<number>();
        let nextLineNo = Math.max(0, ...existing.lines.map((line) => line.lineNo)) + 1;
        for (const [index, submitted] of input.lines.entries()) {
          const lineId = submitted.id ?? (existing.lines.every((line) => line.allocations.length === 0) ? existing.lines[index]?.id : undefined);
          const prior = lineId === undefined ? undefined : existing.lines.find((line) => line.id === lineId);
          if (lineId !== undefined && (!prior || seen.has(lineId))) throw new AppError("Invalid or duplicate requirement ID", 400);
          if (lineId !== undefined) seen.add(lineId);
          const merged = { ...submitted,
            preparedRecipientUserId: submitted.preparedRecipientUserId === undefined ? prior?.preparedRecipientUserId : submitted.preparedRecipientUserId,
            specificLocationId: submitted.specificLocationId === undefined ? prior?.specificLocationId : submitted.specificLocationId,
          };
          const [normalized] = await validateLines(tx, [merged]);
          if (prior) {
            const specChanged = prior.assetCategoryId !== normalized.assetCategoryId || !prior.measurementHeight?.equals(normalized.measurementHeight) || !prior.measurementWidth?.equals(normalized.measurementWidth);
            const prepChanged = prior.preparedRecipientUserId !== normalized.preparedRecipientUserId || prior.specificLocationId !== normalized.specificLocationId;
            const remarksChanged = normalized.remarks !== undefined && normalized.remarks !== prior.remarks;
            const history = prior.allocations.some((a) => !["RESERVED", "CANCELLED"].includes(a.status));
            const reserved = prior.allocations.some((a) => a.status === "RESERVED");
            const locked = prior.allocations.some((a) => ["ISSUED", "CONFIRMED", "RETURN_PENDING"].includes(a.status) || (a.status === "RETURNED" && a.returnPurpose !== "SWAP"));
            if (specChanged && (history || reserved)) throw new AppError(history ? "Issued requirement specifications are historical; use Swap Asset" : "Cancel Selection before changing Category or Measurement", 409);
            if (locked && (specChanged || prepChanged || remarksChanged)) throw new AppError("Issued/confirmed requirement is locked; use Swap Asset for replacement", 409);
            if (!locked) {
              await validatePreparation(tx, rootId, normalized.preparedRecipientUserId, normalized.specificLocationId);
              await tx.assetRequestLine.update({ where: { id: prior.id }, data: normalized });
            }
          } else {
            if (hasIssuedHistory) throw new AppError("New requirements cannot be added after issue", 409);
            await validatePreparation(tx, rootId, normalized.preparedRecipientUserId, normalized.specificLocationId);
            await tx.assetRequestLine.create({ data: { ...normalized, requestId: id, lineNo: nextLineNo++ } });
          }
        }
        const removed = existing.lines.filter((line) => !seen.has(line.id));
        if (removed.some((line) => line.allocations.length > 0)) throw new AppError("Requirements with allocation history cannot be removed", 409);
        if (input.lines.length === 0) throw new AppError("At least one requirement is required", 400);
        if (removed.length) await tx.assetRequestLine.deleteMany({ where: { id: { in: removed.map((line) => line.id) } } });
      }
      // Root-only changes must also validate every retained prepared destination.
      if (data.rootLocationId !== undefined) {
        const lines = await tx.assetRequestLine.findMany({ where: { requestId: id } });
        for (const line of lines) await validatePreparation(tx, rootId, line.preparedRecipientUserId, line.specificLocationId);
      }
      await tx.assetRequest.update({ where: { id }, data });
      const request = await tx.assetRequest.findUniqueOrThrow({ where: { id }, include: REQUEST_RELATIONS });
      const locations = await tx.location.findMany({ select: { id: true, name: true, parentLocationId: true } });
      return withProgress(request, new Map(locations.map((l) => [l.id, l])));
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") throw new AppError("Preparation conflicted with another action; refresh and try again", 409);
    throw error;
  }
}

export async function cancelAssetRequest(id: number) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.assetRequest.findUnique({ where: { id } });
    if (!existing) throw new AppError("Asset Request not found", 404);
    if (existing.status !== AssetRequestStatus.PENDING) throw new AppError("Only PENDING requests can be cancelled", 409);
    const request = await tx.assetRequest.update({
      where: { id },
      data: { status: AssetRequestStatus.CANCELLED },
      include: REQUEST_RELATIONS,
    });
    const locationRows = await tx.location.findMany({ select: { id: true, name: true, parentLocationId: true } });
    return withProgress(request, new Map(locationRows.map((item) => [item.id, item])));
  });
}
