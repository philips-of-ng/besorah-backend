import express from "express";
import {
  checkMemberRetention,
  resolveFollowUpTask,
} from "../controllers/memberController.js";

const router = express.Router();

router.post("/retention/resolve", resolveFollowUpTask);
router.post("/retention/sweep", checkMemberRetention);

// Preserves the existing attendance-prefixed sweep alias without attaching
// unrelated member-care endpoints to that prefix.
export const attendanceRetentionRouter = express.Router();
attendanceRetentionRouter.post("/retention/sweep", checkMemberRetention);

export default router;
