import { NextFunction, Request, Response } from "express";
import { AppError } from "../utils/AppError";
import { errorResponse } from "../utils/apiResponse";

export function errorMiddleware(
    error: Error,
    req: Request,
    res: Response,
    next: NextFunction
) {
    console.error("========== API ERROR ==========");
    console.error("URL:", req.originalUrl);
    console.error("METHOD:", req.method);
    console.error("MESSAGE:", error.message);
    console.error("STACK:", error.stack);
    console.error("===============================");

    if (error instanceof AppError) {
        return errorResponse(res, error.message, error.statusCode);
    }

    return errorResponse(res, "Internal Server Error", 500);
}