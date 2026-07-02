import { google } from 'googleapis';

// Initialize the Google OAuth2 Client
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

/**
 * Appends a member check-in record to a church's specific Google Sheet
 */
export const appendToCheckInSheet = async (refreshToken, spreadsheetId, memberData) => {
  try {
    // 1. Set the credentials using the stored refresh token
    oauth2Client.setCredentials({ refresh_token: refreshToken });
    const sheets = google.sheets({ version: 'v4', auth: oauth2Client });

    // 2. Prepare the row data array matching your form structure
    const row = [
      new Date().toLocaleDateString(), // Date of Check-in
      memberData.fullName,
      memberData.phoneNumber,
      memberData.email || 'N/A',
      memberData.attendanceStatus,     // First Timer, Regular, etc.
      memberData.profession || 'N/A',
      memberData.birthday || 'N/A'
    ];

    // 3. Fire append request to Google Sheets API
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'Sheet1!A:G',
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      resource: { values: [row] },
    });

    console.log(`📊 Successfully synced ${memberData.fullName} to Google Sheets.`);
  } catch (error) {
    console.error("❌ Google Sheets synchronization failed:", error.message);
    // Do not throw the error to prevent blocking the core API check-in response if Google fails
  }
};


export const initializeChurchDrive = async (refreshToken) => {
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  const drive = google.drive({ version: 'v3', auth: oauth2Client });
  const sheets = google.sheets({ version: 'v4', auth: oauth2Client });

  // 1. Create the main application parent folder
  const folderMetadata = {
    name: 'Besorah Attendance Sheets',
    mimeType: 'application/vnd.google-apps.folder',
  };
  
  const folder = await drive.files.create({
    resource: folderMetadata,
    fields: 'id',
  });
  const folderId = folder.data.id;

  const statusCategories = ['First Timer', 'Returning Visitor', 'Regular Member'];
  const syncedSheetsMap = {};
  
  const headers = ['Date', 'Full Name', 'Phone Number', 'Email Address', 'Attendance Status', 'Profession', 'Birthday'];

  // 2. Generate a dedicated, pre-headered spreadsheet for each category
  for (const category of statusCategories) {
    const fileMetadata = {
      name: `Besorah - ${category} Log`,
      mimeType: 'application/vnd.google-apps.spreadsheet',
      parents: [folderId],
    };

    const spreadsheet = await drive.files.create({
      resource: fileMetadata,
      fields: 'id',
    });
    const spreadsheetId = spreadsheet.data.id;

    // Seed the first row with our clean analytical tracking headers
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'Sheet1!A1:G1',
      valueInputOption: 'USER_ENTERED',
      resource: { values: [headers] },
    });

    syncedSheetsMap[category] = spreadsheetId;
  }

  return syncedSheetsMap; // Returns the mapped object to save straight to MongoDB
};

