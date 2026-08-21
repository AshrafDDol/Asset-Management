import { Router } from "express";
import { 
    getAssetCategoriesController, 
    getAssetCategoryByIdController, 
    createAssetCategoryController, 
    updateAssetCategoryController, 
    deleteAssetCategoryController, 
} from "./assetCategories.controller";

const router = Router();

router.get("/", getAssetCategoriesController);
router.get("/:id", getAssetCategoryByIdController);
router.post("/", createAssetCategoryController);
router.put("/:id", updateAssetCategoryController);
router.delete("/:id", deleteAssetCategoryController);

export default router;
