import { NextFunction, Request, Response } from "express";
import { successResponse } from "../../utils/apiResponse";
import {
  createUser,
  deleteUser,
  getAllUsers,
  getUserById,
  updateUser,
} from "./user.services";

export async function getUsersController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const users = await getAllUsers();

    return successResponse(res, "Users retrieved successfully", users);
  } catch (error) {
    next(error);
  }
}

export async function getUserByIdController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const id = Number(req.params.id);

    const user = await getUserById(id);

    return successResponse(res, "User retrieved successfully", user);
  } catch (error) {
    next(error);
  }
}

export async function createUserController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const user = await createUser(req.body);

    return successResponse(res, "User created successfully", user, 201);
  } catch (error) {
    next(error);
  }
}

export async function updateUserController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const id = Number(req.params.id);

    const user = await updateUser(id, req.body);

    return successResponse(res, "User updated successfully", user);
  } catch (error) {
    next(error);
  }
}

export async function deleteUserController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const id = Number(req.params.id);

    const user = await deleteUser(id);

    return successResponse(res, "User deactivated successfully", user);
  } catch (error) {
    next(error);
  }
}