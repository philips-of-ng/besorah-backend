import mongoose from "mongoose";

const MemberSchema = new mongoose.Schema({
  churchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Church',
    required: true
  },
  fullName: {
    type: String,
    required: true,
    trim: true
  },
  phoneNumber: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
    default: ""
  },
  status: {
    type: String,
    enum: ['active', 'at-risk', 'inactive'],
    default: 'active'
  },
  joinedAt: {
    type: Date,
    default: Date.now
  }
});

// We create a compound index so phone numbers are unique *per church*
MemberSchema.index({ churchId: 1, phoneNumber: 1 }, { unique: true });

const Member = mongoose.model('Member', MemberSchema);
export default Member