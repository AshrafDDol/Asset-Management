import { Router } from "express";
import { authMiddleware } from "../../middleware/authMiddleware";
import {
  createAssetController,
  deleteAssetController,
  getAssetByIdController,
  getAssetsController,
  updateAssetController,
  validateAssetImportController,
  importAssetsController,
} from "./asset.controller";

const router = Router();

router.use(authMiddleware);

router.get("/", getAssetsController);
router.post("/import/validate", validateAssetImportController);
router.post("/import", importAssetsController);
router.get("/:id", getAssetByIdController);
router.post("/", createAssetController);
router.patch("/:id", updateAssetController);
router.delete("/:id", deleteAssetController);

export default router;
