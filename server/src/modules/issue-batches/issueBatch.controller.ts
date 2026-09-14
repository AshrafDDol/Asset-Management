import { NextFunction, Request, Response } from "express";
import { AppError } from "../../utils/AppError";
import { successResponse } from "../../utils/apiResponse";
import { addAssetsToIssueBatch, cancelIssueBatch, cancelIssuedBatchItem, compareBatchScans, confirmBatchItemIssue, confirmHandheldIssue, createIssueBatch, getHandheldIssue, getIssueBatch, getIssueBatches, getPendingHandheldIssues, returnScan, scanAllJobs, swapIssueBatchAsset } from "./issueBatch.services";

function user(req: Request) { if (!req.user) throw new AppError("Authentication is required", 401); return req.user.userId; }
export async function list(req: Request, res: Response, next: NextFunction) { try { return successResponse(res, "Issue Batches retrieved", await getIssueBatches()); } catch (e) { next(e); } }
export async function get(req: Request, res: Response, next: NextFunction) { try { return successResponse(res, "Issue Batch retrieved", await getIssueBatch(Number(req.params.id))); } catch (e) { next(e); } }
export async function listHandheldPending(req: Request, res: Response, next: NextFunction) { try { return successResponse(res, "Pending handheld issues retrieved", await getPendingHandheldIssues()); } catch (e) { next(e); } }
export async function getHandheld(req: Request, res: Response, next: NextFunction) { try { return successResponse(res, "Handheld issue retrieved", await getHandheldIssue(Number(req.params.id))); } catch (e) { next(e); } }
export async function confirmHandheld(req: Request, res: Response, next: NextFunction) { try { return successResponse(res, "Issue confirmed successfully", await confirmHandheldIssue(Number(req.params.id), req.body, user(req))); } catch (e) { next(e); } }
export async function create(req: Request, res: Response, next: NextFunction) { try { return successResponse(res, "Assets prepared; awaiting EPC confirmation", await createIssueBatch(req.body, user(req)), 201); } catch (e) { next(e); } }
export async function addAssets(req: Request, res: Response, next: NextFunction) { try { return successResponse(res, "Assets added to Job; awaiting EPC confirmation", await addAssetsToIssueBatch(Number(req.params.id), req.body, user(req)), 201); } catch (e) { next(e); } }
export async function swapAsset(req: Request, res: Response, next: NextFunction) { try { return successResponse(res, "Job Asset replaced; replacement awaits EPC confirmation", await swapIssueBatchAsset(Number(req.params.id), req.body, user(req)), 201); } catch (e) { next(e); } }
export async function cancelBatch(req: Request, res: Response, next: NextFunction) { try { return successResponse(res, "Unconfirmed batch items cancelled", await cancelIssueBatch(Number(req.params.id))); } catch (e) { next(e); } }
export async function cancelIssue(req: Request, res: Response, next: NextFunction) { try { return successResponse(res, "Unconfirmed item cancelled; Asset is AVAILABLE", await cancelIssuedBatchItem(Number(req.params.itemId))); } catch (e) { next(e); } }
export async function compare(req: Request, res: Response, next: NextFunction) { try { return successResponse(res, "EPC scans compared", await compareBatchScans(Number(req.params.id), req.body, user(req))); } catch (e) { next(e); } }
export async function compareAllJobs(req: Request, res: Response, next: NextFunction) { try { return successResponse(res, "EPC scans compared across active Issue Batches", await scanAllJobs(req.body, user(req))); } catch (e) { next(e); } }
export async function confirmIssue(req: Request, res: Response, next: NextFunction) { try { return successResponse(res, "Issue EPC confirmed", await confirmBatchItemIssue(Number(req.params.itemId), req.body?.epc, req.body?.remarks, user(req))); } catch (e) { next(e); } }
export async function scanReturn(req: Request, res: Response, next: NextFunction) { try { return successResponse(res, "Return EPCs processed", await returnScan(req.body, user(req))); } catch (e) { next(e); } }
