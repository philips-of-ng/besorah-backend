import Member from "../models/Member.js";
import AttendanceEvent from "../models/AttendanceEvent.js";
import Church from "../models/Church.js"; // Added to pull Google Sync metadata
import { appendToCheckInSheet } from "../utils/googleSheetsHelper.js"; // Sheets utility

export const memberCheckIn = async (req, res) => {
  const {
    eventId,
    churchId,
    fullName,
    phoneNumber,
    email,
    serviceInstance, // Handled as their attendance status choice (First Timer, Regular, etc.)
    profession,
    birthday,
  } = req.body;

  // Validate critical operational parameters
  if (!eventId || !churchId || !fullName || !phoneNumber || !serviceInstance) {
    return res.status(400).json({ error: "Missing required fields." });
  }

  try {
    // 1. Check for an existing member profile matching this phone number within the church
    let member = await Member.findOne({ churchId, phoneNumber });
    let isNewMember = false;

    // 2. If no record exists, register a fresh member profile
    if (!member) {
      member = new Member({
        churchId,
        fullName,
        phoneNumber,
        email: email || "",
        profession: profession || "",
        birthday: birthday || "",
        attendanceStatus: serviceInstance, 
        status: "active",
        joinedAt: new Date(), 
      });
      await member.save();
      isNewMember = true;
    }

    // 3. Append the member profile ID to today's active event container
    // $addToSet cleanly blocks duplication if they accidentally double-tap submit
    const updatedEvent = await AttendanceEvent.findByIdAndUpdate(
      eventId,
      { $addToSet: { attendedMembers: member._id } },
      { new: true }
    );

    if (!updatedEvent) {
      return res.status(404).json({ error: "Attendance event not found." });
    }

    // 4. GOOGLE SHEETS CLOUD SYNCHRONIZATION PIPELINE
    // This runs completely in the background without blocking the HTTP response thread
    try {
      const activeChurch = await Church.findById(churchId);

      if (activeChurch && activeChurch.googleRefreshToken) {
        // Fetch the dedicated Sheet file mapped to this specific user status group
        const targetSpreadsheetId = activeChurch.syncedSheets?.get(serviceInstance);

        if (targetSpreadsheetId) {
          appendToCheckInSheet(
            activeChurch.googleRefreshToken,
            targetSpreadsheetId,
            {
              fullName,
              phoneNumber,
              email,
              attendanceStatus: serviceInstance,
              profession,
              birthday,
            }
          );
        }
      }
    } catch (sheetError) {
      // Catch and log sync anomalies silently so the physical user's confirmation isn't disrupted
      console.error("⚠️ Background Google Sheets sync bypassed:", sheetError.message);
    }

    // 5. Send customized response back to the client interface
    res.status(200).json({
      success: true,
      message: isNewMember
        ? "Welcome! Thank you for joining us for the first time."
        : `Welcome back, ${member.fullName}!`,
      memberName: member.fullName,
    });
  } catch (error) {
    res
      .status(500)
      .json({ error: "Check-in processing failed: " + error.message });
  }
};