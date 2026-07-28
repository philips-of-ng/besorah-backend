import "dotenv/config"; // Absolute first line to safely inject environment variables
import express from "express";
import mongoose from "mongoose";
import cors from "cors";

// Import Routes
import authRoutes from "./routes/authRoutes.js";
import churchRoutes from "./routes/churchRoutes.js";
import attendanceRoutes from "./routes/attendanceRoutes.js";
import eventRoutes from "./routes/eventRoutes.js";
import memberRoutes from "./routes/memberRoutes.js";
import analyticsRoutes from "./routes/analyticsRoutes.js";
import retentionRoutes, {
  attendanceRetentionRouter,
} from "./routes/retentionRoutes.js";

const app = express();
// const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Mount Routes
app.use("/api/auth", authRoutes);
app.use("/api/church", churchRoutes);
app.use("/api/church", eventRoutes);
app.use("/api/church", memberRoutes);
app.use("/api/church", analyticsRoutes);
app.use("/api/church", retentionRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/attendance", attendanceRetentionRouter);

// Basic Health Check Route
app.get("/", (req, res) => {
  res.status(200).json({ message: "Besorah Backend API is up and running!" });
});

// MongoDB Connection
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("🚀 Successfully connected to MongoDB.");

    if (process.env.NODE_ENV !== "production") {
      const PORT = process.env.PORT || 5000;
      app.listen(PORT, () => {
        console.log(`Local development server running on port ${PORT}`);
      });
    }
  })
  .catch((error) => {
    console.error("❌ Database connection error:", error.message);
    process.exit(1);
  });

export default app;
