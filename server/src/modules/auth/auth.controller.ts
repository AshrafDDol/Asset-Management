import { NextFunction, Request, Response } from "express";
import { successResponse } from "../../utils/apiResponse";
import { getCurrentUser, loginUser } from "./auth.services";

export async function loginController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const result = await loginUser(req.body);

    return successResponse(res, "Login successful", result);
  } catch (error) {
    next(error);
  }
}

export async function meController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const authUser = req.user;

    const user = await getCurrentUser(authUser!.userId);

    return successResponse(res, "Current user retrieved successfully", user);
  } catch (error) {
    next(error);
  }
}