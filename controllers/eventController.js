// controllers/eventController.js
import EventType from "../models/eventModel.js"; 

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
  createEventType,
  getEventTypes
};

export default eventController;