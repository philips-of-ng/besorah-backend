// models/AttendanceLog.js
import mongoose from 'mongoose';

const AttendanceLogSchema = new mongoose.Schema({
  churchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Church', required: true },
  eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'AttendanceEvent', required: true },
  memberId: { type: mongoose.Schema.Types.ObjectId, ref: 'Member', required: true },
  memberStatus: { type: String, enum: ['First Timer', 'Returning Visitor', 'Regular Member'] },
  scannedAt: { type: Date, default: Date.now } // 🌟 This makes the timeline graph real!
});

export default mongoose.model('AttendanceLog', AttendanceLogSchema);