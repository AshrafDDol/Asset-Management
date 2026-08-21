import { NextFunction, Request, Response } from "express";
import { successResponse} from "../../utils/apiResponse";

import { 
    createLocation, 
    updateLocation, 
    deleteLocation, 
    getLocationById, 
    getAllLocations 
} from "./location.services";

export async function getLocationsController (
    req: Request,
    res: Response,
    next: NextFunction
) {
    try {
        const locations = await getAllLocations();

        return successResponse(
            res,
            "Locations retrieved successfully",
            locations
        );
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
