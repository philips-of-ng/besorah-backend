import mongoose from "mongoose";

const AttendanceEventSchema = new mongoose.Schema({
  churchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Church',
    required: true
  },
  serviceName: {
    type: String,
    required: true, // e.g., "Sunday Service", "Wednesday Bible Study"
    trim: true
  },
  date: {
    type: Date,
    required: true // The specific calendar date of this occurrence
  },
  attendedMembers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Member'
  }],
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Index to ensure we don't accidentally create duplicate instances of the same service on the same day
AttendanceEventSchema.index({ churchId: 1, serviceName: 1, date: 1 }, { unique: true });

const AttendanceEvent = mongoose.model('AttendanceEvent', AttendanceEventSchema);
export default AttendanceEvent