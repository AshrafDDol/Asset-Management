import { NextFunction, Request, Response } from 'express';
import { successResponse } from '../../utils/apiResponse';
import { cancelRepairTask, confirmRepairTask, getPendingRepairTask, getPendingRepairTasks, getRepair, listRepairs, prepareCompleteRepair, prepareStartRepair } from './repair.services';
const user = (req: Request) => req.user!.userId;
export async function list(req: Request, res: Response, next: NextFunction) { try { return successResponse(res, 'Repairs retrieved', await listRepairs()); } catch (e) { next(e); } }
export async function get(req: Request, res: Response, next: NextFunction) { try { return successResponse(res, 'Repair retrieved', await getRepair(req.params.id)); } catch (e) { next(e); } }
export async function tasks(req: Request, res: Response, next: NextFunction) { try { return successResponse(res, 'Pending Repair tasks retrieved', await getPendingRepairTasks()); } catch (e) { next(e); } }
export async function task(req: Request, res: Response, next: NextFunction) { try { return successResponse(res, 'Repair task retrieved', await getPendingRepairTask(req.params.id)); } catch (e) { next(e); } }
export async function prepareStart(req: Request, res: Response, next: NextFunction) { try { return successResponse(res, 'Start Repair prepared', await prepareStartRepair(req.body, user(req)), 201); } catch (e) { next(e); } }
export async function prepareComplete(req: Request, res: Response, next: NextFunction) { try { return successResponse(res, 'Complete Repair prepared', await prepareCompleteRepair(req.params.id, user(req)), 201); } catch (e) { next(e); } }
export async function confirm(req: Request, res: Response, next: NextFunction) { try { return successResponse(res, 'Repair action confirmed', await confirmRepairTask(req.params.id, req.body, user(req))); } catch (e) { next(e); } }
export async function cancel(req: Request, res: Response, next: NextFunction) { try { return successResponse(res, 'Repair task cancelled', await cancelRepairTask(req.params.id, user(req))); } catch (e) { next(e); } }
