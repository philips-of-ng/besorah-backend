import express from 'express';
const router = express.Router();

// Model Imports
import Church from '../models/Church.js';
import AttendanceEvent from '../models/AttendanceEvent.js';

// Controller Imports
import { createEventType, getEventTypes } from '../controllers/eventController.js';
import { resolveFollowUpTask, getMemberHistory } from '../controllers/memberController.js';

import { 
  registerChurch, 
  createEvent, 
  findOrCreate, 
  endActiveService,
  getAnalytics, 
  checkMemberRetention, 
  getLiveFeed, 
  getMonthlyBirthdays, 
  getFollowUpPipeline, 
  getPublicChurchProfile,
  getAllMembers,
} from '../controllers/churchController.js';

// =========================================================================
// 1. CHURCH ONBOARDING & REGISTRATION
// =========================================================================

// Register a New Church Account
router.post('/register', registerChurch);
router.get('/public-profile', getPublicChurchProfile); // Grouped logically

// =========================================================================
// 2. ACTIVE ATTENDANCE EVENTS & LOGS
// =========================================================================

// Create an Attendance Event Base Archetype - ADMIN
router.post('/event', createEvent);

// Get or automatically initialize a constant service session instance for today
router.post('/event/active', findOrCreate);

// Terminate ongoing service session and invalidate QR paths
router.post('/attendance/terminate', endActiveService); 


// =========================================================================
// 3. MEMBER DIRECTORY & PROFILE MANAGEMENT
// =========================================================================

router.get('/members', getAllMembers);
router.get('/members/:memberId/history', getMemberHistory);


// =========================================================================
// 4. EVENT CONFIGURATION SCHEMAS (DYNAMIC TYPES)
// =========================================================================

// Register a brand new custom event definition (e.g., Sunday Celebration Service)
router.post('/event/types', createEventType);  

// Pull existing custom category lists to populate frontend selection options
router.get('/event/types', getEventTypes);


// =========================================================================
// 5. ANALYTICS, DEEP INFERENCES & REAL-TIME FEEDS
// =========================================================================

// Get historical Dashboard Analytics for a specific service type profile
router.get('/analytics/:churchId', getAnalytics);

// Real-Time Active Ticker Stream Data
router.get('/analytics/live/:churchId', getLiveFeed);

// Care Pipeline Target: Pull member birthdays matching the current calendar month
router.get('/analytics/birthdays/:churchId', getMonthlyBirthdays);

// Welfare Tracking Dashboard: Pull automated follow-up priority pipelines
router.get('/analytics/followup/:churchId', getFollowUpPipeline);

// Resolve outstanding outreach pipelines
router.post('/retention/resolve', resolveFollowUpTask);


// =========================================================================
// 6. DATA OPTIMIZATIONS & BACKGROUND TASKS
// =========================================================================

// System Execution: Trigger the retention check engine algorithmic sweep pass
router.post('/retention/sweep', checkMemberRetention);


export default router;