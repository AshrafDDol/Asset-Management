import { Router } from "express";
import { authMiddleware } from "../../middleware/authMiddleware";
import { addAssets, cancelBatch, cancelIssue, compare, compareAllJobs, confirmIssue, create, get, list, scanReturn, swapAsset } from "./issueBatch.controller";

const router = Router();
router.use(authMiddleware);
router.get("/", list);
router.get("/:id", get);
router.post("/", create);
router.post("/return-scan", scanReturn);
router.post("/scan-all-jobs", compareAllJobs);
router.post("/:id/items", addAssets);
router.post("/:id/swap", swapAsset);
router.post("/:id/cancel", cancelBatch);
router.post("/:id/scan-comparison", compare);
router.post("/items/:itemId/cancel-issue", cancelIssue);
router.post("/items/:itemId/confirm-issue", confirmIssue);
export default router;
