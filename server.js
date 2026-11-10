const express = require('express');
const cors = require('cors');
const http = require('http');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
require('dotenv').config();
const path = require('path');
const pool = require('./config/db');

// Import Route Modules
const authRoutes = require('./routes/authRoutes');
const profileRoutes = require('./routes/profileRoutes');
const matchRoutes = require('./routes/matchRoutes');
const podRoutes = require('./routes/podRoutes');
const universityRoutes = require('./routes/universityRoutes');
const aiRoutes = require('./routes/aiRoutes');
const feedbackRoutes = require('./routes/feedbackRoutes');
const tutorRoutes = require('./routes/tutorRoutes');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 5000;
const POD_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_CHAT_MESSAGE_LENGTH = 2000;

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
app.use('/api/universities', universityRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/tutors', tutorRoutes);

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

io.use((socket, next) => {
    const token = socket.handshake.auth && socket.handshake.auth.token;
    if (typeof token !== 'string' || !token) {
        return next(new Error('Authentication required.'));
    }

    try {
        const user = jwt.verify(token, process.env.JWT_SECRET);
        if (!user || typeof user.id !== 'string') {
            return next(new Error('Invalid authentication token.'));
        }
        socket.data.userId = user.id;
        return next();
    } catch (error) {
        return next(new Error('Invalid or expired authentication token.'));
    }
});

io.on('connection', socket => {
    socket.data.podRooms = new Set();
    socket.emit('chat_identity', { userId: socket.data.userId });

    socket.on('join_pod', async (podId, acknowledge = () => {}) => {
        const respond = typeof acknowledge === 'function' ? acknowledge : () => {};
        if (!POD_ID_PATTERN.test(podId)) {
            respond({ error: 'A valid study pod ID is required.' });
            return;
        }

        try {
            const membership = await pool.query(
                'SELECT 1 FROM pod_members WHERE pod_id = $1 AND user_id = $2',
                [podId, socket.data.userId]
            );
            if (membership.rows.length === 0) {
                respond({ error: 'Only pod members can join pod chat.' });
                return;
            }

            const room = `pod_${podId}`;
            await socket.join(room);
            socket.data.podRooms.add(room);
            respond({ success: true });
        } catch (error) {
            console.error('Error authorizing pod chat room:', error);
            respond({ error: 'Unable to join pod chat.' });
        }
    });

    socket.on('leave_pod', async (podId, acknowledge = () => {}) => {
        const respond = typeof acknowledge === 'function' ? acknowledge : () => {};
        if (!POD_ID_PATTERN.test(podId)) {
            respond({ error: 'A valid study pod ID is required.' });
            return;
        }
        const room = `pod_${podId}`;
        await socket.leave(room);
        socket.data.podRooms.delete(room);
        respond({ success: true });
    });

    socket.on('send_message', async (payload, acknowledge = () => {}) => {
        const respond = typeof acknowledge === 'function' ? acknowledge : () => {};
        const podId = payload && payload.podId;
        const messageText = payload && payload.messageText;
        if (!POD_ID_PATTERN.test(podId)) {
            respond({ error: 'A valid study pod ID is required.' });
            return;
        }
        if (typeof messageText !== 'string' || !messageText.trim() || messageText.trim().length > MAX_CHAT_MESSAGE_LENGTH) {
            respond({ error: `Messages must contain 1 to ${MAX_CHAT_MESSAGE_LENGTH} characters.` });
            return;
        }

        const room = `pod_${podId}`;
        if (!socket.data.podRooms.has(room)) {
            respond({ error: 'Join this pod chat before sending a message.' });
            return;
        }

        try {
            const result = await pool.query(
                `WITH sender AS (
                    SELECT users.id, users.full_name
                    FROM pod_members
                    JOIN users ON users.id = pod_members.user_id
                    WHERE pod_members.pod_id = $1 AND pod_members.user_id = $2
                ),
                inserted AS (
                    INSERT INTO pod_chat_messages (pod_id, user_id, message_text)
                    SELECT $1, sender.id, $3 FROM sender
                    RETURNING id, pod_id, user_id, message_text, created_at
                )
                SELECT inserted.*, sender.full_name
                FROM inserted JOIN sender ON sender.id = inserted.user_id`,
                [podId, socket.data.userId, messageText.trim()]
            );
            if (result.rows.length === 0) {
                await socket.leave(room);
                socket.data.podRooms.delete(room);
                respond({ error: 'Only current pod members can send messages.' });
                return;
            }

            const message = result.rows[0];
            io.to(room).emit('receive_message', message);
            respond({ success: true, message });
        } catch (error) {
            console.error('Error saving pod chat message:', error);
            respond({ error: 'Failed to send message.' });
        }
    });
});

server.listen(PORT, () => {
    console.log(`CampusSync backend server running on port ${PORT}`);
});