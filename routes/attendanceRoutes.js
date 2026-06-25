const express = require('express');
const router = express.Router();
const Member = require('../models/Member');
const AttendanceEvent = require('../models/AttendanceEvent');

// Unified Form Submission (Check-In & Auto-Registration)
router.post('/check-in', async (req, res) => {
  const { eventId, churchId, fullName, phoneNumber, email } = req.body;

  if (!eventId || !churchId || !fullName || !phoneNumber) {
    return res.status(400).json({ error: "Missing required fields." });
  }

  try {
    // 1. Look for an existing member by phone number within this specific church
    let member = await Member.findOne({ churchId, phoneNumber });
    let isNewMember = false;

    // 2. If they don't exist, create their member profile on the fly
    if (!member) {
      member = new Member({
        churchId,
        fullName,
        phoneNumber,
        email: email || "",
        status: 'active'
      });
      await member.save();
      isNewMember = true;
    }

    // 3. Add their member ID to the attendance event's tracking array
    // $addToSet prevents duplicate entries if they submit the form twice
    const updatedEvent = await AttendanceEvent.findByIdAndUpdate(
      eventId,
      { $addToSet: { attendedMembers: member._id } },
      { new: true }
    );

    if (!updatedEvent) {
      return res.status(404).json({ error: "Attendance event not found." });
    }

    // 4. Return customized context back to the frontend
    res.status(200).json({
      success: true,
      message: isNewMember ? "Welcome! Thank you for joining us for the first time." : "Welcome back!",
      memberName: member.fullName
    });

  } catch (error) {
    res.status(500).json({ error: "Check-in processing failed: " + error.message });
  }
});

module.exports = router;