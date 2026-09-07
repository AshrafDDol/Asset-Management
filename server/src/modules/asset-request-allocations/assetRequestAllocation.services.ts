import {
  AssignmentStatus,
  ConfirmationSource,
  ConfirmationType,
  EpcStatus,
  AssetRequestStatus,
  AssetStatus,
  MovementType,
  Prisma,
  RequestAllocationStatus,
} from "@prisma/client";
import { prisma } from "../../config/prisma";
import { AppError } from "../../utils/AppError";
import { calculateLineProgress } from "../asset-requests/assetRequest.progress";
import { recalculateRequestStatus } from "../asset-requests/assetRequest.lifecycle";
import { validateRequestDestination } from "../asset-requests/requestLocation";
import { validateHomeLocation } from "../assets/assetHome";
import { randomUUID } from "crypto";
import { AvailableAssetFilters, ConfirmIssueInput, IssueAssetInput, ReserveAssetInput } from "./assetRequestAllocation.types";
import { loadLocationHierarchy, resolveLocationDepartment } from "../locations/locationHierarchy";

const ACTIVE_ALLOCATION_STATUSES = [
  RequestAllocationStatus.RESERVED,
  RequestAllocationStatus.ISSUED,
  RequestAllocationStatus.CONFIRMED,
  RequestAllocationStatus.RETURN_PENDING,
];
const RESERVABLE_REQUEST_STATUSES: AssetRequestStatus[] = [AssetRequestStatus.PENDING, AssetRequestStatus.PROCESSING];
const ALLOCATION_INCLUDE = {
  reservedBy: { select: { id: true, username: true, fullName: true } },
  asset: {
    include: {
      bladeSku: { select: { id: true, skuCode: true, name: true } },
      category: { select: { id: true, categoryCode: true, name: true } },
      epc: { select: { id: true, epcCode: true, status: true, isActive: true } },
      location: { select: { id: true, locationCode: true, name: true, locationType: true, parentLocationId: true } },
    },
  },
  requestLine: {
    include: {
      bladeSku: { select: { id: true, skuCode: true, name: true } },
      assetCategory: { select: { id: true, categoryCode: true, name: true } },
      request: { include: { machine: { select: { id: true, machineCode: true, machineName: true } } } },
    },
  },
  assignment: {
    include: {
      assignedToUser: { select: { id: true, username: true, fullName: true } },
      assignedByUser: { select: { id: true, username: true, fullName: true } },
      location: { select: { id: true, locationCode: true, name: true, locationType: true, parentLocationId: true } },
    },
  },
};

type LocationNode = { id: number; name: string; parentLocationId: number | null };
function buildLocationPath(locationId: number | null, locations: Map<number, LocationNode>) {
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

async function locationMap(client: Prisma.TransactionClient | typeof prisma) {
  const rows = await client.location.findMany({ select: { id: true, name: true, parentLocationId: true } });
  return new Map(rows.map((item) => [item.id, item]));
}

function addAllocationPath<T extends { asset: { locationId: number | null } }>(allocation: T, locations: Map<number, LocationNode>) {
  return { ...allocation, asset: { ...allocation.asset, locationPath: buildLocationPath(allocation.asset.locationId, locations) } };
}

function transactionConflict(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2034") throw new AppError("Operation conflicted with another request; refresh and try again", 409);
    if (error.code === "P2002") throw new AppError("This allocation or asset has already been processed", 409);
  }
  throw error;
}

export async function issueAsset(allocationId: number, input: IssueAssetInput, assignedByUserId: number) {
  if (!Number.isInteger(allocationId) || allocationId <= 0) throw new AppError("Invalid allocation ID", 400);


  try {
    return await prisma.$transaction(async (tx) => {
      const allocation = await tx.assetRequestAllocation.findUnique({
        where: { id: allocationId },
        include: {
          assignment: true,
          asset: true,
          requestLine: { include: { request: true } },
        },
      });
      if (!allocation) throw new AppError("Asset Request allocation not found", 404);
      if (allocation.status !== RequestAllocationStatus.RESERVED) throw new AppError("Only RESERVED allocations can be issued", 409);
      if (allocation.requestLine.request.status !== AssetRequestStatus.PROCESSING) throw new AppError("Only PROCESSING requests can be issued", 409);
      if (allocation.assignment) throw new AppError("This allocation has already created an assignment", 409);
      const assignedToUserId = allocation.requestLine.preparedRecipientUserId;
      const productionLocationId = allocation.requestLine.specificLocationId;
      if (!assignedToUserId) throw new AppError("Needs Recipient: complete preparation in Requesting", 409);
      if (!productionLocationId) throw new AppError("Needs Specific Location: complete preparation in Requesting", 409);
      if ((input.assignedToUserId !== undefined && Number(input.assignedToUserId) !== assignedToUserId) || ((input.specificLocationId ?? input.productionLocationId) !== undefined && Number(input.specificLocationId ?? input.productionLocationId) !== productionLocationId)) throw new AppError("Issue uses stored preparation; change it in Requesting before issue", 409);
      await validateHomeLocation(tx, allocation.asset.homeLocationId);
      if (allocation.asset.status !== AssetStatus.RESERVED) throw new AppError("Allocated asset is not RESERVED", 409);
      if (allocation.requestLine.assetCategoryId && allocation.asset.categoryId !== allocation.requestLine.assetCategoryId) throw new AppError("Asset Category no longer matches the request line", 409);
      if (allocation.requestLine.measurementHeight && !allocation.asset.measurementHeight?.equals(allocation.requestLine.measurementHeight)) throw new AppError("Asset measurement height no longer matches the request line", 409);
      if (allocation.requestLine.measurementWidth && !allocation.asset.measurementWidth?.equals(allocation.requestLine.measurementWidth)) throw new AppError("Asset measurement width no longer matches the request line", 409);

      const [recipient, issuer, productionLocation, activeAssignment] = await Promise.all([
        tx.user.findUnique({ where: { id: assignedToUserId } }),
        tx.user.findUnique({ where: { id: assignedByUserId } }),
        tx.location.findUnique({ where: { id: productionLocationId } }),
        tx.assetAssignment.findFirst({ where: { assetId: allocation.assetId, status: AssignmentStatus.ACTIVE, isActive: true } }),
      ]);
      if (!recipient || !recipient.isActive) throw new AppError("Invalid or inactive Recipient", 400);
      if (!issuer || !issuer.isActive) throw new AppError("Authenticated issuer is invalid or inactive", 400);
      if (!productionLocation || !productionLocation.isActive) throw new AppError("Invalid or inactive Specific Location", 400);
      await validateRequestDestination(tx, allocation.requestLine.request.rootLocationId, productionLocationId);
      if (activeAssignment) throw new AppError("Asset already has an active assignment", 409);
      const locationHierarchy = await loadLocationHierarchy(tx);
      const operationDepartment = resolveLocationDepartment(productionLocationId, locationHierarchy);

      const issuedAt = new Date();
      const assignment = await tx.assetAssignment.create({
        data: {
          assignmentNo: `ASG-${randomUUID()}`,
          requestAllocationId: allocation.id,
          assetId: allocation.assetId,
          assignedToUserId,
          assignedByUserId,
          departmentId: operationDepartment?.id ?? null,
          locationId: productionLocationId,
          assignedDate: issuedAt,
          issuedAt,
          status: AssignmentStatus.ACTIVE,
          isActive: true,
          purpose: `Asset Request ${allocation.requestLine.request.requestNo}`,
          remarks: input.remarks?.trim() || null,
        },
      });

      const allocationUpdate = await tx.assetRequestAllocation.updateMany({
        where: { id: allocation.id, status: RequestAllocationStatus.RESERVED },
        data: { status: RequestAllocationStatus.ISSUED },
      });
      if (allocationUpdate.count !== 1) throw new AppError("Allocation was already issued or changed", 409);

      const assetUpdate = await tx.asset.updateMany({
        where: { id: allocation.assetId, status: AssetStatus.RESERVED },
        data: { status: AssetStatus.PENDING_CONFIRMATION },
      });
      if (assetUpdate.count !== 1) throw new AppError("Reserved asset could not be issued", 409);

      const requestId = allocation.requestLine.requestId;
      await recalculateRequestStatus(tx, requestId);

      const updatedAllocation = await tx.assetRequestAllocation.findUniqueOrThrow({ where: { id: allocation.id }, include: ALLOCATION_INCLUDE });
      const updatedLine = await tx.assetRequestLine.findUniqueOrThrow({ where: { id: allocation.requestLineId }, include: { allocations: { select: { status: true, returnPurpose: true, asset: { select: { status: true } } } } } });
      const request = await tx.assetRequest.findUniqueOrThrow({ where: { id: requestId }, select: { id: true, requestNo: true, status: true } });
      const locations = await locationMap(tx);
      return {
        allocation: addAllocationPath(updatedAllocation, locations),
        assignment,
        lineProgress: calculateLineProgress(updatedLine),
        request,
        productionLocationType: productionLocation.locationType,
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    transactionConflict(error);
  }
}

export async function confirmIssue(allocationId: number, input: ConfirmIssueInput, confirmedByUserId: number) {
  if (!Number.isInteger(allocationId) || allocationId <= 0) throw new AppError("Invalid allocation ID", 400);
  const epc = input.epc?.trim().toUpperCase();
  if (!epc) throw new AppError("EPC is required", 400);

  try {
    return await prisma.$transaction(async (tx) => {
      const allocation = await tx.assetRequestAllocation.findUnique({
        where: { id: allocationId },
        include: {
          asset: true,
          assignment: { include: { assignedToUser: true, location: true } },
          requestLine: { include: { request: true } },
        },
      });
      if (!allocation) throw new AppError("Asset Request allocation not found", 404);
      if (allocation.status !== RequestAllocationStatus.ISSUED) throw new AppError("Only ISSUED allocations can be confirmed", 409);
      if (allocation.asset.status !== AssetStatus.PENDING_CONFIRMATION) throw new AppError("Allocated asset is not PENDING_CONFIRMATION", 409);
      if (!allocation.assignment || allocation.assignment.status !== AssignmentStatus.ACTIVE || !allocation.assignment.isActive || allocation.assignment.returnedAt) {
        throw new AppError("Active assignment for this allocation was not found", 409);
      }
      const productionLocation = allocation.assignment.location;
      if (!productionLocation || !productionLocation.isActive) {
        throw new AppError("Assignment Specific Location is invalid or inactive", 409);
      }

      await validateRequestDestination(tx, allocation.requestLine.request.rootLocationId, productionLocation.id);
      const [submittedEpc, confirmer] = await Promise.all([
        tx.assetEpc.findUnique({ where: { epcCode: epc } }),
        tx.user.findUnique({ where: { id: confirmedByUserId } }),
      ]);
      if (!confirmer || !confirmer.isActive) throw new AppError("Authenticated confirmation user is invalid or inactive", 400);
      if (!submittedEpc || !submittedEpc.isActive || submittedEpc.status !== EpcStatus.ACTIVE || submittedEpc.assetId !== allocation.assetId) {
        throw new AppError("EPC does not match the expected active Asset EPC", 409);
      }

      const allocationUpdate = await tx.assetRequestAllocation.updateMany({
        where: { id: allocation.id, status: RequestAllocationStatus.ISSUED },
        data: { status: RequestAllocationStatus.CONFIRMED },
      });
      if (allocationUpdate.count !== 1) throw new AppError("Issue confirmation was already processed", 409);

      const assetUpdate = await tx.asset.updateMany({
        where: { id: allocation.assetId, status: AssetStatus.PENDING_CONFIRMATION },
        data: {
          status: AssetStatus.IN_USE,
          locationId: productionLocation.id,
        },
      });
      if (assetUpdate.count !== 1) throw new AppError("Asset issue confirmation was already processed", 409);

      const confirmedAt = new Date();
      const locationHierarchy = await loadLocationHierarchy(tx);
      const fromDepartment = resolveLocationDepartment(allocation.asset.locationId, locationHierarchy);
      const toDepartment = resolveLocationDepartment(productionLocation.id, locationHierarchy);
      await tx.assetMovement.create({
        data: {
          movementNo: `MOV-${randomUUID()}`,
          assetId: allocation.assetId,
          fromDepartmentId: fromDepartment?.id ?? null,
          toDepartmentId: toDepartment?.id ?? null,
          fromLocationId: allocation.asset.locationId,
          toLocationId: productionLocation.id,
          movedByUserId: confirmedByUserId,
          movementType: MovementType.LOCATION_TRANSFER,
          movementDate: confirmedAt,
          reason: `ISSUE CONFIRMED: ${allocation.requestLine.request.requestNo}`,
          remarks: input.remarks?.trim() || null,
        },
      });
      await tx.assetScanConfirmation.create({
        data: {
          assetId: allocation.assetId,
          requestAllocationId: allocation.id,
          assignmentId: allocation.assignment.id,
          confirmationType: ConfirmationType.ISSUE_CONFIRMATION,
          confirmationSource: ConfirmationSource.WEB_ADMIN,
          epc,
          confirmedByUserId,
          confirmedAt,
          remarks: input.remarks?.trim() || null,
        },
      });

      await recalculateRequestStatus(tx, allocation.requestLine.requestId);
      const updatedAllocation = await tx.assetRequestAllocation.findUniqueOrThrow({ where: { id: allocation.id }, include: ALLOCATION_INCLUDE });
      const request = await tx.assetRequest.findUniqueOrThrow({ where: { id: allocation.requestLine.requestId }, select: { id: true, requestNo: true, status: true } });
      const locations = await locationMap(tx);
      return { allocation: addAllocationPath(updatedAllocation, locations), request };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    transactionConflict(error);
  }
}

export async function getAvailableAssets(requestId: number, lineId: number, filters: AvailableAssetFilters = {}) {
  const line = await prisma.assetRequestLine.findFirst({
    where: { id: lineId, requestId },
    include: { request: true, bladeSku: true, assetCategory: true },
  });
  if (!line) throw new AppError("Asset Request line not found", 404);
  if (!line.assetCategoryId || !line.measurementHeight || !line.measurementWidth) {
    throw new AppError("Legacy request line does not contain Category and Measurement requirements", 409);
  }
  if (!RESERVABLE_REQUEST_STATUSES.includes(line.request.status)) {
    throw new AppError("Assets are not available for selection in the current request status", 409);
  }
  const search = filters.search?.trim();
  const assets = await prisma.asset.findMany({
    where: {
      categoryId: line.assetCategoryId,
      measurementHeight: line.measurementHeight,
      measurementWidth: line.measurementWidth,
      status: AssetStatus.AVAILABLE,
      isActive: true,
      homeLocationId: { not: null },
      homeLocation: { is: { isActive: true, locationType: { in: ["STORE", "WAREHOUSE", "RACK", "LEVEL", "BIN", "FILE"] } } },
      locationId: filters.locationId,
      location: { isNot: null },
      OR: search ? [
        { assetCode: { contains: search } },
        { itemName: { contains: search } },
        { epc: { is: { epcCode: { contains: search } } } },
        { location: { is: { locationCode: { contains: search } } } },
        { location: { is: { name: { contains: search } } } },
      ] : undefined,
    },
    include: {
      bladeSku: { select: { id: true, skuCode: true, name: true } },
      category: { select: { id: true, categoryCode: true, name: true } },
      epc: { select: { id: true, epcCode: true, status: true, isActive: true } },
      location: { select: { id: true, locationCode: true, name: true, locationType: true, parentLocationId: true } },
    },
    orderBy: { assetCode: "asc" },
  });
  const locations = await locationMap(prisma);
  return assets.map((asset) => ({ ...asset, locationPath: buildLocationPath(asset.locationId, locations) }));
}

export async function reserveAsset(requestId: number, lineId: number, input: ReserveAssetInput, reservedByUserId: number) {
  const assetId = Number(input.assetId);
  if (!Number.isInteger(assetId) || assetId <= 0) throw new AppError("Asset is required", 400);
  try {
    return await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: reservedByUserId } });
      if (!user || !user.isActive) throw new AppError("Authenticated reserver is invalid or inactive", 400);

      const line = await tx.assetRequestLine.findFirst({
        where: { id: lineId, requestId },
        include: { request: true, allocations: { select: { status: true, returnPurpose: true, asset: { select: { status: true } } } } },
      });
      if (!line) throw new AppError("Asset Request line not found", 404);
      if (!line.assetCategoryId || !line.measurementHeight || !line.measurementWidth) {
        throw new AppError("Legacy request line does not contain Category and Measurement requirements", 409);
      }
      if (!RESERVABLE_REQUEST_STATUSES.includes(line.request.status)) {
        throw new AppError("Request cannot accept reservations in its current status", 409);
      }
      const lineProgress = calculateLineProgress(line);
      if (lineProgress.remainingToReserve <= 0) throw new AppError("Requested quantity is already fully reserved", 409);

      const asset = await tx.asset.findUnique({ where: { id: assetId }, include: { location: true } });
      if (!asset || !asset.isActive) throw new AppError("Asset not found or inactive", 400);
      await validateHomeLocation(tx, asset.homeLocationId);
      if (asset.categoryId !== line.assetCategoryId) throw new AppError("Asset Category does not match the request line", 400);
      if (!asset.measurementHeight?.equals(line.measurementHeight) || !asset.measurementWidth?.equals(line.measurementWidth)) throw new AppError("Asset measurements do not match the request line", 400);
      if (asset.status !== AssetStatus.AVAILABLE) throw new AppError("Asset is no longer AVAILABLE", 409);
      if (!asset.locationId || !asset.location) throw new AppError("Asset does not have a readable current location", 400);

      const activeAllocation = await tx.assetRequestAllocation.findFirst({
        where: { assetId, status: { in: ACTIVE_ALLOCATION_STATUSES } },
      });
      if (activeAllocation) throw new AppError("Asset already has an active allocation", 409);

      const claim = await tx.asset.updateMany({
        where: { id: assetId, isActive: true, categoryId: line.assetCategoryId, measurementHeight: line.measurementHeight, measurementWidth: line.measurementWidth, status: AssetStatus.AVAILABLE },
        data: { status: AssetStatus.RESERVED },
      });
      if (claim.count !== 1) throw new AppError("Asset is no longer available", 409);

      const allocation = await tx.assetRequestAllocation.create({
        data: {
          requestLineId: lineId,
          assetId,
          reservedByUserId,
          remarks: input.remarks?.trim() || null,
        },
        include: ALLOCATION_INCLUDE,
      });
      await recalculateRequestStatus(tx, requestId);
      const updatedLine = await tx.assetRequestLine.findUniqueOrThrow({
        where: { id: lineId },
        include: { allocations: { select: { status: true, returnPurpose: true, asset: { select: { status: true } } } } },
      });
      const request = await tx.assetRequest.findUniqueOrThrow({ where: { id: requestId }, select: { id: true, requestNo: true, status: true } });
      const locations = await locationMap(tx);
      return {
        allocation: addAllocationPath(allocation, locations),
        lineProgress: calculateLineProgress(updatedLine),
        request,
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    transactionConflict(error);
  }
}

export async function cancelReservation(allocationId: number) {
  if (!Number.isInteger(allocationId) || allocationId <= 0) throw new AppError("Invalid allocation ID", 400);
  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.assetRequestAllocation.findUnique({
        where: { id: allocationId },
        include: { requestLine: { include: { request: true } }, asset: true },
      });
      if (!existing) throw new AppError("Asset Request allocation not found", 404);
      if (existing.status !== RequestAllocationStatus.RESERVED) throw new AppError("Only RESERVED allocations can be cancelled", 409);
      if (existing.asset.status !== AssetStatus.RESERVED) throw new AppError("Allocated asset is not RESERVED", 409);

      const cancel = await tx.assetRequestAllocation.updateMany({
        where: { id: allocationId, status: RequestAllocationStatus.RESERVED },
        data: { status: RequestAllocationStatus.CANCELLED, cancelledAt: new Date() },
      });
      if (cancel.count !== 1) throw new AppError("Reservation was already changed", 409);
      const release = await tx.asset.updateMany({
        where: { id: existing.assetId, status: AssetStatus.RESERVED },
        data: { status: AssetStatus.AVAILABLE },
      });
      if (release.count !== 1) throw new AppError("Reserved asset could not be released", 409);

      const requestId = existing.requestLine.requestId;
      await recalculateRequestStatus(tx, requestId);
      const allocation = await tx.assetRequestAllocation.findUniqueOrThrow({ where: { id: allocationId }, include: ALLOCATION_INCLUDE });
      const line = await tx.assetRequestLine.findUniqueOrThrow({ where: { id: existing.requestLineId }, include: { allocations: { select: { status: true, returnPurpose: true, asset: { select: { status: true } } } } } });
      const request = await tx.assetRequest.findUniqueOrThrow({ where: { id: requestId }, select: { id: true, requestNo: true, status: true } });
      const locations = await locationMap(tx);
      return {
        allocation: addAllocationPath(allocation, locations),
        lineProgress: calculateLineProgress(line),
        request,
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    transactionConflict(error);
  }
}
