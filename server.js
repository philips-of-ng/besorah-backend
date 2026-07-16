import 'dotenv/config'; // Absolute first line to safely inject environment variables
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';

// Import Routes
import authRoutes from './routes/authRoutes.js';
import churchRoutes from './routes/churchRoutes.js';
import attendanceRoutes from './routes/attendanceRoutes.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Mount Routes
app.use('/api/auth', authRoutes);
app.use('/api/church', churchRoutes);
app.use('/api/attendance', attendanceRoutes);

// Basic Health Check Route
app.get('/', (req, res) => {
  res.status(200).json({ message: "Besorah Backend API is up and running!" });
});

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log("🚀 Successfully connected to MongoDB.");
    
    app.listen(PORT, () => {
      console.log(`Server is running on port ${process.env.PORT}`);
    });
  })
  .catch((error) => {
    console.error("❌ Database connection error:", error.message);
    process.exit(1);
  });


module.exports = app