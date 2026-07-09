import express from "express";
import mongoose from "mongoose";
import QRCode from "qrcode";
import Member from "../models/Member.js";
import Church from "../models/Church.js";
import AttendanceEvent from "../models/AttendanceEvent.js";

// Helper function to centralize QR target link contracts
const generateEventQR = async (churchId, serviceName) => {

  // Encodes parameters cleanly into your production URL structure
  const targetUrl = `https://checkin.besorah.app/?churchId=${churchId}&serviceName=${encodeURIComponent(serviceName)}`;

  return await QRCode.toDataURL(targetUrl, {
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

// 2. CREATE AN EVENT (Admin Manual / Pre-scheduling Flow)
export const createEvent = async (req, res) => {

  console.log('body of the request', req.body)

  const { churchId, serviceName, date } = req.body;
  try {
    const newEvent = new AttendanceEvent({
      churchId,
      serviceName,
      date: date ? new Date(date) : new Date(),
      attendedMembers: [],
    });
    await newEvent.save();

    console.log('Event saved in DB');
    

    // Generate QR code for this specific pre-scheduled event path
    const qrCodeImage = await generateEventQR(churchId, serviceName);

    console.log('Generated QR successfully.');
    

    res.status(201).json({
      success: true,
      event: newEvent,
      qrCode: qrCodeImage,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to create event: " + error.message });
  }
};

// 3. FIND OR CREATE (Automated Mobile Check-In Gatekeeper Flow)
export const findOrCreate = async (req, res) => {
  const { churchId, serviceName } = req.body;

  // Normalize the date to just midnight UTC so we match the exact calendar day
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  try {
    let event = await AttendanceEvent.findOne({
      churchId,
      serviceName,
      date: today,
    });

    if (!event) {
      event = new AttendanceEvent({
        churchId,
        serviceName,
        date: today,
        attendedMembers: [],
      });
      await event.save();
    }

    // Generate or fetch QR code for today's active tracking card
    const qrCodeImage = await generateEventQR(churchId, serviceName);

    res.status(200).json({
      success: true,
      eventId: event._id,
      serviceName: event.serviceName,
      date: event.date,
      qrCode: qrCodeImage,
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to initialize service instance: " + error.message,
    });
  }
};

// 4. GET DASHBOARD ANALYTICS
export const getAnalytics = async (req, res) => {
  const { churchId } = req.params;
  const { serviceName } = req.query; // e.g., ?serviceName=Sunday Service

  try {
    // Fixed inline require crash by using the native imported mongoose instance
    const matchStage = { churchId: new mongoose.Types.ObjectId(churchId) };

    if (serviceName) {
      matchStage.serviceName = serviceName;
    }

    const analytics = await AttendanceEvent.aggregate([
      { $match: matchStage },
      { $sort: { date: -1 } },
      { $limit: 4 }, // Last 4 occurrences of this specific service type
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
  const { churchId } = req.body;

  try {
    // 1. Calculate the date threshold for 3 weeks ago
    const threeWeeksAgo = new Date();
    threeWeeksAgo.setDate(threeWeeksAgo.getDate() - 21);

    // 2. Find all service event IDs that have happened in the last 3 weeks for this church
    const recentEvents = await AttendanceEvent.find({
      churchId,
      date: { $gte: threeWeeksAgo },
    }).select("_id");

    const recentEventIds = recentEvents.map((event) => event._id);

    if (recentEventIds.length === 0) {
      return res
        .status(200)
        .json({ message: "Not enough recent data to calculate trends." });
    }

    // 3. Find members who HAVE attended at least one event in the last 3 weeks
    const activeAttendees = await AttendanceEvent.distinct("attendedMembers", {
      _id: { $in: recentEventIds },
    });

    // 4. Update statuses based on active presence parameters

    // Condition A: If they are NOT in the active list, flag them as 'at-risk' (Fixed $nio -> $nin typo)
    const flaggedResult = await Member.updateMany(
      {
        churchId,
        _id: { $nin: activeAttendees },
        status: "active",
      },
      { $set: { status: "at-risk" } },
    );

    // Condition B: If they ARE in the active list but were previously marked 'at-risk', restore them
    const restoredResult = await Member.updateMany(
      {
        churchId,
        _id: { $in: activeAttendees },
        status: "at-risk",
      },
      { $set: { status: "active" } },
    );

    res.status(200).json({
      success: true,
      message: "Retention profiles updated successfully.",
      stats: {
        newlyFlaggedAtRisk: flaggedResult.modifiedCount,
        restoredToActive: restoredResult.modifiedCount,
      },
    });
  } catch (error) {
    res
      .status(500)
      .json({ error: "Retention engine calculation failed: " + error.message });
  }
};

// 6. LIVE FEED FOR EACH SERVICES

export const getLiveFeed = async (req, res) => {
  const { churchId } = req.params;

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  try {
    const liveEvent = await AttendanceEvent.findOne({
      churchId,
      date: today,
    }).populate({
      path: "attendedMembers",
      select: "fullName phoneNumber attendanceStatus profession",
    });

    if (!liveEvent) {
      return res.status(200).json({
        success: true,
        message: "No active service instance initialized for today yet.",
        stats: { total: 0, firstTimers: 0, returning: 0, regulars: 0 },
        attendees: [],
      });
    }

    // Run distribution breakdown calculations on the populated array
    const attendees = liveEvent.attendedMembers;
    const stats = attendees.reduce(
      (acc, member) => {
        acc.total++;
        if (member.attendanceStatus === "First Timer") acc.firstTimers++;
        else if (member.attendanceStatus === "Returning Visitor")
          acc.returning++;
        else if (member.attendanceStatus === "Regular Member") acc.regulars++;
        return acc;
      },
      { total: 0, firstTimers: 0, returning: 0, regulars: 0 },
    );

    res.status(200).json({ success: true, stats, attendees });
  } catch (error) {
    res
      .status(500)
      .json({ error: "Failed to compile live feed: " + error.message });
  }
};


// 7. MONTHLY BIRTHDAY LISTER

export const getMonthlyBirthdays = async (req, res) => {
  const { churchId } = req.params;

  try {
    // Determine current month in MM format (e.g., June -> '06')
    const currentMonthStr = String(new Date().getMonth() + 1).padStart(2, '0');
    
    // Match any string ending with '/' followed by the current month (e.g., .*\/06)
    const birthdayRegex = new RegExp(`^\\d{2}/${currentMonthStr}$`);

    const celebrants = await Member.find({
      churchId,
      birthday: { $regex: birthdayRegex }
    }).select('fullName phoneNumber birthday profession');

    // Sort them chronologically by day
    const sortedCelebrants = celebrants.sort((a, b) => {
      return parseInt(a.birthday.split('/')[0]) - parseInt(b.birthday.split('/')[0]);
    });

    res.status(200).json({ 
      success: true, 
      month: currentMonthStr,
      count: sortedCelebrants.length, 
      celebrants: sortedCelebrants 
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to build monthly birthday tracker: " + error.message });
  }
};


// 8. FUNCTION TO GET PEOPLE WHO NEED FOLLOW-UP

export const getFollowUpPipeline = async (req, res) => {
  const { churchId } = req.params;

  try {
    // Pipeline A: Grab any new visitor recorded in the system
    const visitors = await Member.find({
      churchId,
      attendanceStatus: { $in: ['First Timer', 'Returning Visitor'] }
    }).select('fullName phoneNumber attendanceStatus joinedAt');

    // Pipeline B: Grab long-term regular members flagged as slipping away
    const atRiskMembers = await Member.find({
      churchId,
      status: 'at-risk'
    }).select('fullName phoneNumber profession joinedAt');

    res.status(200).json({
      success: true,
      pipeline: {
        visitorFollowUpCount: visitors.length,
        visitorFollowUpList: visitors,
        atRiskCount: atRiskMembers.length,
        atRiskList: atRiskMembers
      }
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to compile care group pipeline: " + error.message });
  }
};
