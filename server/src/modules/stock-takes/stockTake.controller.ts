import { NextFunction, Request, Response } from 'express';
import { successResponse } from '../../utils/apiResponse';
import { cancelStockTake, completeStockTake, createStockTake, getStockTake, listStockTakes, recordStockTakeScans } from './stockTake.services';

const userId = (req: Request) => req.user!.userId;
export async function list(req: Request, res: Response, next: NextFunction) { try { return successResponse(res, 'Stock Takes retrieved', await listStockTakes(typeof req.query.status === 'string' ? req.query.status : undefined)); } catch (e) { next(e); } }
export async function get(req: Request, res: Response, next: NextFunction) { try { return successResponse(res, 'Stock Take retrieved', await getStockTake(req.params.id)); } catch (e) { next(e); } }
export async function create(req: Request, res: Response, next: NextFunction) { try { return successResponse(res, 'Stock Take created with frozen expected snapshot', await createStockTake(req.body, userId(req)), 201); } catch (e) { next(e); } }
export async function scan(req: Request, res: Response, next: NextFunction) { try { return successResponse(res, 'Stock Take scans recorded', await recordStockTakeScans(req.params.id, req.body)); } catch (e) { next(e); } }
export async function complete(req: Request, res: Response, next: NextFunction) { try { return successResponse(res, 'Stock Take completed', await completeStockTake(req.params.id, userId(req))); } catch (e) { next(e); } }
export async function cancel(req: Request, res: Response, next: NextFunction) { try { return successResponse(res, 'Stock Take cancelled', await cancelStockTake(req.params.id)); } catch (e) { next(e); } }
