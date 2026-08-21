import { NextFunction, Request, Response } from "express";
import { successResponse } from "../../utils/apiResponse";
import {
  createAssetEpc,
  deleteAssetEpc,
  getAllAssetEpcs,
  getAssetEpcByCode,
  getAssetEpcById,
  updateAssetEpc,
} from "./assetEpc.services";

export async function getAssetEpcsController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const assetEpcs = await getAllAssetEpcs();

    return successResponse(res, "Asset EPCs retrieved successfully", assetEpcs);
  } catch (error) {
    next(error);
  }
}

export async function getAssetEpcByIdController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const id = Number(req.params.id);

    const assetEpc = await getAssetEpcById(id);

    return successResponse(res, "Asset EPC retrieved successfully", assetEpc);
  } catch (error) {
    next(error);
  }
}

export async function getAssetEpcByCodeController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const epcCodeParam = req.params.epcCode;

    if (!epcCodeParam || Array.isArray(epcCodeParam)) {
      throw new Error("Invalid EPC code");
    }

    const assetEpc = await getAssetEpcByCode(epcCodeParam);

    return successResponse(
        res, 
        "Asset EPC retrieved successfully", assetEpc);
  } catch (error) {
    next(error);
  }
}

export async function createAssetEpcController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const assetEpc = await createAssetEpc(req.body);

    return successResponse(res, "Asset EPC created successfully", assetEpc, 201);
  } catch (error) {
    next(error);
  }
}

export async function updateAssetEpcController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const id = Number(req.params.id);

    const assetEpc = await updateAssetEpc(id, req.body);

    return successResponse(res, "Asset EPC updated successfully", assetEpc);
  } catch (error) {
    next(error);
  }
}

export async function deleteAssetEpcController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const id = Number(req.params.id);

    const assetEpc = await deleteAssetEpc(id);

    return successResponse(res, "Asset EPC deactivated successfully", assetEpc);
  } catch (error) {
    next(error);
  }
}