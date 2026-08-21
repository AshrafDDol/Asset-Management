import { Router } from "express";
import {
  createUserController,
  deleteUserController,
  getUserByIdController,
  getUsersController,
  updateUserController,
} from "./user.controller";

const router = Router();

router.get("/", getUsersController);
router.get("/:id", getUserByIdController);
router.post("/", createUserController);
router.patch("/:id", updateUserController);
router.delete("/:id", deleteUserController);

export default router;