import { NextFunction, Request, Response } from "express";
import { successResponse } from "../../utils/apiResponse";
import {
  createMachine,
  deleteMachine,
  getAllMachines,
  getMachineById,
  updateMachine,
} from "./machine.services";

export async function getMachinesController(_req: Request, res: Response, next: NextFunction) {
  try { return successResponse(res, "Machines retrieved successfully", await getAllMachines()); }
  catch (error) { next(error); }
}
export async function getMachineByIdController(req: Request, res: Response, next: NextFunction) {
  try { return successResponse(res, "Machine retrieved successfully", await getMachineById(Number(req.params.id))); }
  catch (error) { next(error); }
}
export async function createMachineController(req: Request, res: Response, next: NextFunction) {
  try { return successResponse(res, "Machine created successfully", await createMachine(req.body), 201); }
  catch (error) { next(error); }
}
export async function updateMachineController(req: Request, res: Response, next: NextFunction) {
  try { return successResponse(res, "Machine updated successfully", await updateMachine(Number(req.params.id), req.body)); }
  catch (error) { next(error); }
}
export async function deleteMachineController(req: Request, res: Response, next: NextFunction) {
  try { return successResponse(res, "Machine deactivated successfully", await deleteMachine(Number(req.params.id))); }
  catch (error) { next(error); }
}
