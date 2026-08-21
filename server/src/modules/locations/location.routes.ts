import { Router } from "express";
import {
    createLocationController,
    updateLocationController,
    deleteLocationController,
    getLocationByIdController,
    getLocationsController,
} from "./location.controller";

const router = Router();

router.get("/", getLocationsController);
router.get("/:id", getLocationByIdController);
router.post("/", createLocationController);
router.put("/:id", updateLocationController);
router.delete("/:id", deleteLocationController);

export default router;
