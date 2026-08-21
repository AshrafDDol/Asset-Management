import { Response, Request, NextFunction } from "express";
import { successResponse } from "../../utils/apiResponse";
import { AppError } from "../../utils/AppError";
import {
  createAssetMovement,
  getAllAssetMovements,
  getAssetMovementById,
  getAssetMovementsByAsset,
} from "./assetMovement.services";

export async function getAssetMovementsController(
    req: Request,
    res: Response,
    next: NextFunction,
) {
    try {
        const movements = await getAllAssetMovements();

        return successResponse(
            res,
            "Asset movements retrieved successfully",
            movements,
        );
    } catch (error) {
        next(error);
    }
}

export async function getAssetMovementsByIdController(
    req: Request,
    res: Response,
    next: NextFunction,
) {
    try {
        const Id = Number(req.params.id);

        const movement = await getAssetMovementById(Id);

        return successResponse(
            res,
            "Asset movement retrieved successfully",
            movement,
        );
    } catch (error) {
        next(error);
    }
}

export async function getAssetMovementsByAssetController(
    req: Request,
    res: Response,
    next: NextFunction,
) {
    try {
        const assetId = Number(req.params.assetId);

        const movements = await getAssetMovementsByAsset(assetId);

        return successResponse(
            res,
            "Asset movements history retrieved successfully",
            movements,
        );
    } catch (error) {
        next(error);
    }
}

export async function createAssetMovementsController(
    req: Request,
    res: Response,
    next: NextFunction,
) {
    try {
        const authUser = req.user;

        if(!authUser) {
            throw new AppError("Authentication is required", 401);
        }

        const movement = await createAssetMovement(req.body, authUser.userId);

        return successResponse(
            res,
            "Asset moved successfully",
            movement,
            201
        );
    } catch (error) {
        next(error);
    }
}