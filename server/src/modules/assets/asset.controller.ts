import { NextFunction, Request, Response } from 'express';
import { successResponse } from "../../utils/apiResponse";
import { createAsset, updateAsset, deleteAsset, getAllAssets, getAssetById } from "./asset.service";
import { AppError } from "../../utils/AppError";

export async function getAssetsController (
    req: Request,
    res: Response,
    next: NextFunction
) {
    try {
        const parseId = (value: unknown, name: string) => {
            if (value === undefined) return undefined;
            const parsed = Number(value);
            if (!Number.isInteger(parsed) || parsed <= 0) throw new AppError(`${name} must be a valid ID`, 400);
            return parsed;
        };
        const parseMeasurement = (value: unknown, name: string) => {
            if (value === undefined) return undefined;
            const parsed = Number(value);
            if (!Number.isFinite(parsed) || parsed <= 0) throw new AppError(`${name} must be greater than zero`, 400);
            return parsed;
        };
        const parseNonNegative = (value: unknown, name: string) => {
            if (value === undefined) return undefined;
            const parsed = Number(value);
            if (!Number.isFinite(parsed) || parsed < 0) throw new AppError(`${name} must be zero or greater`, 400);
            return parsed;
        };
        const assets = await getAllAssets({
            locationId: parseId(req.query.locationId, "locationId"),
            status: typeof req.query.status === "string" ? req.query.status : undefined,
            assetCode: typeof req.query.assetCode === "string" ? req.query.assetCode : undefined,
            itemName: typeof req.query.itemName === "string" ? req.query.itemName : undefined,
            categoryId: parseId(req.query.categoryId, "categoryId"),
            homeLocationId: parseId(req.query.homeLocationId, "homeLocationId"),
            epc: typeof req.query.epc === "string" ? req.query.epc : undefined,
            condition: typeof req.query.condition === "string" ? req.query.condition : undefined,
            measurementHeight: parseMeasurement(req.query.measurementHeight, "measurementHeight"),
            measurementWidth: parseMeasurement(req.query.measurementWidth, "measurementWidth"),
            gridUp: parseId(req.query.gridUp, "gridUp"),
            radius: parseNonNegative(req.query.radius, "radius"),
            gapMm: parseNonNegative(req.query.gapMm, "gapMm"),
        });

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
