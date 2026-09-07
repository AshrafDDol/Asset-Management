import { Router } from "express";
import { authMiddleware } from "../../middleware/authMiddleware";
import {
  cancelAssetRequestController,
  createAssetRequestController,
  getAssetRequestByIdController,
  getAssetRequestsController,
  updateAssetRequestController,
} from "./assetRequest.controller";
import {
  getAvailableAssetsController,
  reserveAssetController,
} from "../asset-request-allocations/assetRequestAllocation.controller";

const router = Router();
router.use(authMiddleware);
router.get("/", getAssetRequestsController);
router.get("/:id", getAssetRequestByIdController);
router.get("/:requestId/lines/:lineId/available-assets", getAvailableAssetsController);
router.post("/", createAssetRequestController);
router.post("/:requestId/lines/:lineId/reservations", reserveAssetController);
router.patch("/:id", updateAssetRequestController);
router.post("/:id/cancel", cancelAssetRequestController);
export default router;
