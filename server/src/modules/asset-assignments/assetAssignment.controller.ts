import { Request, Response, NextFunction } from "express";
import { successResponse } from "../../utils/apiResponse";
import { 
    createAssetAssignment, 
    updateAssetAssignment,
    getAssetAssignmentById,
    getCurrentAssetAssignment,
    getAllAssetAssignments,
    returnAssetAssignment,
    initiateAssetReturn,
    confirmAssetReturn,
} from "./assetAssignment.services";
import { AppError } from "../../utils/AppError";

export async function getAssetAssignmentsController(
    req: Request,
    res: Response,
    next: NextFunction
) {
    try {
        const assignments = await getAllAssetAssignments();

        return successResponse(
            res,
            "Asset assignments retrieved successfully",
            assignments
        );
    } catch (error) {
        next(error);
    }
}

export async function initiateAssetReturnController(req: Request, res: Response, next: NextFunction) {
    try {
        if (!req.user) throw new AppError("Authentication is required", 401);
        const assignment = await initiateAssetReturn(Number(req.params.id), req.body);
        return successResponse(res, "Return initiated; awaiting EPC confirmation", assignment);
    } catch (error) { next(error); }
}

export async function confirmAssetReturnController(req: Request, res: Response, next: NextFunction) {
    try {
        if (!req.user) throw new AppError("Authentication is required", 401);
        const assignment = await confirmAssetReturn(Number(req.params.id), req.body, req.user.userId);
        return successResponse(res, "Return confirmed successfully; Asset is now AVAILABLE", assignment);
    } catch (error) { next(error); }
}

export async function getAssetAssignmentByIdController(
    req: Request,
    res: Response,
    next: NextFunction
) {
    try {
        const id = Number(req.params.id);
        const assignment = await getAssetAssignmentById(id);

        return successResponse(
            res,
            "Asset assignment retrieved successfully",
            assignment
        );
    } catch (error) {
        next(error);
    }
}

export async function getCurrentAssetAssignmentController(
    req: Request,
    res: Response,
    next: NextFunction
) {
    try {
        const assetId = Number(req.params.assetId);
        const assignment = await getCurrentAssetAssignment(assetId);

        return successResponse(
            res,
            "Current asset assignment retrieved successfully",
            assignment
        );
    } catch (error) {
        next(error);
    }
}

export async function createAssetAssignmentController(
    req: Request,
    res: Response,
    next: NextFunction
) {
    try {
        const authUser = req.user;

        if(!authUser) {
            throw new AppError("Authentication is required", 401);
        }
        const assignment = await createAssetAssignment(req.body, authUser.userId);

        return successResponse(
            res,
            "Asset assignment created successfully",
            assignment,
            201
        );
    } catch (error) {
        next(error);
    }
}

export async function updateAssetAssignmentController(
    req: Request,
    res: Response,
    next: NextFunction
) {
    try {
        const id = Number(req.params.id);
        const assignment = await updateAssetAssignment(id, req.body);

        return successResponse(
            res,
            "Asset assignment updated successfully",
            assignment
        );
        
    } catch (error) {
        next(error);
    }
}

export async function returnAssetAssignmentController(
    req: Request,
    res: Response,
    next: NextFunction
) {
    try {
        const id = Number(req.params.id);
        if (!req.user) throw new AppError("Authentication is required", 401);
        const assignment = await returnAssetAssignment(id, req.body, req.user.userId);

        return successResponse(
            res,
            "Asset assignment returned successfully",
            assignment
        );
    } catch (error) {
        next(error);
    }
}
