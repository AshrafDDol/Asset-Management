import { Router } from "express";
import { authMiddleware } from "../../middleware/authMiddleware";
import {
    createLocationController,
    updateLocationController,
    deleteLocationController,
    getLocationByIdController,
    getLocationsController,
    getLocationPathController,
    getLocationTreeController,
} from "./location.controller";

const router = Router();

router.use(authMiddleware);

router.get("/", getLocationsController);
router.get("/tree", getLocationTreeController);
router.get("/:id/path", getLocationPathController);
router.get("/:id", getLocationByIdController);
router.post("/", createLocationController);
router.put("/:id", updateLocationController);
router.delete("/:id", deleteLocationController);

export default router;
