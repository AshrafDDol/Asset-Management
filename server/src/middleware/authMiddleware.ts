import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { AppError } from "../utils/AppError";
import { JwtUserPayload } from "../modules/auth/auth.types";

export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const authorization = req.headers.authorization;

  if (!authorization) {
    throw new AppError("Authorization header is required", 401);
  }

  const [type, token] = authorization.split(" ");

  if (type !== "Bearer" || !token) {
    throw new AppError("Invalid authorization format", 401);
  }

  const jwtSecret = process.env.JWT_SECRET;

  if (!jwtSecret) {
    throw new AppError("JWT secret is not configured", 500);
  }

  try {
    const decoded = jwt.verify(token, jwtSecret) as JwtUserPayload;

    req.user = decoded;

    next();
  } catch (error) {
    throw new AppError("Invalid or expired token", 401);
  }
}

export function allowRoles(allowedRoleNames: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;

    if (!user) {
      throw new AppError("Authentication is required", 401);
    }

    if (!allowedRoleNames.includes(user.roleName)) {
      throw new AppError("You do not have permission to access this resource", 403);
    }

    next();
  };
}