import express from 'express'
const router = express.Router();
import Member from '../models/Member.js'
import AttendanceEvent from '../models/AttendanceEvent.js';
import { memberCheckIn } from '../controllers/memberController.js';
import { checkMemberRetention } from '../controllers/churchController.js';

// Unified Form Submission (Check-In & Auto-Registration)
router.post('/check-in', memberCheckIn);
router.post('/retention/sweep', checkMemberRetention)

export default router