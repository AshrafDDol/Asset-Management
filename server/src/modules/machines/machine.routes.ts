import { Router } from "express";
import { authMiddleware } from "../../middleware/authMiddleware";
import {
  createMachineController,
  deleteMachineController,
  getMachineByIdController,
  getMachinesController,
  updateMachineController,
} from "./machine.controller";

const router = Router();
router.use(authMiddleware);
router.get("/", getMachinesController);
router.get("/:id", getMachineByIdController);
router.post("/", createMachineController);
router.patch("/:id", updateMachineController);
router.delete("/:id", deleteMachineController);
export default router;
