import { Router } from "express";
import { authMiddleware } from "../../middleware/authMiddleware";
import {
  getAssetAssignmentByIdController,
  getAssetAssignmentsController,
  getCurrentAssetAssignmentController,
} from "./assetAssignment.controller";

const router = Router();

router.use(authMiddleware);

router.get("/", getAssetAssignmentsController);
router.get("/by-asset/:assetId/current", getCurrentAssetAssignmentController);
router.get("/:id", getAssetAssignmentByIdController);
export default router;
