import { Router } from "express";
import { authMiddleware } from "../../middleware/authMiddleware";
import { 
    getAssetCategoriesController, 
    getAssetCategoryByIdController, 
    createAssetCategoryController, 
    updateAssetCategoryController, 
    deleteAssetCategoryController, 
} from "./assetCategories.controller";

const router = Router();

router.use(authMiddleware);

router.get("/", getAssetCategoriesController);
router.get("/:id", getAssetCategoryByIdController);
router.post("/", createAssetCategoryController);
router.put("/:id", updateAssetCategoryController);
router.delete("/:id", deleteAssetCategoryController);

export default router;
