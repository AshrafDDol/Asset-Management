import { Router } from "express";
import { authMiddleware } from "../../middleware/authMiddleware";
import {
  createAssetController,
  deleteAssetController,
  getAssetByIdController,
  getAssetsController,
  updateAssetController,
} from "./asset.controller";

const router = Router();

router.use(authMiddleware);

router.get("/", getAssetsController);
router.get("/:id", getAssetByIdController);
router.post("/", createAssetController);
router.patch("/:id", updateAssetController);
router.delete("/:id", deleteAssetController);

export default router;