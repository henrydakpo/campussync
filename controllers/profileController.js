const pool = require('../config/db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const VALID_STATUSES = ['learning', 'teaching'];
const SLOT_PATTERN = /^[A-Z]{3}_[0-9]{2}_[0-9]{2}$/;
const VALID_ROLES = ['student_seeking_help', 'peer_tutor', 'both'];

// Get the signed-in user's saved courses and availability
async function getUserProfile(req, res) {
    const userId = req.user.id;

    try {
        const [userResult, coursesResult, availabilityResult] = await Promise.all([
            pool.query(
                'SELECT id, full_name, email, role, university_id FROM users WHERE id = $1',
                [userId]
            ),
            pool.query(
                `SELECT uc.course_id, uc.status, c.course_title, c.department, c.core_topics
                 FROM user_courses uc
                 JOIN courses c ON c.id = uc.course_id
                 WHERE uc.user_id = $1
                 ORDER BY c.course_title ASC`,
                [userId]
            ),
            pool.query(
                `SELECT time_slot_code
                 FROM availabilities
                 WHERE user_id = $1
                 ORDER BY time_slot_code ASC`,
                [userId]
            )
        ]);

        return res.json({
            success: true,
            user: userResult.rows[0],
            courses: coursesResult.rows,
            availabilities: availabilityResult.rows.map(row => row.time_slot_code)
        });
    } catch (err) {
        console.error("Error fetching profile:", err);
        return res.status(500).json({ error: "Failed to fetch profile." });
    }
}

async function updateUserSettings(req, res) {
    const userId = req.user.id;
    const { fullName, email, role, currentPassword, newPassword } = req.body;

    if (typeof fullName !== 'string' || !fullName.trim()) {
        return res.status(400).json({ error: "Full name is required." });
    }
    if (fullName.trim().length > 255) {
        return res.status(400).json({ error: "Full name must be 255 characters or fewer." });
    }
    if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        return res.status(400).json({ error: "A valid email address is required." });
    }
    if (typeof role !== 'string' || !VALID_ROLES.includes(role)) {
        return res.status(400).json({ error: "Role must be student_seeking_help, peer_tutor, or both." });
    }

    const changingPassword = currentPassword !== undefined || newPassword !== undefined;
    if (changingPassword) {
        if (typeof currentPassword !== 'string' || !currentPassword) {
            return res.status(400).json({ error: "Enter your current password to change it." });
        }
        if (typeof newPassword !== 'string' || newPassword.length < 8) {
            return res.status(400).json({ error: "New password must be at least 8 characters." });
        }
    }

    const normalizedEmail = email.trim().toLowerCase();
    try {
        const userResult = await pool.query(
            'SELECT password_hash FROM users WHERE id = $1',
            [userId]
        );
        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: "Account not found." });
        }

        let passwordHash;
        if (changingPassword) {
            const passwordMatches = await bcrypt.compare(currentPassword, userResult.rows[0].password_hash);
            if (!passwordMatches) {
                return res.status(400).json({ error: "Current password is incorrect." });
            }
            passwordHash = await bcrypt.hash(newPassword, 10);
        }

        const result = await pool.query(
            `UPDATE users
             SET full_name = $1, email = $2, role = $3,
                 password_hash = COALESCE($4, password_hash)
             WHERE id = $5
             RETURNING id, full_name, email, role`,
            [fullName.trim(), normalizedEmail, role, passwordHash || null, userId]
        );
        const user = result.rows[0];
        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        return res.json({
            success: true,
            message: "Account settings updated.",
            token,
            user: {
                id: user.id,
                fullName: user.full_name,
                email: user.email,
                role: user.role
            }
        });
    } catch (err) {
        if (err.code === '23505') {
            return res.status(409).json({ error: "An account with this email already exists." });
        }
        console.error("Error updating account settings:", err);
        return res.status(500).json({ error: "Failed to update account settings." });
    }
}

// Add or update a course enrollment for the user
async function addUserCourse(req, res) {
    const userId = req.user.id;
    const { courseId, status } = req.body; // status: 'learning' or 'teaching'

    if (typeof courseId !== 'string' || !courseId.trim()) {
        return res.status(400).json({ error: "Course ID is required." });
    }

    if (status !== undefined && (typeof status !== 'string' || !VALID_STATUSES.includes(status.trim().toLowerCase()))) {
        return res.status(400).json({ error: "Status must be either 'learning' or 'teaching'." });
    }

    const normalizedStatus = status === undefined ? 'learning' : status.trim().toLowerCase();

    try {
        const courseCheck = await pool.query('SELECT id FROM courses WHERE id = $1', [courseId.trim()]);
        if (courseCheck.rows.length === 0) {
            return res.status(400).json({ error: "Course not found." });
        }

        const query = `
            INSERT INTO user_courses (user_id, course_id, status)
            VALUES ($1, $2, $3)
            ON CONFLICT (user_id, course_id) 
            DO UPDATE SET status = EXCLUDED.status
            RETURNING *;
        `;
        const result = await pool.query(query, [userId, courseId.trim(), normalizedStatus]);
        return res.status(201).json({ success: true, userCourse: result.rows[0] });
    } catch (err) {
        console.error("Error adding course:", err);
        res.status(500).json({ error: "Failed to add course to profile." });
    }
}

// Remove a course enrollment from the signed-in user's profile
async function removeUserCourse(req, res) {
    const userId = req.user.id;
    const courseId = req.params.courseId;

    if (typeof courseId !== 'string' || !courseId.trim()) {
        return res.status(400).json({ error: "Course ID is required." });
    }

    try {
        const result = await pool.query(
            'DELETE FROM user_courses WHERE user_id = $1 AND course_id = $2 RETURNING course_id',
            [userId, courseId.trim()]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Course enrollment not found." });
        }
        return res.json({ success: true, courseId: result.rows[0].course_id });
    } catch (err) {
        console.error("Error removing course:", err);
        return res.status(500).json({ error: "Failed to remove course from profile." });
    }
}

// Save or update weekly availability time slots
async function updateAvailability(req, res) {
    const userId = req.user.id;
    const { timeSlots } = req.body; // Array of slot codes e.g. ["MON_14_17", "TUE_10_13"]

    if (!Array.isArray(timeSlots)) {
        return res.status(400).json({ error: "timeSlots must be an array of slot codes." });
    }

    if (timeSlots.length === 0) {
        return res.status(400).json({ error: "Select at least one availability time slot." });
    }

    const cleanedSlots = [];
    for (const slot of timeSlots) {
        if (typeof slot !== 'string' || !SLOT_PATTERN.test(slot.trim().toUpperCase())) {
            return res.status(400).json({ error: "Each time slot must use the format DAY_HH_HH (for example, MON_09_12)." });
        }
        cleanedSlots.push(slot.trim().toUpperCase());
    }

    const uniqueSlots = [...new Set(cleanedSlots)];
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Clear old slots to sync fresh selection
        await client.query('DELETE FROM availabilities WHERE user_id = $1', [userId]);

        // Insert new slots
        for (const slot of uniqueSlots) {
            await client.query(
                `INSERT INTO availabilities (user_id, time_slot_code) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
                [userId, slot]
            );
        }

        await client.query('COMMIT');
        return res.json({ success: true, message: "Availability updated successfully.", timeSlots: uniqueSlots });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Error updating availability:", err);
        res.status(500).json({ error: "Failed to update availability." });
    } finally {
        client.release();
    }
}

// Get global course catalog
async function getAllCourses(req, res) {
    try {
        const result = await pool.query(
            'SELECT id, course_title, department, core_topics FROM courses ORDER BY course_title ASC'
        );
        return res.json({ success: true, courses: result.rows });
    } catch (err) {
        console.error("Error fetching courses:", err);
        res.status(500).json({ error: "Failed to fetch courses." });
    }
}

module.exports = { getUserProfile, updateUserSettings, addUserCourse, removeUserCourse, updateAvailability, getAllCourses };