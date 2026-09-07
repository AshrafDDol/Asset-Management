import { Router } from "express";
import { authMiddleware } from "../../middleware/authMiddleware";
import { cancelReservationController, confirmIssueController, issueAssetController } from "./assetRequestAllocation.controller";

const router = Router();
router.use(authMiddleware);
router.post("/:allocationId/cancel", cancelReservationController);
router.post("/:allocationId/issue", issueAssetController);
router.post("/:allocationId/confirm-issue", confirmIssueController);
export default router;
