import { AssetStatus } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { AppError } from "../../utils/AppError";
import {
  CreateAssetAssignmentInput,
  UpdateAssetAssignmentInput,
} from "./assetAssignment.types";

const ASSET_ASSIGNMENT_SELECT = {
  id: true,
  assignmentNo: true,
  assetId: true,
  assignedToUserId: true,
  assignedByUserId: true,
  departmentId: true,
  locationId: true,
  assignedDate: true,
  returnDueDate: true,
  returnedAt: true,
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
        departmentId: input.departmentId,
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

export async function returnAssetAssignment(id: number) {
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
    throw new AppError("Asset assignment is already closed", 400);
  }

  const result = await prisma.$transaction(async (tx) => {
    const assignment = await tx.assetAssignment.update({
      where: { id },
      data: {
        status: "RETURNED",
        returnedAt: new Date(),
        isActive: false,
      },
      select: ASSET_ASSIGNMENT_SELECT,
    });

    await tx.asset.update({
      where: { id: existingAssignment.assetId },
      data: {
        status: AssetStatus.AVAILABLE,
      },
    });

    return assignment;
  });

  return result;
}