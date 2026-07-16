import Member from "../models/Member.js";
import AttendanceEvent from "../models/AttendanceEvent.js";
import mongoose from "mongoose";

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
