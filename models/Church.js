import mongoose from "mongoose";

const ChurchSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  location: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  // the ffl info are for syncing to google
  googleRefreshToken: { type: String, default: null }, // Used to keep the connection alive
  googleConnectedEmail: { type: String, default: null },

  // Maps service names to their respective Google Sheet File IDs
  syncedSheets: {
    type: Map,
    of: String, // Key: "Sunday Service", Value: "1sO9vXG7..." (Google Sheet ID)
    default: {},
  },
});

const Church = mongoose.model("Church", ChurchSchema);
export default Church;
