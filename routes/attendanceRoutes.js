import express from "express";
import {
  manualCheckInOverride,
  memberCheckIn,
} from "../controllers/attendanceController.js";

const router = express.Router();

// Unified form submissions for attendee check-in and automatic registration.
router.post("/manual-checkin", manualCheckInOverride);
router.post("/check-in", memberCheckIn);

export default router;
