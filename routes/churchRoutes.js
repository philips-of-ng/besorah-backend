import express from 'express';
const router = express.Router();

// Model Imports
import Church from '../models/Church.js';
import AttendanceEvent from '../models/AttendanceEvent.js';

// Controller Imports
import { createEventType } from '../controllers/eventController.js';
import { getEventTypes } from '../controllers/eventController.js';

import { 
  registerChurch, 
  createEvent, 
  findOrCreate, 
  getAnalytics, 
  checkMemberRetention, 
  getLiveFeed, 
  getMonthlyBirthdays, 
  getFollowUpPipeline 
} from '../controllers/churchController.js';

// =========================================================================
// 1. CHURCH ONBOARDING & REGISTRATION
// =========================================================================

// Register a New Church Account
router.post('/register', registerChurch);


// =========================================================================
// 2. ACTIVE ATTENDANCE EVENTS & LOGS
// =========================================================================

// Create an Attendance Event Base Archetype - ADMIN
router.post('/event', createEvent);

// Get or automatically initialize a constant service session instance for today
router.post('/event/active', findOrCreate);


// =========================================================================
// 3. EVENT CONFIGURATION SCHEMAS (DYNAMIC TYPES)
// =========================================================================

// Register a brand new custom event definition (e.g., Sunday Celebration Service)
router.post('/event/types', createEventType);  

// Pull existing custom category lists to populate frontend selection options
router.get('/event/types', getEventTypes);


// =========================================================================
// 4. ANALYTICS, DEEP INFERENCES & REAL-TIME FEEDS
// =========================================================================

// Get historical Dashboard Analytics for a specific service type profile
router.get('/analytics/:churchId', getAnalytics);

// Real-Time Active Ticker Stream Data
router.get('/analytics/live/:churchId', getLiveFeed);

// Care Pipeline Target: Pull member birthdays matching the current calendar month
router.get('/analytics/birthdays/:churchId', getMonthlyBirthdays);

// Welfare Tracking Dashboard: Pull automated follow-up priority pipelines
router.get('/analytics/followup/:churchId', getFollowUpPipeline);


// =========================================================================
// 5. DATA OPTIMIZATIONS & BACKGROUND TASKS
// =========================================================================

// System Execution: Trigger the retention check engine algorithmic sweep pass
router.post('/retention/sweep', checkMemberRetention);


export default router;