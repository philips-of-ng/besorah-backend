const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;


app.use(cors());
app.use(express.json());

// Import Routes
const churchRoutes = require('./routes/churchRoutes');
const attendanceRoutes = require('./routes/attendanceRoutes');

// Mount Routes
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
      console.log(`Server is running on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error("❌ Database connection error:", error.message);
    process.exit(1);
  });