import express from "express";
import mongoose from "mongoose";
import QRCode from "qrcode";
import Member from "../models/Member.js";
import Church from "../models/Church.js";
import AttendanceEvent from "../models/AttendanceEvent.js";

// Helper function to centralize QR target link contracts — FIXED PARAMETERS
const generateEventQR = async (churchId, eventId, serviceName) => {
  // Encodes parameters cleanly into your production URL structure matching CheckIn.jsx
  // const targetRedirectUrl = `http://localhost:5174/checkin?churchId=${churchId}&loc=${eventId}&serviceName=${encodeURIComponent(serviceName)}`;

  const targetRedirectUrl = `http://bsr.devphilips.com/checkin?churchId=${churchId}&loc=${eventId}&serviceName=${encodeURIComponent(serviceName)}`;

  return await QRCode.toDataURL(targetRedirectUrl, {
    errorCorrectionLevel: "H", // High correction handles crumpled printed banners
    margin: 2,
    width: 300,
  });
};

// 1. REGISTER A NEW CHURCH
export const registerChurch = async (req, res) => {
  const { name, location } = req.body;
  try {
    const newChurch = new Church({ name, location });
    await newChurch.save();
    res.status(201).json({ success: true, church: newChurch });
  } catch (error) {
    res
      .status(500)
      .json({ error: "Failed to register church: " + error.message });
  }
};

// 2. CREATE AN EVENT (Admin Manual / Frontend Setup View Trigger Channel)
export const createEvent = async (req, res) => {
  console.log("Body of the request:", req.body);
  const { churchId, serviceName, date } = req.body;

  if (!churchId || !serviceName) {
    return res
      .status(400)
      .json({ success: false, message: "Missing required parameters." });
  }

  try {
    // Normalize date to a safe start-of-day/end-of-day range window to prevent timestamp mismatches
    const inputDate = date ? new Date(date) : new Date();
    const startOfDay = new Date(inputDate.setHours(0, 0, 0, 0));
    const endOfDay = new Date(inputDate.setHours(23, 59, 59, 999));

    // Query across a complete 24-hour range window to catch existing matches cleanly
    let event = await AttendanceEvent.findOne({
      churchId,
      serviceName,
      date: { $gte: startOfDay, $lte: endOfDay },
    });

    let statusCode = 200;

    if (event) {
      console.log(
        "Existing active event found for today. Re-routing session context...",
      );
    } else {
      console.log("No matching event found. Creating new session...");
      event = new AttendanceEvent({
        churchId,
        serviceName,
        date: startOfDay, // Save normalized timestamp
        attendedMembers: [],
      });
      await event.save();
      statusCode = 201;
      console.log("Event saved in DB");
    }

    // Pass the actual database record ID string straight to your generator parameters context
    const qrCodeImage = await generateEventQR(churchId, event._id, serviceName);
    console.log("Generated/Retrieved QR successfully.");

    return res.status(statusCode).json({
      success: true,
      event,
      qrCode: qrCodeImage,
    });
  } catch (error) {
    console.error("Error inside event gateway logic:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to manage event: " + error.message,
    });
  }
};

// 3. FIND OR CREATE (Automated Mobile Check-In Gatekeeper Flow)
export const findOrCreate = async (req, res) => {
  const { churchId, serviceName } = req.body;

  // Enforce parameter presence checks
  if (!churchId || !serviceName) {
    return res.status(400).json({
      success: false,
      message:
        "Missing mandatory body configurations: churchId and serviceName are required.",
    });
  }

  try {
    if (!mongoose.Types.ObjectId.isValid(churchId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid hex string structure passed for churchId parameter.",
      });
    }

    const cleanChurchId = new mongoose.Types.ObjectId(churchId);

    // 🌟 RULE 1: Guard against overlapping active sessions
    // Look for ANY live session that has not been explicitly terminated via status assignment
    const activeSession = await AttendanceEvent.findOne({
      churchId: cleanChurchId,
      status: "active",
    });

    if (activeSession) {
      return res.status(400).json({
        success: false,
        activeSessionFound: true,
        message: `Operation Blocked: The session '${activeSession.serviceName}' is currently live. You must close it via the dashboard before initiating a new service instance.`,
        activeEventId: activeSession._id,
        activeServiceName: activeSession.serviceName,
      });
    }

    // Capture explicit date thresholds for today
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // Create a new explicit active session instance
    const event = new AttendanceEvent({
      churchId: cleanChurchId,
      serviceName,
      date: todayStart,
      status: "active", // Explicit status state management
      attendedMembers: [],
    });

    await event.save();

    // Generate unique secure QR matrix matching this specific event instance
    const qrCodeImage = await generateEventQR(churchId, event._id, serviceName);

    return res.status(200).json({
      success: true,
      eventId: event._id,
      serviceName: event.serviceName,
      date: event.date,
      status: event.status,
      qrCode: qrCodeImage,
    });
  } catch (error) {
    console.error(
      "Critical error in findOrCreate service initialization tracker:",
      error,
    );
    return res.status(500).json({
      success: false,
      message: "Failed to initialize unique service instance: " + error.message,
    });
  }
};

// 4. GET DASHBOARD ANALYTICS
export const getAnalytics = async (req, res) => {
  const { churchId } = req.params;
  const { serviceName } = req.query;

  try {
    const matchStage = { churchId: new mongoose.Types.ObjectId(churchId) };

    if (serviceName) {
      matchStage.serviceName = serviceName;
    }

    const analytics = await AttendanceEvent.aggregate([
      { $match: matchStage },
      { $sort: { date: -1 } },
      { $limit: 4 },
      {
        $lookup: {
          from: "members",
          localField: "attendedMembers",
          foreignField: "_id",
          as: "memberDetails",
        },
      },
      {
        $project: {
          _id: 1,
          serviceName: 1,
          date: 1,
          totalAttendance: { $size: "$attendedMembers" },
          newVisitors: {
            $size: {
              $filter: {
                input: "$memberDetails",
                as: "member",
                cond: {
                  $eq: [
                    {
                      $dateToString: {
                        format: "%Y-%m-%d",
                        date: "$$member.joinedAt",
                      },
                    },
                    { $dateToString: { format: "%Y-%m-%d", date: "$date" } },
                  ],
                },
              },
            },
          },
        },
      },
      { $sort: { date: 1 } },
    ]);

    res.status(200).json({ success: true, data: analytics });
  } catch (error) {
    res
      .status(500)
      .json({ error: "Failed to fetch analytics: " + error.message });
  }
};

// 5. RUN MEMBER RETENTION SWEEP ENGINE
export const checkMemberRetention = async (req, res) => {
  const { churchId, threshold } = req.body;

  // 1. Enforce Parameter Presence Hard Gates
  if (!churchId) {
    return res.status(400).json({
      success: false,
      message: "Missing required string parameter: churchId.",
    });
  }

  try {
    // 2. Explicitly validate that churchId is a valid 24-character hex string before passing to query layers
    if (!mongoose.Types.ObjectId.isValid(churchId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid hex string structure passed for churchId parameter.",
      });
    }

    const cleanChurchId = new mongoose.Types.ObjectId(churchId);

    // 3. Fallback math verification safety checks
    const weeksThresholdMultiplier =
      threshold && !isNaN(parseInt(threshold)) ? parseInt(threshold) : 3;
    const totalDaysSpanWindow = weeksThresholdMultiplier * 7;

    const historicalThresholdDate = new Date();
    historicalThresholdDate.setDate(
      historicalThresholdDate.getDate() - totalDaysSpanWindow,
    );

    // 4. Trace event instances using the safely cast ObjectId wrapper signature
    const recentEvents = await AttendanceEvent.find({
      churchId: cleanChurchId,
      date: { $gte: historicalThresholdDate },
    }).select("_id");

    const recentEventIds = recentEvents.map((event) => event._id);

    // If no events exist in this time window, return an empty tracking state smoothly instead of throwing
    if (recentEventIds.length === 0) {
      return res.status(200).json({
        success: true,
        message:
          "Scan executed. Insufficient historical data parameters available inside this threshold week span window.",
        stats: { newlyFlaggedAtRisk: 0, restoredToActive: 0 },
      });
    }

    // 5. Query active member IDs logged across subdocuments in those events
    const activeAttendees = await AttendanceEvent.distinct(
      "attendedMembers.memberId",
      {
        _id: { $in: recentEventIds },
      },
    );

    // 6. Generate a 7-day grace period threshold date for completed outreaches
    const gracePeriodDate = new Date();
    gracePeriodDate.setDate(gracePeriodDate.getDate() - 7);

    // 🌟 DEBUG LOGGING BLOCK 🌟
    // Fetch and print the exact parameters of active candidates currently facing potential flags
    const candidates = await Member.find({
      churchId: cleanChurchId,
      _id: { $nin: activeAttendees },
      status: "active",
    });

    console.log("\n--- 🔍 RETENTION SWEEP DATABASE STATE DEBUG 🔍 ---");
    console.log(`Grace Period Cutoff Date: ${gracePeriodDate.toISOString()}`);
    console.log(
      `Checking ${candidates.length} active members with zero recent attendance...`,
    );

    candidates.forEach((m, index) => {
      console.log(`[Member #${index + 1}] Name: ${m.fullName}`);
      console.log(`  - ID: ${m._id}`);
      console.log(`  - Current status: ${m.status}`);
      console.log(
        `  - lastFollowUpDate: ${m.lastFollowUpDate ? m.lastFollowUpDate.toISOString() : "null"}`,
      );
    });
    console.log("--------------------------------------------------\n");

    // 7. Update document statuses based on active presence and grace period parameters
    const flaggedResult = await Member.updateMany(
      {
        churchId: cleanChurchId,
        _id: { $nin: activeAttendees },
        status: "active",
        // Only flag them if they have never been contacted OR their last outreach was over 7 days ago
        $or: [
          { lastFollowUpDate: null },
          { lastFollowUpDate: { $lt: gracePeriodDate } },
        ],
      },
      { $set: { status: "at-risk" } },
    );

    const restoredResult = await Member.updateMany(
      {
        churchId: cleanChurchId,
        _id: { $in: activeAttendees },
        status: "at-risk",
      },
      { $set: { status: "active" } },
    );

    console.log(
      `💡 Sweep completed. Newly Flagged: ${flaggedResult.modifiedCount || 0} | Restored: ${restoredResult.modifiedCount || 0}\n`,
    );

    return res.status(200).json({
      success: true,
      message:
        "Retention sweep pass completed across membership data structures.",
      stats: {
        newlyFlaggedAtRisk: flaggedResult.modifiedCount || 0,
        restoredToActive: restoredResult.modifiedCount || 0,
      },
    });
  } catch (error) {
    console.error(
      "Critical Exception caught inside checkMemberRetention processing engine:",
      error,
    );
    return res.status(500).json({
      success: false,
      message: "Core pipeline operational engine fault: " + error.message,
    });
  }
};

// 6. LIVE FEED FOR EACH SERVICES
export const getLiveFeed = async (req, res) => {
  const { churchId } = req.params;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  try {
    // 1. Fetch today's event and populate member info inside the subdocuments
    const liveEvent = await AttendanceEvent.findOne({
      churchId,
      date: { $gte: todayStart, $lte: todayEnd },
    }).populate({
      path: "attendedMembers.memberId",
      select: "fullName phoneNumber attendanceStatus profession",
    });

    if (!liveEvent) {
      return res.status(200).json({
        success: true,
        message: "No active service instance initialized for today yet.",
        stats: { total: 0, firstTimers: 0, returning: 0, regulars: 0 },
        chartData: [],
        attendees: [],
      });
    }

    // 2. Compile Live Feed Metric Stats
    const attendeesList = liveEvent.attendedMembers;
    const stats = { total: 0, firstTimers: 0, returning: 0, regulars: 0 };

    // Flat mapping to keep your frontend array maps perfectly clean
    const formattedAttendees = [];

    attendeesList.forEach((record) => {
      const member = record.memberId;
      if (!member) return;

      stats.total++;
      if (member.attendanceStatus === "First Timer") stats.firstTimers++;
      else if (member.attendanceStatus === "Returning Visitor")
        stats.returning++;
      else stats.regulars++;

      formattedAttendees.push({
        _id: member._id,
        fullName: member.fullName,
        phoneNumber: member.phoneNumber,
        attendanceStatus: member.attendanceStatus,
        profession: member.profession,
        scannedAt: record.scannedAt,
      });
    });

    // 3. 🌟 TIME-SERIES TIMELINE AGGREGATION 🌟
    // We group arrivals into hourly slots: 8:00 AM, 9:00 AM, 10:00 AM, 11:00 AM
    const hourlyBuckets = {
      "08:00": { label: "08:00", members: 0, visitors: 0 },
      "09:00": { label: "09:00", members: 0, visitors: 0 },
      "10:00": { label: "10:00", members: 0, visitors: 0 },
      "11:00": { label: "11:00", members: 0, visitors: 0 },
    };

    attendeesList.forEach((record) => {
      const member = record.memberId;
      if (!member || !record.scannedAt) return;

      const scanHour = new Date(record.scannedAt).getHours();
      let bucketKey = "11:00"; // Fallback bucket

      if (scanHour < 9) bucketKey = "08:00";
      else if (scanHour === 9) bucketKey = "09:00";
      else if (scanHour === 10) bucketKey = "10:00";

      const isVisitor =
        member.attendanceStatus === "First Timer" ||
        member.attendanceStatus === "Returning Visitor";

      if (isVisitor) {
        hourlyBuckets[bucketKey].visitors++;
      } else {
        hourlyBuckets[bucketKey].members++;
      }
    });

    const chartData = Object.values(hourlyBuckets);

    return res.status(200).json({
      success: true,
      eventId: liveEvent._id,
      stats,
      chartData, // 🌟 Sent directly to the frontend chart!
      attendees: formattedAttendees,
    });
  } catch (error) {
    console.error("Failed to compile live feed:", error);
    res
      .status(500)
      .json({ error: "Failed to compile live feed: " + error.message });
  }
};

// 7. MONTHLY BIRTHDAY LISTER
export const getMonthlyBirthdays = async (req, res) => {
  const { churchId } = req.params;

  try {
    const currentMonthStr = String(new Date().getMonth() + 1).padStart(2, "0");
    const birthdayRegex = new RegExp(`^\\d{2}/${currentMonthStr}$`);

    const celebrants = await Member.find({
      churchId,
      birthday: { $regex: birthdayRegex },
    }).select("fullName phoneNumber birthday profession");

    const sortedCelebrants = celebrants.sort((a, b) => {
      return (
        parseInt(a.birthday.split("/")[0]) - parseInt(b.birthday.split("/")[0])
      );
    });

    res.status(200).json({
      success: true,
      month: currentMonthStr,
      count: sortedCelebrants.length,
      celebrants: sortedCelebrants,
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to build monthly birthday tracker: " + error.message,
    });
  }
};

// 8. FUNCTION TO GET PEOPLE WHO NEED FOLLOW-UP
export const getFollowUpPipeline = async (req, res) => {
  const { churchId } = req.params;

  try {
    const visitors = await Member.find({
      churchId,
      attendanceStatus: { $in: ["First Timer", "Returning Visitor"] },
    }).select("fullName phoneNumber attendanceStatus joinedAt");

    const atRiskMembers = await Member.find({
      churchId,
      status: "at-risk",
    }).select("fullName phoneNumber profession joinedAt");

    res.status(200).json({
      success: true,
      pipeline: {
        visitorFollowUpCount: visitors.length,
        visitorFollowUpList: visitors,
        atRiskCount: atRiskMembers.length,
        atRiskList: atRiskMembers,
      },
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to compile care group pipeline: " + error.message,
    });
  }
};

// 9. GET PUBLIC PROFILE BRANDING
export const getPublicChurchProfile = async (req, res) => {
  try {
    const { churchId } = req.query;

    if (!churchId) {
      return res.status(400).json({
        success: false,
        message: "Church identifier parameter is missing.",
      });
    }

    const church = await Church.findById(churchId).select("name");

    if (!church) {
      return res
        .status(404)
        .json({ success: false, message: "Church organization not found." });
    }

    return res.status(200).json({
      success: true,
      churchName: church.name,
    });
  } catch (error) {
    console.error("Error fetching public church profile:", error);
    return res.status(500).json({
      success: false,
      message: "Core server error fetching branding profiles.",
    });
  }
};

export const getAllMembers = async (req, res) => {
  try {
    const { churchId } = req.query;

    // 1. Ensure the organization ID parameter is present
    if (!churchId) {
      return res.status(400).json({
        success: false,
        message: "Missing required parameter: churchId is mandatory.",
      });
    }

    // 2. Fetch all members tied to this church, sorted newest first
    const members = await Member.find({ churchId }).sort({ joinedAt: -1 });

    // 3. Return the exact payload structure your React View is mapped to receive
    return res.status(200).json({
      success: true,
      count: members.length,
      members,
    });
  } catch (error) {
    console.error("Error inside getAllMembers controller:", error);
    return res.status(500).json({
      success: false,
      message: "Core server failure retrieving church directory log files.",
    });
  }
};
