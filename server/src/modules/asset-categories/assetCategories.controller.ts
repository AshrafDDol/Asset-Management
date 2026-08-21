import { NextFunction, Request, Response } from "express";
import { successResponse } from "../../utils/apiResponse";
import { getAllAssetCategories, getAssetCategoryById, createAssetCategory, updateAssetCategory, deleteAssetCategory } from "./assetCategories.services";

export async function getAssetCategoriesController(
    req: Request,
    res: Response,
    next: NextFunction
){
    try {
        const categories = await getAllAssetCategories();

        return successResponse(
            res,
            "Asset categories retrieved successfully",
            categories,
        );
    } catch (error) {
        next(error);
    }
}

export async function getAssetCategoryByIdController(
    req: Request,
    res: Response,
    next: NextFunction
){
    try {
        const id = Number(req.params.id);
        const category = await getAssetCategoryById(id);

        return successResponse(
            res,
            "Asset category retrieved successfully",
            category,
        );
    } catch (error) {
        next(error);
    }
}

export async function createAssetCategoryController(
    req: Request,
    res: Response,
    next: NextFunction
){
    try {
        const category = await createAssetCategory(req.body);

        return successResponse(
            res,
            "Asset category created successfully",
            category,
            201
        );
    } catch (error) {
        next(error);
    }
}

export async function updateAssetCategoryController(
    req: Request,
    res: Response,
    next: NextFunction
){
    try {
        const id = Number(req.params.id);
        const category = await updateAssetCategory(id, req.body);

        return successResponse(
            res,
            "Asset category updated successfully",
            category,
        );
    } catch (error) {
        next(error);
    }
}

export async function deleteAssetCategoryController(
    req: Request,
    res: Response,
    next: NextFunction
){
    try {
        const id = Number(req.params.id);

        const category = await deleteAssetCategory(id);

        return successResponse(
            res,
            "Asset category deleted successfully",
            category,
        );
    } catch (error) {
        next(error);
    }
}
