import express from 'express'
import Member from '../models/Member.js'
import AttendanceEvent from '../models/AttendanceEvent.js';
import { memberCheckIn } from '../controllers/memberController.js';
import { checkMemberRetention } from '../controllers/churchController.js';
import { manualCheckInOverride } from '../controllers/attendanceController.js';

const router = express.Router()


// Unified Form Submission (Check-In & Auto-Registration)
router.post('/manual-checkin', manualCheckInOverride)
router.post('/check-in', memberCheckIn);
router.post('/retention/sweep', checkMemberRetention)

export default router