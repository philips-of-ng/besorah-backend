const express = require('express');
const router = express.Router();
const Church = require('../models/Church');
const AttendanceEvent = require('../models/AttendanceEvent');

// 1. Register a New Church
router.post('/register', async (req, res) => {
  const { name, location } = req.body;
  try {
    const newChurch = new Church({ name, location });
    await newChurch.save();
    res.status(201).json({ success: true, church: newChurch });
  } catch (error) {
    res.status(500).json({ error: "Failed to register church: " + error.message });
  }
});


// 2. Create an Attendance Event (Generates the ID for the QR code)
router.post('/event', async (req, res) => {
  const { churchId, serviceName, date } = req.body;
  try {
    const newEvent = new AttendanceEvent({
      churchId,
      serviceName,
      date: date ? new Date(date) : new Date(),
      attendedMembers: []
    });
    await newEvent.save();
    res.status(201).json({ success: true, event: newEvent });
  } catch (error) {
    res.status(500).json({ error: "Failed to create event: " + error.message });
  }
});


// Get or automatically initialize a constant service instance for today
router.post('/event/active', async (req, res) => {
  const { churchId, serviceName } = req.body;

  // Normalize the date to just midnight UTC so we match the exact calendar day
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  try {
    // Find or Create logic (Upsert style)
    let event = await AttendanceEvent.findOne({
      churchId,
      serviceName,
      date: today
    });

    if (!event) {
      event = new AttendanceEvent({
        churchId,
        serviceName,
        date: today,
        attendedMembers: []
      });
      await event.save();
    }

    res.status(200).json({ success: true, eventId: event._id, serviceName: event.serviceName, date: event.date });
  } catch (error) {
    res.status(500).json({ error: "Failed to initialize service instance: " + error.message });
  }
});


// Get Dashboard Analytics for a specific service type
router.get('/analytics/:churchId', async (req, res) => {
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
});



module.exports = router;


