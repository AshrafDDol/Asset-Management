import { NextFunction, Request, Response } from 'express';
import { successResponse } from '../../utils/apiResponse';
import { cancelHandheldSwap, confirmHandheldReturns, confirmHandheldSwap, getPendingReturns, getPendingSwap, getPendingSwaps, getWorkCounts, prepareHandheldSwap, verifyHandheldSwapEpc } from './handheldWork.services';

const user = (req: Request) => req.user!.userId;
export async function counts(req: Request, res: Response, next: NextFunction) { try { return successResponse(res, 'Handheld work counts retrieved', await getWorkCounts()); } catch (e) { next(e); } }
export async function returns(req: Request, res: Response, next: NextFunction) { try { return successResponse(res, 'Pending returns retrieved', await getPendingReturns()); } catch (e) { next(e); } }
export async function confirmReturns(req: Request, res: Response, next: NextFunction) { try { return successResponse(res, 'Scanned returns processed', await confirmHandheldReturns(req.body, user(req))); } catch (e) { next(e); } }
export async function prepareSwap(req: Request, res: Response, next: NextFunction) { try { return successResponse(res, 'Handheld Swap prepared', await prepareHandheldSwap(req.body, user(req)), 201); } catch (e) { next(e); } }
export async function swaps(req: Request, res: Response, next: NextFunction) { try { return successResponse(res, 'Pending Swaps retrieved', await getPendingSwaps()); } catch (e) { next(e); } }
export async function swap(req: Request, res: Response, next: NextFunction) { try { return successResponse(res, 'Pending Swap retrieved', await getPendingSwap(Number(req.params.id))); } catch (e) { next(e); } }
export async function confirmSwap(req: Request, res: Response, next: NextFunction) { try { return successResponse(res, 'Swap confirmed', await confirmHandheldSwap(Number(req.params.id), req.body, user(req))); } catch (e) { next(e); } }
export async function verifySwap(req: Request, res: Response, next: NextFunction) { try { return successResponse(res, 'Swap EPC verified', await verifyHandheldSwapEpc(Number(req.params.id), req.body)); } catch (e) { next(e); } }
export async function cancelSwap(req: Request, res: Response, next: NextFunction) { try { return successResponse(res, 'Handheld Swap cancelled', await cancelHandheldSwap(Number(req.params.id), req.body || {}, user(req))); } catch (e) { next(e); } }
