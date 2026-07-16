import mongoose from "mongoose";

import Member from "../models/Member.js";
import AttendanceEvent from "../models/AttendanceEvent.js";
import Church from "../models/Church.js";
import { appendToCheckInSheet } from "../utils/googleSheetsHelper.js";

export const memberCheckIn = async (req, res) => {
  const { loc, churchId, fullName, phoneNumber, email, profession, birthday } =
    req.body;

  if (!loc || !churchId || !fullName || !phoneNumber) {
    return res.status(400).json({
      error:
        "Missing required fields: loc, churchId, fullName, and phoneNumber are mandatory.",
    });
  }

  try {
    // 1. Fetch the active attendance event first to verify its existence
    const eventInstance = await AttendanceEvent.findById(loc);
    if (!eventInstance) {
      return res.status(404).json({
        error: "Active attendance event session not found on server.",
      });
    }

    // 2. Check for an existing member profile matching this phone number
    let member = await Member.findOne({ churchId, phoneNumber });
    let isNewMember = false;
    let computedStatus = "Regular Member";

    if (!member) {
      isNewMember = true;
      computedStatus = "First Timer";

      member = new Member({
        churchId,
        fullName,
        phoneNumber,
        email: email || "",
        profession: profession || "",
        birthday: birthday || "",
        attendanceStatus: computedStatus,
        status: "active",
        joinedAt: new Date(),
      });
      await member.save();
    } else {
      // Use the profile's historically recorded status if they already exist
      computedStatus = member.attendanceStatus || "Regular Member";
    }

    // 🌟 3. DUPLICATION GUARD ENGINE: Scan subdocument properties inside the attendee array
    const alreadyCheckedIn = eventInstance.attendedMembers.some(
      (attendee) =>
        attendee.memberId &&
        attendee.memberId.toString() === member._id.toString(),
    );

    if (alreadyCheckedIn) {
      // Return an early informative 200 message without duplicate operations
      return res.status(200).json({
        success: true,
        message: `You've already checked in for this service session, ${member.fullName}!`,
        member: {
          id: member._id,
          fullName: member.fullName,
        },
      });
    }

    // 🌟 4. Update the event subdocument array with the exact check-in timestamp
    await AttendanceEvent.findByIdAndUpdate(loc, {
      $push: {
        attendedMembers: {
          memberId: member._id,
          scannedAt: new Date(),
        },
      },
    });

    // 5. GOOGLE SHEETS CLOUD SYNCHRONIZATION PIPELINE
    try {
      const activeChurch = await Church.findById(churchId);

      if (activeChurch && activeChurch.googleRefreshToken) {
        const targetSpreadsheetId =
          activeChurch.syncedSheets?.get(computedStatus);

        if (targetSpreadsheetId) {
          appendToCheckInSheet(
            activeChurch.googleRefreshToken,
            targetSpreadsheetId,
            {
              fullName,
              phoneNumber,
              email: email || "",
              attendanceStatus: computedStatus,
              profession: profession || "",
              birthday: birthday || "",
            },
          );
        }
      }
    } catch (sheetError) {
      console.error(
        "⚠️ Background Google Sheets sync bypassed:",
        sheetError.message,
      );
    }

    // 6. Return standard fresh arrival message response
    return res.status(200).json({
      success: true,
      message: isNewMember
        ? "Welcome! Thank you for joining us for the first time."
        : `Welcome back, ${member.fullName}!`,
      member: {
        id: member._id,
        fullName: member.fullName,
      },
    });
  } catch (error) {
    console.error("Error inside memberCheckIn controller:", error);
    return res
      .status(500)
      .json({ error: "Check-in processing failed: " + error.message });
  }
};

export const resolveFollowUpTask = async (req, res) => {
  const { churchId, memberId } = req.body;

  if (!churchId || !memberId) {
    return res.status(400).json({
      success: false,
      message: "Missing churchId or memberId parameters.",
    });
  }

  try {
    const member = await Member.findOne({ _id: memberId, churchId });
    if (!member) {
      return res
        .status(404)
        .json({ success: false, message: "Member profile not found." });
    }

    // 1. Lock in the grace period for At-Risk members
    member.lastFollowUpDate = new Date();
    member.status = "active"; // Restore to active
    member.followUpCount = (member.followUpCount || 0) + 1;

    // 🌟 2. PROGRESSIVE GRADUATION (No more extreme jumps!)
    if (member.attendanceStatus === "First Timer") {
      // First-timers graduate to Returning Visitors after their initial welcome call
      member.attendanceStatus = "Returning Visitor";
    } else if (member.attendanceStatus === "Returning Visitor") {
      // Returning visitors stay as Returning Visitors, or can be manually upgraded to Regulars
      // in the directory when they are ready. Resolving outreach just logs the contact.
      console.log(
        `Log: Outreached returning visitor ${member.fullName}. Kept category intact.`,
      );
    }

    await member.save();

    return res.status(200).json({
      success: true,
      message: `Successfully resolved follow-up task for ${member.fullName}. Status updated to: ${member.attendanceStatus}`,
      member,
    });
  } catch (error) {
    console.error("Resolution database handler failed:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error: " + error.message,
    });
  }
};

export const getMemberHistory = async (req, res) => {
  const { memberId } = req.params;

  try {
    // 1. Validate the MongoDB ObjectID structure
    if (!mongoose.Types.ObjectId.isValid(memberId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid member ID structure.",
      });
    }

    // 2. Fetch the member's profile details
    const member = await Member.findById(memberId);
    if (!member) {
      return res.status(404).json({
        success: false,
        message: "Member profile not found.",
      });
    }

    // 3. Find all events they attended, sorted by date (newest first)
    const history = await AttendanceEvent.find({
      attendedMembers: memberId,
    })
      .sort({ date: -1 })
      .select("name date category description"); // Pull relevant event details

    // 4. Return unified profile metadata and chronological history logs
    return res.status(200).json({
      success: true,
      member: {
        id: member._id,
        fullName: member.fullName,
        phoneNumber: member.phoneNumber,
        email: member.email,
        attendanceStatus: member.attendanceStatus,
        status: member.status,
        joinedAt: member.joinedAt,
        profession: member.profession,
        birthday: member.birthday,
      },
      history: history.map((event) => ({
        id: event._id,
        eventName: event.name,
        date: event.date,
        category: event.category || "Sunday Service",
        description: event.description || "",
      })),
    });
  } catch (error) {
    console.error("Error retrieving member history:", error);
    return res.status(500).json({
      success: false,
      message: "Core pipeline operational engine fault: " + error.message,
    });
  }
};
