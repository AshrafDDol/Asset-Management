import { NextFunction, Request, Response } from "express";
import { AppError } from "../../utils/AppError";
import { successResponse } from "../../utils/apiResponse";
import { cancelReservation, confirmIssue, getAvailableAssets, issueAsset, reserveAsset } from "./assetRequestAllocation.services";

function optionalId(value: unknown, fieldName: string) {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new AppError(`${fieldName} must be a valid ID`, 400);
  return parsed;
}

export async function getAvailableAssetsController(req: Request, res: Response, next: NextFunction) {
  try {
    const assets = await getAvailableAssets(Number(req.params.requestId), Number(req.params.lineId), {
      locationId: optionalId(req.query.locationId, "locationId"),
      search: typeof req.query.search === "string" ? req.query.search : undefined,
    });
    return successResponse(res, "Available assets retrieved successfully", assets);
  } catch (error) { next(error); }
}

export async function reserveAssetController(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError("Authentication is required", 401);
    const result = await reserveAsset(Number(req.params.requestId), Number(req.params.lineId), req.body, req.user.userId);
    return successResponse(res, "Asset reserved successfully", result, 201);
  } catch (error) { next(error); }
}

export async function cancelReservationController(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await cancelReservation(Number(req.params.allocationId));
    return successResponse(res, "Reservation cancelled successfully", result);
  } catch (error) { next(error); }
}

export async function issueAssetController(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError("Authentication is required", 401);
    const result = await issueAsset(Number(req.params.allocationId), req.body, req.user.userId);
    return successResponse(res, "Asset issued to Production successfully", result, 201);
  } catch (error) { next(error); }
}

export async function confirmIssueController(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError("Authentication is required", 401);
    const result = await confirmIssue(Number(req.params.allocationId), req.body, req.user.userId);
    return successResponse(res, "Issue confirmed successfully; Asset is now IN_USE", result);
  } catch (error) { next(error); }
}
