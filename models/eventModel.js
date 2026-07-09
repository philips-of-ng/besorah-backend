// models/EventType.js
import mongoose from "mongoose";

const EventTypeSchema = new mongoose.Schema(
  {
    churchId: {
      type: String, // or mongoose.Schema.Types.ObjectId if referencing a Church model
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    isRecurring: {
      type: Boolean,
      default: true,
    },
    recurringDay: {
      type: Number, // 0 = Sunday, 1 = Monday, etc.
      default: null,
      // Ensure that if it is recurring, a day index is provided
      validate: {
        validator: function (v) {
          if (this.isRecurring && v === null) return false;
          return true;
        },
        message: "Recurring events must declare a day of the week index.",
      },
    },
  },
  { timestamps: true },
);

// Prevent creating a duplicate event name for the same church
EventTypeSchema.index({ churchId: 1, name: 1 }, { unique: true });

const EventType = mongoose.model("EventType", EventTypeSchema);
export default EventType;
