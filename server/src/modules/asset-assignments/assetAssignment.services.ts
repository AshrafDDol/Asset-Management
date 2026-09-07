import { randomUUID } from "crypto";
import { AssetCondition, AssetStatus, AssignmentStatus, ConfirmationSource, ConfirmationType, EpcStatus, LocationType, MovementType, Prisma, RequestAllocationStatus } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { AppError } from "../../utils/AppError";
import { validateHomeLocation } from "../assets/assetHome";
import {
  CreateAssetAssignmentInput,
  UpdateAssetAssignmentInput,
  ReturnAssetAssignmentInput,
  InitiateReturnInput,
  ConfirmReturnInput,
} from "./assetAssignment.types";
import { recalculateRequestStatus } from "../asset-requests/assetRequest.lifecycle";
import { loadLocationHierarchy, resolveLocationDepartment } from "../locations/locationHierarchy";

const ASSET_ASSIGNMENT_SELECT = {
  id: true,
  assignmentNo: true,
  assetId: true,
  assignedToUserId: true,
  assignedByUserId: true,
  departmentId: true,
  locationId: true,
  requestAllocationId: true,
  assignedDate: true,
  issuedAt: true,
  returnDueDate: true,
  returnedAt: true,
  returnCondition: true,
  returnLocationId: true,
  returnRemarks: true,
  returnedByUserId: true,
  status: true,
  purpose: true,
  remarks: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  asset: {
    select: {
      id: true,
      assetCode: true,
      itemName: true,
      serialNumber: true,
      brand: true,
      model: true,
      status: true,
      condition: true,
    },
  },
  assignedToUser: {
    select: {
      id: true,
      username: true,
      fullName: true,
      email: true,
    },
  },
  assignedByUser: {
    select: {
      id: true,
      username: true,
      fullName: true,
    },
  },
  department: {
    select: {
      id: true,
      departmentCode: true,
      name: true,
    },
  },
  location: {
    select: {
      id: true,
      locationCode: true,
      name: true,
    },
  },
  returnLocation: { select: { id: true, locationCode: true, name: true, locationType: true } },
  returnedByUser: { select: { id: true, username: true, fullName: true } },
};

function generateAssignmentNo() {
  return `ASG-${Date.now()}`;
}

function parseDate(value?: string | null) {
  if (!value) return value === null ? null : undefined;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new AppError("Invalid date format", 400);
  }

  return date;
}

async function validateUser(userId?: number) {
  if (!userId) return;

  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user || !user.isActive) {
    throw new AppError("Invalid or inactive user", 400);
  }
}

async function validateDepartment(departmentId?: number | null) {
  if (!departmentId) return;

  const department = await prisma.department.findUnique({
    where: { id: departmentId },
  });

  if (!department || !department.isActive) {
    throw new AppError("Invalid or inactive department", 400);
  }
}

async function validateLocation(locationId?: number | null) {
  if (!locationId) return;

  const location = await prisma.location.findUnique({
    where: { id: locationId },
  });

  if (!location || !location.isActive) {
    throw new AppError("Invalid or inactive location", 400);
  }
}

export async function getAllAssetAssignments() {
  return prisma.assetAssignment.findMany({
    select: ASSET_ASSIGNMENT_SELECT,
    orderBy: {
      createdAt: "desc",
    },
  });
}

export async function getAssetAssignmentById(id: number) {
  if (!id) {
    throw new AppError("Invalid assignment ID", 400);
  }

  const assignment = await prisma.assetAssignment.findUnique({
    where: { id },
    select: ASSET_ASSIGNMENT_SELECT,
  });

  if (!assignment) {
    throw new AppError("Asset assignment not found", 404);
  }

  return assignment;
}

export async function getCurrentAssetAssignment(assetId: number) {
  if (!assetId) {
    throw new AppError("Invalid asset ID", 400);
  }

  const assignment = await prisma.assetAssignment.findFirst({
    where: {
      assetId,
      status: "ACTIVE",
      isActive: true,
    },
    select: ASSET_ASSIGNMENT_SELECT,
    orderBy: {
      createdAt: "desc",
    },
  });

  if (!assignment) {
    throw new AppError("No active assignment found for this asset", 404);
  }

  return assignment;
}

export async function createAssetAssignment(
  input: CreateAssetAssignmentInput,
  assignedByUserId: number
) {
  if (!input.assetId) {
    throw new AppError("Asset is required", 400);
  }

  if (!input.assignedToUserId) {
    throw new AppError("Assigned user is required", 400);
  }

  const asset = await prisma.asset.findUnique({
    where: { id: input.assetId },
  });

  if (!asset || !asset.isActive) {
    throw new AppError("Invalid or inactive asset", 400);
  }

  if (asset.status === AssetStatus.RESERVED) {
    throw new AppError("Request-reserved assets must be issued through the Asset Request workflow", 409);
  }

  if (asset.status === "LOST" || asset.status === "DISPOSED") {
    throw new AppError("Lost or disposed asset cannot be assigned", 400);
  }

  const activeAssignment = await prisma.assetAssignment.findFirst({
    where: {
      assetId: input.assetId,
      status: "ACTIVE",
      isActive: true,
    },
  });

  if (activeAssignment) {
    throw new AppError("This asset is already assigned", 409);
  }

  await validateUser(input.assignedToUserId);
  await validateUser(assignedByUserId);
  await validateDepartment(input.departmentId);
  await validateLocation(input.locationId);

  const result = await prisma.$transaction(async (tx) => {
    const assignment = await tx.assetAssignment.create({
      data: {
        assignmentNo: generateAssignmentNo(),
        assetId: input.assetId,
        assignedToUserId: input.assignedToUserId,
        assignedByUserId,
        departmentId: input.departmentId,
        locationId: input.locationId,
        assignedDate: parseDate(input.assignedDate) || new Date(),
        returnDueDate: parseDate(input.returnDueDate) || null,
        purpose: input.purpose?.trim(),
        remarks: input.remarks,
      },
      select: ASSET_ASSIGNMENT_SELECT,
    });

    await tx.asset.update({
      where: { id: input.assetId },
      data: {
        status: AssetStatus.ASSIGNED,
        locationId: input.locationId,
      },
    });

    return assignment;
  });

  return result;
}

export async function updateAssetAssignment(
  id: number,
  input: UpdateAssetAssignmentInput
) {
  if (!id) {
    throw new AppError("Invalid assignment ID", 400);
  }

  const existingAssignment = await prisma.assetAssignment.findUnique({
    where: { id },
  });

  if (!existingAssignment) {
    throw new AppError("Asset assignment not found", 404);
  }

  if (existingAssignment.status !== "ACTIVE") {
    throw new AppError("Only active assignment can be updated", 400);
  }

  await validateUser(input.assignedToUserId);
  await validateDepartment(input.departmentId);
  await validateLocation(input.locationId);

  const assignment = await prisma.assetAssignment.update({
    where: { id },
    data: {
      assignedToUserId: input.assignedToUserId,
      departmentId: input.departmentId,
      locationId: input.locationId,
      assignedDate: parseDate(input.assignedDate) ?? undefined,
      returnDueDate: parseDate(input.returnDueDate) ?? undefined,
      purpose: input.purpose?.trim(),
      remarks: input.remarks,
    },
    select: ASSET_ASSIGNMENT_SELECT,
  });

  return assignment;
}

const STORAGE_LOCATION_TYPES: LocationType[] = [
  LocationType.STORE,
  LocationType.WAREHOUSE,
  LocationType.RACK,
  LocationType.LEVEL,
  LocationType.BIN,
  LocationType.FILE,
];

function returnConflict(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
    throw new AppError("Return conflicted with another operation; refresh and try again", 409);
  }
  throw error;
}

function requiredReturnCondition(value: string | undefined) {
  if (!value || !Object.values(AssetCondition).includes(value as AssetCondition)) throw new AppError("Valid return condition is required", 400);
  return value as AssetCondition;
}

async function storageReturnLocation(tx: Prisma.TransactionClient, value: number) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new AppError("Return location must be a valid ID", 400);
  const location = await tx.location.findUnique({ where: { id } });
  if (!location || !location.isActive) throw new AppError("Invalid or inactive return location", 400);
  if (!STORAGE_LOCATION_TYPES.includes(location.locationType)) throw new AppError("Return location must be a storage-compatible location", 400);
  return location;
}

export async function initiateAssetReturn(id: number, input: InitiateReturnInput = {}) {
  const returnPurpose = input.returnPurpose ?? "NORMAL_RETURN";
  if (!["NORMAL_RETURN", "SWAP"].includes(returnPurpose)) throw new AppError("Invalid return purpose", 400);
  const reasons = ["WRONG_ASSET", "NOT_SUITABLE", "WRONG_MEASUREMENT", "CONDITION_ISSUE", "OTHER"] as const;
  const swapReason = input.swapReason as typeof reasons[number];
  if (returnPurpose === "SWAP" && (!reasons.includes(swapReason) || (swapReason === "OTHER" && !input.remarks?.trim()))) throw new AppError("A valid Swap Reason is required; Other also requires remarks", 400);
  if (input.remarks && input.remarks.trim().length > 191) throw new AppError("Remarks must be at most 191 characters", 400);
  if (!Number.isInteger(id) || id <= 0) throw new AppError("Invalid assignment ID", 400);
  try {
    return await prisma.$transaction(async (tx) => {
      const assignment = await tx.assetAssignment.findUnique({
        where: { id },
        include: { asset: true, requestAllocation: { include: { requestLine: true } } },
      });
      if (!assignment) throw new AppError("Asset assignment not found", 404);
      if (!assignment.requestAllocationId || !assignment.requestAllocation) throw new AppError("Only request-driven assignments use return initiation", 409);
      if (assignment.status !== AssignmentStatus.ACTIVE || !assignment.isActive || assignment.returnedAt) throw new AppError("Assignment is already closed or returned", 409);
      if (assignment.requestAllocation.status !== RequestAllocationStatus.CONFIRMED) throw new AppError("Only CONFIRMED allocations can initiate return", 409);
      if (assignment.asset.status !== AssetStatus.IN_USE) throw new AppError("Confirmed Asset is not IN_USE", 409);

      const allocationUpdate = await tx.assetRequestAllocation.updateMany({
        where: { id: assignment.requestAllocationId, status: RequestAllocationStatus.CONFIRMED },
        data: { status: RequestAllocationStatus.RETURN_PENDING, returnPurpose, swapReason: returnPurpose === "SWAP" ? swapReason : null, swapRemarks: returnPurpose === "SWAP" ? input.remarks?.trim() || null : null },
      });
      if (allocationUpdate.count !== 1) throw new AppError("Return was already initiated or allocation changed", 409);
      const assetUpdate = await tx.asset.updateMany({
        where: { id: assignment.assetId, status: AssetStatus.IN_USE },
        data: { status: AssetStatus.RETURN_PENDING },
      });
      if (assetUpdate.count !== 1) throw new AppError("Return was already initiated or Asset changed", 409);
      if (input.remarks?.trim()) {
        await tx.assetAssignment.update({ where: { id }, data: { returnRemarks: input.remarks.trim() } });
      }
      await recalculateRequestStatus(tx, assignment.requestAllocation.requestLine.requestId);
      return tx.assetAssignment.findUniqueOrThrow({ where: { id }, select: ASSET_ASSIGNMENT_SELECT });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    returnConflict(error);
  }
}

export async function confirmAssetReturn(id: number, input: ConfirmReturnInput, returnedByUserId: number) {
  if (!Number.isInteger(id) || id <= 0) throw new AppError("Invalid assignment ID", 400);
  const epc = input.epc?.trim().toUpperCase();
  if (!epc) throw new AppError("EPC is required", 400);
  const condition = requiredReturnCondition(input.condition);

  try {
    return await prisma.$transaction(async (tx) => {
      const assignment = await tx.assetAssignment.findUnique({
        where: { id },
        include: {
          asset: true,
          requestAllocation: { include: { requestLine: { include: { request: true } } } },
        },
      });
      if (!assignment) throw new AppError("Asset assignment not found", 404);
      if (!assignment.requestAllocationId || !assignment.requestAllocation) throw new AppError("Return confirmation requires a request-driven assignment", 409);
      if (assignment.status !== AssignmentStatus.ACTIVE || !assignment.isActive || assignment.returnedAt) throw new AppError("Assignment is already closed or returned", 409);
      if (assignment.requestAllocation.status !== RequestAllocationStatus.RETURN_PENDING) throw new AppError("Allocation is not RETURN_PENDING", 409);
      if (assignment.asset.status !== AssetStatus.RETURN_PENDING) throw new AppError("Asset is not RETURN_PENDING", 409);

      const [submittedEpc, processor, returnLocation] = await Promise.all([
        tx.assetEpc.findUnique({ where: { epcCode: epc } }),
        tx.user.findUnique({ where: { id: returnedByUserId } }),
        validateHomeLocation(tx, assignment.asset.homeLocationId),
      ]);
      if (!processor || !processor.isActive) throw new AppError("Authenticated return user is invalid or inactive", 400);
      if (input.returnLocationId !== undefined && Number(input.returnLocationId) !== returnLocation.id) throw new AppError("Return destination is the Asset home location and cannot be overridden", 409);
      if (!submittedEpc || !submittedEpc.isActive || submittedEpc.status !== EpcStatus.ACTIVE || submittedEpc.assetId !== assignment.assetId) {
        throw new AppError("EPC does not match the expected active Asset EPC", 409);
      }

      const returnedAt = new Date();
      const assignmentUpdate = await tx.assetAssignment.updateMany({
        where: { id, status: AssignmentStatus.ACTIVE, isActive: true, returnedAt: null },
        data: {
          status: AssignmentStatus.RETURNED,
          isActive: false,
          returnedAt,
          returnCondition: condition,
          returnLocationId: returnLocation.id,
          returnRemarks: input.remarks?.trim() || assignment.returnRemarks,
          returnedByUserId,
        },
      });
      if (assignmentUpdate.count !== 1) throw new AppError("Return confirmation was already processed", 409);
      const allocationUpdate = await tx.assetRequestAllocation.updateMany({
        where: { id: assignment.requestAllocationId, status: RequestAllocationStatus.RETURN_PENDING },
        data: { status: RequestAllocationStatus.RETURNED },
      });
      if (allocationUpdate.count !== 1) throw new AppError("Return confirmation was already processed", 409);
      const assetUpdate = await tx.asset.updateMany({
        where: { id: assignment.assetId, status: AssetStatus.RETURN_PENDING },
        data: { status: AssetStatus.AVAILABLE, locationId: returnLocation.id, condition },
      });
      if (assetUpdate.count !== 1) throw new AppError("Return confirmation was already processed", 409);

      const locationHierarchy = await loadLocationHierarchy(tx);
      const fromDepartment = resolveLocationDepartment(assignment.asset.locationId, locationHierarchy);
      const toDepartment = resolveLocationDepartment(returnLocation.id, locationHierarchy);
      await tx.assetMovement.create({
        data: {
          movementNo: `MOV-${randomUUID()}`,
          assetId: assignment.assetId,
          fromDepartmentId: fromDepartment?.id ?? null,
          toDepartmentId: toDepartment?.id ?? null,
          fromLocationId: assignment.asset.locationId,
          toLocationId: returnLocation.id,
          movedByUserId: returnedByUserId,
          movementType: MovementType.LOCATION_TRANSFER,
          movementDate: returnedAt,
          reason: `RETURN CONFIRMED: ${assignment.requestAllocation.requestLine.request.requestNo}`,
          remarks: input.remarks?.trim() || assignment.returnRemarks,
        },
      });
      await tx.assetScanConfirmation.create({
        data: {
          assetId: assignment.assetId,
          requestAllocationId: assignment.requestAllocationId,
          assignmentId: assignment.id,
          confirmationType: ConfirmationType.RETURN_CONFIRMATION,
          confirmationSource: ConfirmationSource.WEB_ADMIN,
          epc,
          confirmedByUserId: returnedByUserId,
          confirmedAt: returnedAt,
          remarks: input.remarks?.trim() || assignment.returnRemarks,
        },
      });
      await recalculateRequestStatus(tx, assignment.requestAllocation.requestLine.requestId);
      return tx.assetAssignment.findUniqueOrThrow({ where: { id }, select: ASSET_ASSIGNMENT_SELECT });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    returnConflict(error);
  }
}

export async function returnAssetAssignment(id: number, input: ReturnAssetAssignmentInput = {}, returnedByUserId?: number) {
  if (!id) {
    throw new AppError("Invalid assignment ID", 400);
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.assetAssignment.findUnique({
        where: { id },
        include: {
          asset: true,
          requestAllocation: { include: { requestLine: { include: { request: true } } } },
        },
      });
      if (!existing) throw new AppError("Asset assignment not found", 404);
      if (existing.status !== AssignmentStatus.ACTIVE || !existing.isActive || existing.returnedAt) {
        throw new AppError("Asset assignment is already closed or returned", 409);
      }
      if (!returnedByUserId) throw new AppError("Authentication is required", 401);
      const processor = await tx.user.findUnique({ where: { id: returnedByUserId } });
      if (!processor || !processor.isActive) throw new AppError("Authenticated return user is invalid or inactive", 400);

      const requestDriven = !!existing.requestAllocationId;
      if (requestDriven && existing.requestAllocation?.status !== RequestAllocationStatus.ISSUED) {
        throw new AppError("New request assignments must use initiate-return and confirm-return; direct return is retained only for legacy ISSUED + IN_USE records", 409);
      }
      if (requestDriven && existing.asset.status !== AssetStatus.IN_USE) {
        throw new AppError("Request-issued asset is not IN_USE", 409);
      }

      const condition = input.condition
        ? Object.values(AssetCondition).includes(input.condition as AssetCondition)
          ? input.condition as AssetCondition
          : (() => { throw new AppError("Invalid return condition", 400); })()
        : undefined;
      const home = requestDriven ? await validateHomeLocation(tx, existing.asset.homeLocationId) : null;
      if (home && input.returnLocationId !== undefined && Number(input.returnLocationId) !== home.id) throw new AppError("Return destination is the Asset home location and cannot be overridden", 409);
      const returnLocationId = home?.id ?? (input.returnLocationId === undefined ? undefined : Number(input.returnLocationId));
      if (returnLocationId !== undefined && (!Number.isInteger(returnLocationId) || returnLocationId <= 0)) {
        throw new AppError("Return location must be a valid ID", 400);
      }
      if (requestDriven && !condition) throw new AppError("Return condition is required", 400);
      if (requestDriven && !returnLocationId) throw new AppError("Return location is required", 400);

      const returnLocation = returnLocationId ? await tx.location.findUnique({ where: { id: returnLocationId } }) : null;
      if (returnLocationId && (!returnLocation || !returnLocation.isActive)) throw new AppError("Invalid or inactive return location", 400);
      if (returnLocation && !STORAGE_LOCATION_TYPES.includes(returnLocation.locationType)) {
        throw new AppError("Return location must be a storage-compatible location", 400);
      }

      const returnedAt = new Date();
      const assignmentUpdate = await tx.assetAssignment.updateMany({
        where: { id, status: AssignmentStatus.ACTIVE, isActive: true, returnedAt: null },
        data: {
          status: AssignmentStatus.RETURNED,
          isActive: false,
          returnedAt,
          returnCondition: condition,
          returnLocationId,
          returnRemarks: input.remarks?.trim() || null,
          returnedByUserId,
        },
      });
      if (assignmentUpdate.count !== 1) throw new AppError("Assignment was already returned or changed", 409);

      if (requestDriven) {
        const allocationUpdate = await tx.assetRequestAllocation.updateMany({
          where: { id: existing.requestAllocationId!, status: RequestAllocationStatus.ISSUED },
          data: { status: RequestAllocationStatus.RETURNED },
        });
        if (allocationUpdate.count !== 1) throw new AppError("Allocation was already returned or changed", 409);
      }

      const requiredAssetStatus = requestDriven ? AssetStatus.IN_USE : existing.asset.status;
      const assetUpdate = await tx.asset.updateMany({
        where: { id: existing.assetId, status: requiredAssetStatus },
        data: {
          status: AssetStatus.AVAILABLE,
          locationId: returnLocationId ?? undefined,
          condition: condition ?? undefined,
        },
      });
      if (assetUpdate.count !== 1) throw new AppError("Asset could not be returned from its current state", 409);

      if (returnLocationId) {
        const locationHierarchy = await loadLocationHierarchy(tx);
        const fromDepartment = resolveLocationDepartment(existing.asset.locationId, locationHierarchy);
        const toDepartment = resolveLocationDepartment(returnLocationId, locationHierarchy);
        await tx.assetMovement.create({
          data: {
            movementNo: `MOV-${randomUUID()}`,
            assetId: existing.assetId,
            fromDepartmentId: fromDepartment?.id ?? null,
            toDepartmentId: toDepartment?.id ?? null,
            fromLocationId: existing.asset.locationId,
            toLocationId: returnLocationId,
            movedByUserId: returnedByUserId,
            movementType: MovementType.LOCATION_TRANSFER,
            movementDate: returnedAt,
            reason: requestDriven ? `RETURN: ${existing.requestAllocation!.requestLine.request.requestNo}` : "RETURN: Legacy assignment",
            remarks: input.remarks?.trim() || null,
          },
        });
      }

      if (requestDriven) {
        await recalculateRequestStatus(tx, existing.requestAllocation!.requestLine.requestId);
      }

      return tx.assetAssignment.findUniqueOrThrow({ where: { id }, select: ASSET_ASSIGNMENT_SELECT });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    returnConflict(error);
  }
}
