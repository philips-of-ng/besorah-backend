import mongoose from "mongoose";

const MemberSchema = new mongoose.Schema({
  churchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Church",
    required: true,
  },
  fullName: {
    type: String,
    required: true,
    trim: true,
  },
  phoneNumber: {
    type: String,
    required: true,
    trim: true,
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
    default: "", // Handled cleanly now that it's out of the unique restriction
  },
  profession: {
    type: String,
    required: false,
    trim: true,
  },
  birthday: {
    type: String,
    required: false,
    trim: true,
  },
  attendanceStatus: {
    // Added to track First Timer / Returning Visitor / Regular Member choices
    type: String,
    required: false,
  },
  status: {
    type: String,
    enum: ["active", "at-risk", "inactive"],
    default: "active",
  },
  joinedAt: {
    type: Date,
    default: Date.now,
  },
  lastFollowUpDate: {
    type: Date,
    default: null,
  },
  followUpCount: {
    type: Number,
    default: 0,
  },
});

// Enforce unique phone numbers *per church ecosystem*
MemberSchema.index({ churchId: 1, phoneNumber: 1 }, { unique: true });

const Member = mongoose.model("Member", MemberSchema);
export default Member;
