import { Router } from "express";
import { authMiddleware } from "../../middleware/authMiddleware";
import {
  createBladeSkuController,
  deleteBladeSkuController,
  getBladeSkuByIdController,
  getBladeSkusController,
  updateBladeSkuController,
} from "./bladeSku.controller";

const router = Router();
router.use(authMiddleware);
router.get("/", getBladeSkusController);
router.get("/:id", getBladeSkuByIdController);
router.post("/", createBladeSkuController);
router.patch("/:id", updateBladeSkuController);
router.delete("/:id", deleteBladeSkuController);
export default router;
