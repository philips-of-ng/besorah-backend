import mongoose from "mongoose";
import Member from "../models/Member.js";
import AttendanceEvent from "../models/AttendanceEvent.js";

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

    member.lastFollowUpDate = new Date();
    member.status = "active";
    member.followUpCount = (member.followUpCount || 0) + 1;

    if (member.attendanceStatus === "First Timer") {
      member.attendanceStatus = "Returning Visitor";
    } else if (member.attendanceStatus === "Returning Visitor") {
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
    if (!mongoose.Types.ObjectId.isValid(memberId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid member ID structure.",
      });
    }

    const member = await Member.findById(memberId);
    if (!member) {
      return res.status(404).json({
        success: false,
        message: "Member profile not found.",
      });
    }

    const history = await AttendanceEvent.find({
      "attendedMembers.memberId": memberId,
    })
      .sort({ date: -1 })
      .select("serviceName date");

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
        eventName: event.serviceName,
        date: event.date,
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

export const getAllMembers = async (req, res) => {
  try {
    const { churchId } = req.query;

    if (!churchId) {
      return res.status(400).json({
        success: false,
        message: "Missing required parameter: churchId is mandatory.",
      });
    }

    const members = await Member.find({ churchId }).sort({ joinedAt: -1 });

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

export const checkMemberRetention = async (req, res) => {
  const { churchId, threshold } = req.body;

  if (!churchId) {
    return res.status(400).json({
      success: false,
      message: "Missing required string parameter: churchId.",
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
    const weeksThresholdMultiplier =
      threshold && !isNaN(parseInt(threshold)) ? parseInt(threshold) : 3;
    const totalDaysSpanWindow = weeksThresholdMultiplier * 7;

    const historicalThresholdDate = new Date();
    historicalThresholdDate.setDate(
      historicalThresholdDate.getDate() - totalDaysSpanWindow,
    );

    const recentEvents = await AttendanceEvent.find({
      churchId: cleanChurchId,
      date: { $gte: historicalThresholdDate },
    }).select("_id");

    const recentEventIds = recentEvents.map((event) => event._id);

    if (recentEventIds.length === 0) {
      return res.status(200).json({
        success: true,
        message:
          "Scan executed. Insufficient historical data parameters available inside this threshold week span window.",
        stats: { newlyFlaggedAtRisk: 0, restoredToActive: 0 },
      });
    }

    const activeAttendees = await AttendanceEvent.distinct(
      "attendedMembers.memberId",
      {
        _id: { $in: recentEventIds },
      },
    );

    const gracePeriodDate = new Date();
    gracePeriodDate.setDate(gracePeriodDate.getDate() - 7);

    const candidates = await Member.find({
      churchId: cleanChurchId,
      _id: { $nin: activeAttendees },
      status: "active",
    });

    console.log("\n--- ðŸ” RETENTION SWEEP DATABASE STATE DEBUG ðŸ” ---");
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

    const flaggedResult = await Member.updateMany(
      {
        churchId: cleanChurchId,
        _id: { $nin: activeAttendees },
        status: "active",
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
      `ðŸ’¡ Sweep completed. Newly Flagged: ${flaggedResult.modifiedCount || 0} | Restored: ${restoredResult.modifiedCount || 0}\n`,
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
