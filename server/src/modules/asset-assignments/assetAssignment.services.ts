import { AssignmentStatus, Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { AppError } from "../../utils/AppError";

const SELECT = {
  id: true, assignmentNo: true, assetId: true, assignedToUserId: true, assignedByUserId: true,
  departmentId: true, locationId: true, issueBatchItemId: true, assignedDate: true, issuedAt: true,
  returnDueDate: true, returnedAt: true, returnCondition: true, returnLocationId: true, returnRemarks: true,
  returnedByUserId: true, status: true, purpose: true, remarks: true, isActive: true, createdAt: true, updatedAt: true,
  asset: { select: { id: true, assetCode: true, itemName: true, serialNumber: true, brand: true, model: true, status: true, condition: true } },
  assignedToUser: { select: { id: true, username: true, fullName: true, email: true } },
  assignedByUser: { select: { id: true, username: true, fullName: true } },
  department: { select: { id: true, departmentCode: true, name: true } },
  location: { select: { id: true, locationCode: true, name: true } },
  returnLocation: { select: { id: true, locationCode: true, name: true, locationType: true } },
  returnedByUser: { select: { id: true, username: true, fullName: true } },
} satisfies Prisma.AssetAssignmentSelect;

export async function getAllAssetAssignments() { return prisma.assetAssignment.findMany({ select: SELECT, orderBy: { createdAt: "desc" } }); }
export async function getAssetAssignmentById(id: number) { if (!id) throw new AppError("Invalid assignment ID", 400); const row = await prisma.assetAssignment.findUnique({ where: { id }, select: SELECT }); if (!row) throw new AppError("Asset assignment not found", 404); return row; }
export async function getCurrentAssetAssignment(assetId: number) { if (!assetId) throw new AppError("Invalid Asset ID", 400); const row = await prisma.assetAssignment.findFirst({ where: { assetId, status: AssignmentStatus.ACTIVE, isActive: true }, select: SELECT, orderBy: { createdAt: "desc" } }); if (!row) throw new AppError("No active assignment found for this Asset", 404); return row; }
