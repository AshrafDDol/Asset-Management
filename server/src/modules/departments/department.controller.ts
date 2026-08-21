import { NextFunction, Request, Response } from "express";
import { successResponse } from "../../utils/apiResponse";
import { 
    getAllDepartments, 
    getDepartmentById, 
    createDepartment, 
    updateDepartment, 
    deleteDepartment, 
} from "./department.services";

export async function getDepartmentsController(
    req: Request,
    res: Response,
    next: NextFunction,
){
    try {
        const departments = await getAllDepartments();

        return successResponse(
            res,
            "Departments retrieved successfully",
            departments
        );
    } catch (error) {
        next(error);
    }
}

export async function getDepartmentByIdController(
    req: Request,
    res: Response,
    next: NextFunction,
){
    try {
        const id = Number(req.params.id);
        const department = await getDepartmentById(id);

        return successResponse(
            res,
            "Department retrieved successfully",
            department
        );
    } catch (error) {
        next(error);
    }
}

export async function createDepartmentController(
    req: Request,
    res: Response,
    next: NextFunction,
){
    try {
        const department = await createDepartment(req.body);

        return successResponse(
            res,
            "Department created successfully",
            department
        );
    } catch (error) {
        next(error);
    }
}

export async function updateDepartmentController (
    req: Request,
    res: Response,
    next: NextFunction,
){
    try {
        const id = Number(req.params.id);
        const department = await updateDepartment(id, req.body);

        return successResponse(
            res,
            "Department updated successfully",
            department
        );
    } catch (error) {
        next(error);
    }
}

export async function deleteDepartmentController(
    req: Request,
    res: Response,
    next: NextFunction,
){
    try {
        const id = Number(req.params.id);
        const department = await deleteDepartment(id);

        return successResponse(
            res,
            "Department deleted successfully",
            department
        );
    } catch (error) {
        next(error);
    }
}
