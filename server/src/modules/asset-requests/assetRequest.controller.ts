import { NextFunction, Request, Response } from "express";
import { AppError } from "../../utils/AppError";
import { successResponse } from "../../utils/apiResponse";
import {
  cancelAssetRequest,
  createAssetRequest,
  getAllAssetRequests,
  getAssetRequestById,
  updateAssetRequest,
} from "./assetRequest.services";

function optionalId(value: unknown, fieldName: string) {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new AppError(`${fieldName} must be a valid ID`, 400);
  return parsed;
}

export async function getAssetRequestsController(req: Request, res: Response, next: NextFunction) {
  try {
    const requests = await getAllAssetRequests({
      status: typeof req.query.status === "string" ? req.query.status : undefined,
      jobNo: typeof req.query.jobNo === "string" ? req.query.jobNo : undefined,
      requestedBy: optionalId(req.query.requestedBy, "requestedBy"),
      search: typeof req.query.search === "string" ? req.query.search : undefined,
    });
    return successResponse(res, "Asset Requests retrieved successfully", requests);
  } catch (error) { next(error); }
}

export async function getAssetRequestByIdController(req: Request, res: Response, next: NextFunction) {
  try { return successResponse(res, "Asset Request retrieved successfully", await getAssetRequestById(Number(req.params.id))); }
  catch (error) { next(error); }
}

export async function createAssetRequestController(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError("Authentication is required", 401);
    return successResponse(res, "Asset Request created successfully", await createAssetRequest(req.body, req.user.userId), 201);
  } catch (error) { next(error); }
}

export async function updateAssetRequestController(req: Request, res: Response, next: NextFunction) {
  try { return successResponse(res, "Asset Request updated successfully", await updateAssetRequest(Number(req.params.id), req.body)); }
  catch (error) { next(error); }

}

export async function cancelAssetRequestController(req: Request, res: Response, next: NextFunction) {
  try { return successResponse(res, "Asset Request cancelled successfully", await cancelAssetRequest(Number(req.params.id))); }
  catch (error) { next(error); }
}
