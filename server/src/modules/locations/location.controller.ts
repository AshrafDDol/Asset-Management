import { NextFunction, Request, Response } from "express";
import { successResponse} from "../../utils/apiResponse";
import { AppError } from "../../utils/AppError";

import { 
    createLocation, 
    updateLocation, 
    deleteLocation, 
    getLocationById, 
    getAllLocations,
    getLocationPath,
    getLocationTree,
} from "./location.services";

export async function getLocationsController (
    req: Request,
    res: Response,
    next: NextFunction
) {
    try {
        const parentId = req.query.parentId === undefined
            ? undefined
            : req.query.parentId === "null"
                ? null
                : Number(req.query.parentId);
        if (typeof parentId === "number" && (!Number.isInteger(parentId) || parentId <= 0)) {
            throw new AppError("parentId must be a valid ID", 400);
        }
        const locations = await getAllLocations({
            parentId,
            locationType: typeof req.query.type === "string" ? req.query.type : undefined,
        });

        return successResponse(
            res,
            "Locations retrieved successfully",
            locations
        );
    } catch (error) {
        next(error);
    }
}

export async function getLocationTreeController(
    req: Request,
    res: Response,
    next: NextFunction
) {
    try {
        return successResponse(res, "Location tree retrieved successfully", await getLocationTree());
    } catch (error) {
        next(error);
    }
}

export async function getLocationPathController(
    req: Request,
    res: Response,
    next: NextFunction
) {
    try {
        return successResponse(res, "Location path retrieved successfully", await getLocationPath(Number(req.params.id)));
    } catch (error) {
        next(error);
    }
}

export async function getLocationByIdController (
    req: Request,
    res: Response,
    next: NextFunction
){
    try {
        const id = Number(req.params.id);

        const location = await getLocationById(id);

        return successResponse(
            res,
            "Location retrieved successfully",
            location
        );
    } catch (error) {
        next(error);
    }
}

export async function createLocationController (
    req: Request,
    res: Response,
    next: NextFunction
){
    try {
        const location = await createLocation(req.body);

        return successResponse(
            res,
            "Location created successfully",
            location,
            201
        );
    } catch (error) {
        next(error);
    }
}

export async function updateLocationController (
    req: Request,
    res: Response,
    next: NextFunction
){
    try {
        const id = Number(req.params.id);

        const location = await updateLocation(id, req.body);

        return successResponse(
            res,
            "Location updated successfully",
            location
        );
    } catch (error) {
        next(error);
    }
}

export async function deleteLocationController (
    req: Request,
    res: Response,
    next: NextFunction
){
    try {
        const id = Number(req.params.id);

        const location = await deleteLocation(id);

        return successResponse(
            res,
            "Location deleted successfully",
            location
        );
    } catch (error) {
        next(error);
    }
}
