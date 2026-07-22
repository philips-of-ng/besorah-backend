import mongoose from "mongoose";

// 🌟 SUBDOCUMENT SCHEMA: Pairs each member with their exact check-in timestamp
const AttendeeSchema = new mongoose.Schema(
  {
    memberId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Member",
      required: true,
    },
    scannedAt: {
      type: Date,
      default: Date.now, // 🌟 Captures the exact moment they checked in
    },
  },
  { _id: false },
); // Prevents MongoDB from generating unnecessary subdocument ObjectIDs

const AttendanceEventSchema = new mongoose.Schema({
  churchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Church",
    required: true,
  },
  serviceName: {
    type: String,
    required: true, // e.g., "Sunday Service", "Wednesday Bible Study"
    trim: true,
  },
  date: {
    type: Date,
    required: true, // The specific calendar date of this occurrence
  },
  status: {
    type: String,
    enum: ["active", "completed"],
    default: "active",
  },
  // 🌟 Transitioned from a raw ObjectID array to the time-tracking subdocument array
  attendedMembers: [AttendeeSchema],
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Index to ensure we don't accidentally create duplicate instances of the same service on the same day
AttendanceEventSchema.index(
  { churchId: 1, serviceName: 1, date: 1 },
  { unique: true },
);

const AttendanceEvent = mongoose.model(
  "AttendanceEvent",
  AttendanceEventSchema,
);
export default AttendanceEvent;
