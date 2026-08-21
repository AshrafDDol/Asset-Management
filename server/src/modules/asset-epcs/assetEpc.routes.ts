import { Router } from "express";
import { authMiddleware } from "../../middleware/authMiddleware";
import {
  createAssetEpcController,
  deleteAssetEpcController,
  getAssetEpcByCodeController,
  getAssetEpcByIdController,
  getAssetEpcsController,
  updateAssetEpcController,
} from "./assetEpc.controller";

const router = Router();

router.use(authMiddleware);

router.get("/", getAssetEpcsController);
router.get("/by-epc/:epcCode", getAssetEpcByCodeController);
router.get("/:id", getAssetEpcByIdController);
router.post("/", createAssetEpcController);
router.patch("/:id", updateAssetEpcController);
router.delete("/:id", deleteAssetEpcController);

export default router;