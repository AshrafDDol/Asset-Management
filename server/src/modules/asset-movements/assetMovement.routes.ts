import { Router } from "express";
import { authMiddleware } from "../../middleware/authMiddleware";
import { 
    createAssetMovementsController,
    getAssetMovementsController,
    getAssetMovementsByIdController,
    getAssetMovementsByAssetController,
} from "./assetMovement.controller";

const router = Router();

router.use(authMiddleware);

router.get("/", getAssetMovementsController);
router.get("/by-asset/:assetId", getAssetMovementsByAssetController);
router.get("/:id", getAssetMovementsByIdController);
router.post("/", createAssetMovementsController);

export default router;