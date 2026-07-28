import mongoose from "mongoose";
import QRCode from "qrcode";
import EventType from "../models/eventModel.js";
import AttendanceEvent from "../models/AttendanceEvent.js";

// Centralizes the QR target-link contract used by attendance events.
const generateEventQR = async (churchId, eventId, serviceName) => {
  const targetRedirectUrl = `http://bsr.devphilips.com/checkin?churchId=${churchId}&loc=${eventId}&serviceName=${encodeURIComponent(serviceName)}`;

  return await QRCode.toDataURL(targetRedirectUrl, {
    errorCorrectionLevel: "H",
    margin: 2,
    width: 300,
  });
};

// CREATE AN EVENT (Admin Manual / Frontend Setup View Trigger Channel)
export const createEvent = async (req, res) => {
  console.log("Body of the request:", req.body);
  const { churchId, serviceName, date } = req.body;

  if (!churchId || !serviceName) {
    return res
      .status(400)
      .json({ success: false, message: "Missing required parameters." });
  }

  try {
    const inputDate = date ? new Date(date) : new Date();
    const startOfDay = new Date(inputDate.setHours(0, 0, 0, 0));
    const endOfDay = new Date(inputDate.setHours(23, 59, 59, 999));

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
        date: startOfDay,
        attendedMembers: [],
      });
      await event.save();
      statusCode = 201;
      console.log("Event saved in DB");
    }

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

// FIND OR CREATE (Automated Mobile Check-In Gatekeeper Flow)
export const findOrCreate = async (req, res) => {
  const { churchId, serviceName } = req.body;

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

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const event = new AttendanceEvent({
      churchId: cleanChurchId,
      serviceName,
      date: todayStart,
      status: "active",
      attendedMembers: [],
    });

    await event.save();

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

export const endActiveService = async (req, res) => {
  const { churchId, eventId } = req.body;

  if (!churchId || !eventId) {
    return res.status(400).json({
      success: false,
      message:
        "Missing termination context: both churchId and eventId parameters are required.",
    });
  }

  try {
    if (
      !mongoose.Types.ObjectId.isValid(churchId) ||
      !mongoose.Types.ObjectId.isValid(eventId)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid configuration signatures provided for structural IDs.",
      });
    }

    const closedEvent = await AttendanceEvent.findOneAndUpdate(
      { _id: eventId, churchId, status: "active" },
      { $set: { status: "completed" } },
      { returnDocument: "after" },
    );

    if (!closedEvent) {
      return res.status(404).json({
        success: false,
        message:
          "Active target session instance not found or already closed out.",
      });
    }

    return res.status(200).json({
      success: true,
      message: `The service session '${closedEvent.serviceName}' has been successfully finalized. All active scanning paths are now closed.`,
      eventId: closedEvent._id,
      status: closedEvent.status,
    });
  } catch (error) {
    console.error("Exception caught clearing live active operations:", error);
    return res.status(500).json({
      success: false,
      message:
        "Operational system fault encountered while closing session: " +
        error.message,
    });
  }
};

export const createEventType = async (req, res) => {
  try {
    const { churchId, name, isRecurring, recurringDay } = req.body;
    
    if (!churchId || !name) {
      return res.status(400).json({ success: false, message: 'Missing parameters.' });
    }

    const existingType = await EventType.findOne({ churchId, name: { $regex: new RegExp(`^${name.trim()}$`, 'i') } });
    if (existingType) {
      return res.status(409).json({ success: false, message: 'Event type already exists.' });
    }

    const newEventType = new EventType({
      churchId,
      name: name.trim(),
      isRecurring,
      recurringDay: isRecurring ? recurringDay : null
    });

    await newEventType.save();
    return res.status(201).json({ success: true, eventType: newEventType });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Server error saving event schema.' });
  }
};

export const getEventTypes = async (req, res) => {
  try {
    const { churchId } = req.query;
    if (!churchId) return res.status(400).json({ success: false, message: 'churchId required.' });

    const types = await EventType.find({ churchId }).sort({ createdAt: 1 });
    return res.status(200).json({
      success: true,
      types: types.map(t => ({ name: t.name, isRecurring: t.isRecurring, recurringDay: t.recurringDay }))
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Server error fetching event schemas.' });
  }
};

// 🌟 ADD THIS DEF-OUT BUNDLE SO INDIVIDUAL NAMED ASSIGNMENTS BECOME IDENTIFIABLE
const eventController = {
  createEvent,
  findOrCreate,
  endActiveService,
  createEventType,
  getEventTypes,
};

export default eventController;
