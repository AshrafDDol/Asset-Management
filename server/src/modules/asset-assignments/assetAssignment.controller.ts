import { Request, Response, NextFunction } from "express";
import { successResponse } from "../../utils/apiResponse";
import { 
    getAssetAssignmentById,
    getCurrentAssetAssignment,
    getAllAssetAssignments,
} from "./assetAssignment.services";

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
