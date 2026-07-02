import express from 'express';
const router = express.Router();
import { getGoogleAuthUrl, handleGoogleCallback } from '../controllers/authController.js';

// Frontend calls this to find out where to redirect the admin team to sign in
router.get('/google', getGoogleAuthUrl);

// Google fires back to this route once the admin logs in successfully
router.get('/google/callback', handleGoogleCallback);

export default router;