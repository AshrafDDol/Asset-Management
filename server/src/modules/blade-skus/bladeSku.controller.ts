import { NextFunction, Request, Response } from "express";
import { successResponse } from "../../utils/apiResponse";
import { AppError } from "../../utils/AppError";
import {
  createBladeSku,
  deleteBladeSku,
  getAllBladeSkus,
  getBladeSkuById,
  updateBladeSku,
} from "./bladeSku.services";

function optionalPositiveInt(value: unknown, name: string) {
  if (value === undefined) return undefined;
  const result = Number(value);
  if (!Number.isInteger(result) || result <= 0) throw new AppError(`${name} must be a valid ID`, 400);
  return result;
}

export async function getBladeSkusController(req: Request, res: Response, next: NextFunction) {
  try {
    const active = req.query.active === undefined
      ? undefined
      : req.query.active === "true"
        ? true
        : req.query.active === "false"
          ? false
          : (() => { throw new AppError("active must be true or false", 400); })();
    const data = await getAllBladeSkus({
      active,
      search: typeof req.query.search === "string" ? req.query.search.trim() : undefined,
      categoryId: optionalPositiveInt(req.query.categoryId, "categoryId"),
    });
    return successResponse(res, "Blade SKUs retrieved successfully", data);
  } catch (error) { next(error); }
}

export async function getBladeSkuByIdController(req: Request, res: Response, next: NextFunction) {
  try { return successResponse(res, "Blade SKU retrieved successfully", await getBladeSkuById(Number(req.params.id))); }
  catch (error) { next(error); }
}

export async function createBladeSkuController(req: Request, res: Response, next: NextFunction) {
  try { return successResponse(res, "Blade SKU created successfully", await createBladeSku(req.body), 201); }
  catch (error) { next(error); }
}

export async function updateBladeSkuController(req: Request, res: Response, next: NextFunction) {
  try { return successResponse(res, "Blade SKU updated successfully", await updateBladeSku(Number(req.params.id), req.body)); }
  catch (error) { next(error); }
}

export async function deleteBladeSkuController(req: Request, res: Response, next: NextFunction) {
  try { return successResponse(res, "Blade SKU deactivated successfully", await deleteBladeSku(Number(req.params.id))); }
  catch (error) { next(error); }
}
