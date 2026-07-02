import { google } from 'googleapis';
import Church from '../models/Church.js';
import { initializeChurchDrive } from '../utils/googleSheetsHelper.js'; // Imported initialization helper

// Configure the OAuth2 Client using server environment variables
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI // e.g., http://localhost:5000/api/auth/google/callback
);

// 1. Generate the Google Consent Screen URL
export const getGoogleAuthUrl = (req, res) => {
  const scopes = [
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/spreadsheets', // Full access to sheets
    'https://www.googleapis.com/auth/drive.file'     // Access to create files in Drive
  ];

  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline', // CRITICAL: Guarantees we get a refresh_token
    prompt: 'consent',      // Forces Google to show the consent screen every time to secure the token
    scope: scopes
  });

  res.status(200).json({ url });
};

// 2. Handle Google Callback (The Core Account Creation / Login Gate)
export const handleGoogleCallback = async (req, res) => {
  const { code } = req.query;

  if (!code) {
    return res.status(400).json({ error: "Authorization code missing from callback parameters." });
  }

  try {
    // Exchange the one-time code for account tokens
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Fetch the church's Google profile information
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();
    
    const googleEmail = userInfo.data.email;
    const googleName = userInfo.data.name; 

    // Search the DB to see if a church is already registered with this Google account
    let church = await Church.findOne({ googleConnectedEmail: googleEmail });

    if (!church) {
      // ACCOUNT CREATION FLOW (First time onboarding)
      church = new Church({
        name: googleName, 
        location: "Not Specified Yet",
        googleConnectedEmail: googleEmail,
        googleRefreshToken: tokens.refresh_token, 
        syncedSheets: {}
      });

      // AUTOMATED DRIVE WORKSPACE INITIALIZATION
      // Builds the parent folder and seeds the headered logs instantly
      if (tokens.refresh_token) {
        try {
          const mappedSheets = await initializeChurchDrive(tokens.refresh_token);
          church.syncedSheets = mappedSheets; // Saves the fresh map directly to the instance
        } catch (driveError) {
          console.error("⚠️ Automated workspace provisioning delayed: ", driveError.message);
          // Proceeding allows account generation to complete even if Drive API experiences latency
        }
      }
    } else {
      // LOGIN FLOW (Returning Admin Team)
      // Update the refresh token if Google issued a new one during this handshake
      if (tokens.refresh_token) {
        church.googleRefreshToken = tokens.refresh_token;
      }
    }

    await church.save();

    res.status(200).json({
      success: true,
      message: "Authentication successful",
      churchId: church._id,
      email: church.googleConnectedEmail,
      name: church.name,
      syncedSheets: church.syncedSheets // Returns sheet references to help frontend mapping
    });

  } catch (error) {
    res.status(500).json({ error: "Google Onboarding pipeline failed: " + error.message });
  }
};