import express from "express";
const router = express.Router();
import Member from "../models/Member.js";
import mongoose from "mongoose";
import AttendanceEvent from '../models/AttendanceEvent.js'

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

export const findOrCreate = async (req, res) => {
  const { churchId, serviceName, date } = req.body;
  try {
    const newEvent = new AttendanceEvent({
      churchId,
      serviceName,
      date: date ? new Date(date) : new Date(),
      attendedMembers: [],
    });
    await newEvent.save();
    res.status(201).json({ success: true, event: newEvent });
  } catch (error) {
    res.status(500).json({ error: "Failed to create event: " + error.message });
  }
};

export const createEvent = async (req, res) => {
  const { churchId, serviceName } = req.body;

  // Normalize the date to just midnight UTC so we match the exact calendar day
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  try {
    // Find or Create logic (Upsert style)
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

    res
      .status(200)
      .json({
        success: true,
        eventId: event._id,
        serviceName: event.serviceName,
        date: event.date,
      });
  } catch (error) {
    res
      .status(500)
      .json({
        error: "Failed to initialize service instance: " + error.message,
      });
  }
};

export const getAnalytics = async (req, res) => {
  const { churchId } = req.params;
  const { serviceName } = req.query; // e.g., ?serviceName=Sunday Service

  try {
    const matchStage = { churchId: new require('mongoose').Types.ObjectId(churchId) };
    
    // If a pastor wants to see a specific constant service, filter by it
    if (serviceName) {
      matchStage.serviceName = serviceName;
    }

    const analytics = await AttendanceEvent.aggregate([
      { $match: matchStage },
      { $sort: { date: -1 } },
      { $limit: 4 }, // Last 4 occurrences of this specific service type
      {
        $lookup: {
          from: 'members',
          localField: 'attendedMembers',
          foreignField: '_id',
          as: 'memberDetails'
        }
      },
      {
        $project: {
          _id: 1,
          serviceName: 1,
          date: 1,
          totalAttendance: { $size: '$attendedMembers' },
          newVisitors: {
            $size: {
              $filter: {
                input: '$memberDetails',
                as: 'member',
                cond: {
                  $eq: [
                    { $dateToString: { format: "%Y-%m-%d", date: "$$member.joinedAt" } },
                    { $dateToString: { format: "%Y-%m-%d", date: "$date" } }
                  ]
                }
              }
            }
          }
        }
      },
      { $sort: { date: 1 } }
    ]);

    res.status(200).json({ success: true, data: analytics });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch analytics: " + error.message });
  }
}





export const checkMemberRetention = async (req, res) => {
  const { churchId } = req.body;

  try {
    // 1. Calculate the date threshold for 3 weeks ago
    const threeWeeksAgo = new Date();
    threeWeeksAgo.setDate(threeWeeksAgo.getDate() - 21);

    // 2. Find all service event IDs that have happened in the last 3 weeks for this church
    const recentEvents = await AttendanceEvent.find({
      churchId,
      date: { $gte: threeWeeksAgo }
    }).select('_id');

    const recentEventIds = recentEvents.map(event => event._id);

    // If there haven't been any events in 3 weeks, we can't accurately track retention yet
    if (recentEventIds.length === 0) {
      return res.status(200).json({ message: "Not enough recent data to calculate trends." });
    }

    // 3. Find members who HAVE attended at least one event in the last 3 weeks
    const activeAttendees = await AttendanceEvent.distinct('attendedMembers', {
      _id: { $in: recentEventIds }
    });

    // 4. Multi-write operations: Update statuses based on the results
    
    // Condition A: If they are NOT in the active list, flag them as 'at-risk'
    await Member.updateMany(
      {
        churchId,
        _id: { $nio: activeAttendees }, // Not In the active attendees list
        status: 'active'
      },
      { $set: { status: 'at-risk' } }
    );

    // Condition B: If they ARE in the active list but were previously marked 'at-risk', restore them
    await Member.updateMany(
      {
        churchId,
        _id: { $in: activeAttendees },
        status: 'at-risk'
      },
      { $set: { status: 'active' } }
    );

    res.status(200).json({ success: true, message: "Retention profiles updated successfully." });

  } catch (error) {
    res.status(500).json({ error: "Retention engine calculation failed: " + error.message });
  }
};

