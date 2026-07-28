import express from "express";
import {
  getAnalytics,
  getLiveFeed,
} from "../controllers/attendanceController.js";
import {
  getFollowUpPipeline,
  getMonthlyBirthdays,
} from "../controllers/memberController.js";

const router = express.Router();

router.get("/analytics/:churchId", getAnalytics);
router.get("/analytics/live/:churchId", getLiveFeed);
router.get("/analytics/birthdays/:churchId", getMonthlyBirthdays);
router.get("/analytics/followup/:churchId", getFollowUpPipeline);

export default router;
