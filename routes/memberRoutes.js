import express from "express";
import {
  getAllMembers,
  getMemberHistory,
} from "../controllers/memberController.js";

const router = express.Router();

router.get("/members", getAllMembers);
router.get("/members/:memberId/history", getMemberHistory);

export default router;
