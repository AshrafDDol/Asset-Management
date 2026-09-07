import { Router } from "express";
import { authMiddleware } from "../../middleware/authMiddleware";
import {
  createAssetAssignmentController,
  getAssetAssignmentByIdController,
  getAssetAssignmentsController,
  getCurrentAssetAssignmentController,
  returnAssetAssignmentController,
  initiateAssetReturnController,
  confirmAssetReturnController,
  updateAssetAssignmentController,
} from "./assetAssignment.controller";

const router = Router();

router.use(authMiddleware);

router.get("/", getAssetAssignmentsController);
router.get("/by-asset/:assetId/current", getCurrentAssetAssignmentController);
router.get("/:id", getAssetAssignmentByIdController);
router.post("/", createAssetAssignmentController);
router.patch("/:id", updateAssetAssignmentController);
router.patch("/:id/return", returnAssetAssignmentController);
router.post("/:id/initiate-return", initiateAssetReturnController);
router.post("/:id/confirm-return", confirmAssetReturnController);

export default router;
