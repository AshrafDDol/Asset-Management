import { Router } from "express";
import locationRoutes from "../modules/locations/location.routes";
import assetCategoryRoutes from "../modules/asset-categories/assetCategories.routes";
import departmentRoutes from "../modules/departments/department.routes";
import authRoutes from "../modules/auth/auth.routes";
import roleRoutes from "../modules/roles/role.routes";
import userRoutes from "../modules/users/user.routes";
import assetRoutes from "../modules/assets/asset.routes";
import assetEpcRoutes from "../modules/asset-epcs/assetEpc.routes";
import assetAssignmentRoutes from "../modules/asset-assignments/assetAssignment.routes";
import assetMovementRoutes from "../modules/asset-movements/assetMovement.routes";

const router = Router();

router.get("/health", (req, res) => {
    res.json({
        success: true,
        message: "Evolve Inventory Management API is running",
    });
});


router.use("/auth", authRoutes);
router.use("/locations", locationRoutes);
router.use("/asset-categories", assetCategoryRoutes);
router.use("/departments", departmentRoutes);
router.use("/roles", roleRoutes);
router.use("/users", userRoutes);
router.use("/assets", assetRoutes);
router.use("/asset-epcs", assetEpcRoutes);
router.use("/asset-assignments", assetAssignmentRoutes);
router.use("/asset-movements", assetMovementRoutes);

export default router;