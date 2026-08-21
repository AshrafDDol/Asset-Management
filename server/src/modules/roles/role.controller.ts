import { NextFunction, Request, Response } from 'express';
import { successResponse } from "../../utils/apiResponse";
import { createRole, deleteRole, getAllRoles, getRoleById, updateRole } from "./role.services";

export async function getRolesController (
    req: Request,
    res: Response,
    next: NextFunction,
){
    try {
        const roles = await getAllRoles();

        return successResponse(
            res,
            "Roles retrieved successfully",
            roles,
        );
    } catch (error) {
        next(error);
    }
}

export async function getRoleByIdController (
    req: Request,
    res: Response,
    next: NextFunction,
){
    try {
        const id = Number(req.params.id);

        const role = await getRoleById(id);

        return successResponse(
            res,
            "Role retrieved successfully",
            role,
        );
    } catch (error) {
        next(error);
    }
}

export async function createRoleController (
    req: Request,
    res: Response,
    next: NextFunction,
){
    try {
        const role = await createRole(req.body);

        return successResponse(
            res,
            "Role created successfully",
            role,
            201
        );
    } catch (error) {
        next(error);
    }
}

export async function updateRoleController (
    req: Request,
    res: Response,
    next: NextFunction,
){
    try {
        const id = Number(req.params.id);

        const role = await updateRole(id, req.body);

        return successResponse(
            res,
            "Role updated successfully",
            role
        );
    } catch (error) {
        next(error);
    }
}

export async function deleteRoleController (
    req: Request,
    res: Response,
    next: NextFunction,
){
    try {
        const id = Number(req.params.id);
        const role = await deleteRole(id);

        return successResponse(
            res,
            "Role deleted successfully",
            role
        );
    } catch (error) {
        next(error);
    }
}