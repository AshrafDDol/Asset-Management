import { NextFunction, Request, Response } from 'express';
import { successResponse } from "../../utils/apiResponse";
import { createAsset, updateAsset, deleteAsset, getAllAssets, getAssetById } from "./asset.service";

export async function getAssetsController (
    req: Request,
    res: Response,
    next: NextFunction
) {
    try {
        const assets = await getAllAssets();

        return successResponse (
            res,
            "Assets retrieved successfully",
            assets,
        );
    } catch (error) {
        next(error);
    }
}

export async function getAssetByIdController (
    req: Request,
    res: Response,
    next: NextFunction
) {
    try {
        const id = Number(req.params.id);

        const asset = await getAssetById(id);

        return successResponse (
            res,
            "Asset retrieved successfully",
            asset,
        );
    } catch (error) {
        next(error);
    }
}

export async function createAssetController (
    req: Request,
    res: Response,
    next: NextFunction
) {
    try {
        const asset = await createAsset(req.body);

        return successResponse (
            res,
            "Asset created successfully",
            asset,
            201
        );
    } catch (error) {
        next(error);
    }
}

export async function updateAssetController (
    req: Request,
    res: Response,
    next: NextFunction
) {
    try {
        const id = Number(req.params.id);

        const asset = await updateAsset(id, req.body);

        return successResponse (
            res,
            "Asset updated successfully",
            asset,
        );
    } catch (error) {
        next(error);
    }
}

export async function deleteAssetController (
    req: Request,
    res: Response,
    next: NextFunction
) {
    try {
        const id = Number(req.params.id);

        const asset = await deleteAsset(id);

        return successResponse (
            res,
            "Asset deleted successfully",
            asset,
        );
    } catch (error) {
        next(error);
    }
}
