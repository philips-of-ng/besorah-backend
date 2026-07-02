import express from 'express'
const router = express.Router()

import Church from '../models/Church.js';
import AttendanceEvent from '../models/AttendanceEvent.js';

import { checkMemberRetention, createEvent, findOrCreate, getAnalytics, registerChurch, getLiveFeed, getMonthlyBirthdays, getFollowUpPipeline } from '../controllers/churchController.js'

// 1. Register a New Church
router.post('/register', registerChurch);

// 2. Create an Attendance Event (Generates the ID for the QR code) - ADMIN
router.post('/event', createEvent);


// 3. Get or automatically initialize a constant service instance for today
router.post('/event/active', findOrCreate);


// 4. Get Dashboard Analytics for a specific service type
router.get('/analytics/:churchId', getAnalytics);

// 5. System Execution: Trigger the retention check engine sweep
router.post('/retention/sweep', checkMemberRetention);

// Real-Time Actionable Insights
router.get('/analytics/live/:churchId', getLiveFeed);
router.get('/analytics/birthdays/:churchId', getMonthlyBirthdays);
router.get('/analytics/followup/:churchId', getFollowUpPipeline);


export default router

