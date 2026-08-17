import Member from "../models/Member.js";
import AttendanceEvent from "../models/AttendanceEvent.js";
import Church from "../models/Church.js";
import mongoose from "mongoose";
import { appendToCheckInSheet } from "../utils/googleSheetsHelper.js";

const STALE_SESSION_HOURS = 8;

const computePercentage = (current, baseline) => {
  if (baseline === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - baseline) / baseline) * 100);
};

export const autoTerminateStaleSessions = async (churchId) => {
  try {
    const staleThreshold = new Date();
    staleThreshold.setHours(staleThreshold.getHours() - STALE_SESSION_HOURS);

    const matchFilter = { status: "active", createdAt: { $lt: staleThreshold } };
    if (churchId) matchFilter.churchId = churchId;

    const result = await AttendanceEvent.updateMany(matchFilter, {
      $set: { status: "completed" },
    });

    if (result.modifiedCount > 0) {
      console.log(
        `Auto-terminated ${result.modifiedCount} stale active session(s) older than ${STALE_SESSION_HOURS} hours.`,
      );
    }

    return result.modifiedCount || 0;
  } catch (error) {
    console.error("Stale session auto-termination error:", error.message);
    return 0;
  }
};

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
    await autoTerminateStaleSessions(churchId);

    const eventInstance = await AttendanceEvent.findById(loc);
    if (!eventInstance) {
      return res.status(404).json({
        error: "Active attendance event session not found on server.",
      });
    }

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
      computedStatus = member.attendanceStatus || "Regular Member";
    }

    const alreadyCheckedIn = eventInstance.attendedMembers.some(
      (attendee) =>
        attendee.memberId &&
        attendee.memberId.toString() === member._id.toString(),
    );

    if (alreadyCheckedIn) {
      return res.status(200).json({
        success: true,
        message: `You've already checked in for this service session, ${member.fullName}!`,
        member: {
          id: member._id,
          fullName: member.fullName,
        },
      });
    }

    await AttendanceEvent.findByIdAndUpdate(loc, {
      $push: {
        attendedMembers: {
          memberId: member._id,
          scannedAt: new Date(),
        },
      },
    });

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
        "âš ï¸ Background Google Sheets sync bypassed:",
        sheetError.message,
      );
    }

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

export const manualCheckInOverride = async (req, res) => {
  const {
    loc, // This is the active eventId (today's service instance)
    churchId,
    memberId, // Optional: if selecting an existing member from a dropdown/search
    fullName, // Required if registering a new member on the spot
    phoneNumber, // Required if registering a new member on the spot
    email,
    profession,
    birthday,
  } = req.body;

  // 1. Core Parameter Validation
  if (!loc || !churchId) {
    return res.status(400).json({
      success: false,
      message:
        "Missing routing context: loc (eventId) and churchId are mandatory.",
    });
  }

  try {
    // Validate Mongo ID structures
    if (
      !mongoose.Types.ObjectId.isValid(churchId) ||
      !mongoose.Types.ObjectId.isValid(loc)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid ID configurations provided.",
      });
    }

    let targetMemberId = memberId;
    let memberName = "";

    // 2. Resolve Member Profile
    if (targetMemberId) {
      if (!mongoose.Types.ObjectId.isValid(targetMemberId)) {
        return res
          .status(400)
          .json({ success: false, message: "Invalid memberId provided." });
      }
      const existingMember = await Member.findById(targetMemberId);
      if (!existingMember) {
        return res.status(404).json({
          success: false,
          message: "Specified member profile not found.",
        });
      }
      memberName = existingMember.fullName;
    } else {
      // If no explicit ID was passed, we're registering a new member on the fly or matching by phone
      if (!fullName || !phoneNumber) {
        return res.status(400).json({
          success: false,
          message:
            "To register a new member, both Full Name and Phone Number are required.",
        });
      }

      let member = await Member.findOne({ churchId, phoneNumber });

      if (!member) {
        // Create new member profile
        member = new Member({
          churchId,
          fullName,
          phoneNumber,
          email: email || "",
          profession: profession || "",
          birthday: birthday || "",
          attendanceStatus: "Regular Member", // Default manual additions to regulars
          status: "active",
          joinedAt: new Date(),
        });
        await member.save();
      }

      targetMemberId = member._id;
      memberName = member.fullName;
    }

    // 3. Check if they are already checked in to today's service
    const eventInstance = await AttendanceEvent.findById(loc);
    if (!eventInstance) {
      return res.status(404).json({
        success: false,
        message: "Active service event session not found.",
      });
    }

    // 🌟 DUPLICATION GUARD ENGINE: Updated to scan subdocuments for memberId matches
    const alreadyPresent = eventInstance.attendedMembers.some(
      (attendee) =>
        attendee.memberId &&
        attendee.memberId.toString() === targetMemberId.toString(),
    );

    if (alreadyPresent) {
      return res.status(200).json({
        success: true,
        message: `${memberName} is already marked present for today's service.`,
      });
    }

    // 🌟 4. Update the Event Array by pushing the subdocument with a fresh timestamp
    await AttendanceEvent.findByIdAndUpdate(loc, {
      $push: {
        attendedMembers: {
          memberId: targetMemberId,
          scannedAt: new Date(),
        },
      },
    });

    return res.status(200).json({
      success: true,
      message: `Successfully checked in ${memberName} manually.`,
    });
  } catch (error) {
    console.error("Error in manual check-in override:", error);
    return res.status(500).json({
      success: false,
      message: "Manual verification fail: " + error.message,
    });
  }
};

// GET DASHBOARD ANALYTICS
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

// LIVE FEED FOR EACH SERVICE
export const getLiveFeed = async (req, res) => {
  const { churchId } = req.params;
  const { compareMode } = req.query;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  try {
    await autoTerminateStaleSessions(churchId);

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
        comparison: null,
      });
    }

    const attendeesList = liveEvent.attendedMembers;
    const stats = { total: 0, firstTimers: 0, returning: 0, regulars: 0 };
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
      let bucketKey = "11:00";

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

    let comparison = null;
    const validModes = ["previous", "same-day", "4-week"];

    if (compareMode && validModes.includes(compareMode)) {
      const baseFilter = {
        churchId,
        date: { $lt: todayStart },
      };
      if (liveEvent.serviceName) {
        baseFilter.serviceName = liveEvent.serviceName;
      }

      let baselineTotal = 0;
      let eventCount = 0;

      if (compareMode === "previous") {
        const prevEvent = await AttendanceEvent.findOne(baseFilter)
          .sort({ date: -1 })
          .select("attendedMembers date serviceName");

        if (prevEvent) {
          baselineTotal = prevEvent.attendedMembers.length;
          eventCount = 1;
          comparison = {
            mode: "previous",
            label: `vs previous (${prevEvent.serviceName || "service"})`,
            previousEventId: prevEvent._id,
            previousDate: prevEvent.date,
            previousTotal: baselineTotal,
            currentTotal: stats.total,
            percentageChange: computePercentage(stats.total, baselineTotal),
          };
        }
      } else if (compareMode === "same-day") {
        const dayOfWeek = new Date().getDay();
        const mongoDay = dayOfWeek + 1;
        const eightWeeksAgo = new Date();
        eightWeeksAgo.setDate(eightWeeksAgo.getDate() - 56);

        const sameDayEvents = await AttendanceEvent.find({
          ...baseFilter,
          date: { $gte: eightWeeksAgo, $lt: todayStart },
          $expr: { $eq: [{ $dayOfWeek: "$date" }, mongoDay] },
        }).select("attendedMembers date");

        if (sameDayEvents.length > 0) {
          baselineTotal = Math.round(
            sameDayEvents.reduce((sum, e) => sum + e.attendedMembers.length, 0) /
              sameDayEvents.length,
          );
          eventCount = sameDayEvents.length;
          comparison = {
            mode: "same-day",
            label: `vs same-day average (${eventCount} events)`,
            baselineAverage: baselineTotal,
            eventCount,
            currentTotal: stats.total,
            percentageChange: computePercentage(stats.total, baselineTotal),
          };
        }
      } else if (compareMode === "4-week") {
        const fourWeeksAgo = new Date();
        fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);

        const rollingEvents = await AttendanceEvent.find({
          ...baseFilter,
          date: { $gte: fourWeeksAgo, $lt: todayStart },
        }).select("attendedMembers date");

        if (rollingEvents.length > 0) {
          baselineTotal = Math.round(
            rollingEvents.reduce((sum, e) => sum + e.attendedMembers.length, 0) /
              rollingEvents.length,
          );
          eventCount = rollingEvents.length;
          comparison = {
            mode: "4-week",
            label: `vs 4-week rolling average (${eventCount} events)`,
            baselineAverage: baselineTotal,
            eventCount,
            currentTotal: stats.total,
            percentageChange: computePercentage(stats.total, baselineTotal),
          };
        }
      }
    }

    return res.status(200).json({
      success: true,
      eventId: liveEvent._id,
      stats,
      chartData,
      attendees: formattedAttendees,
      comparison,
    });
  } catch (error) {
    console.error("Failed to compile live feed:", error);
    res
      .status(500)
      .json({ error: "Failed to compile live feed: " + error.message });
  }
};
