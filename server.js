const express = require('express');
const cors = require('cors');
require('dotenv').config();
const path = require('path');
const pool = require('./config/db');

// Import Route Modules
const authRoutes = require('./routes/authRoutes');
const profileRoutes = require('./routes/profileRoutes');
const matchRoutes = require('./routes/matchRoutes');
const podRoutes = require('./routes/podRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static frontend files from 'public' folder
app.use(express.static(path.join(__dirname, 'public')));

// Mount All API Routes securely
app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/matches', matchRoutes);
app.use('/api/pods', podRoutes);

// Health Check Route
app.get('/api/health', async (req, res) => {
    try {
        const result = await pool.query('SELECT NOW()');
        res.json({ status: 'success', dbTime: result.rows[0].now });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database connection failed' });
    }
});

// Start Server
app.listen(PORT, () => {
    console.log(`CampusSync backend server running on port ${PORT}`);
});