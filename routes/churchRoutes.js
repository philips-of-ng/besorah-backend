import express from "express";
import {
  getPublicChurchProfile,
  registerChurch,
} from "../controllers/churchController.js";

const router = express.Router();

router.post("/register", registerChurch);
router.get("/public-profile", getPublicChurchProfile);

export default router;
