const pool = require('../config/db');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SLOT_PATTERN = /^[A-Z]{3}_[0-9]{2}_[0-9]{2}$/;

async function registerAsTutor(req, res) {
    const userId = req.user.id;
    const { tutorBio, offerings } = req.body;

    if (typeof tutorBio !== 'string' || tutorBio.trim().length > 1000) {
        return res.status(400).json({ error: 'Tutor bio must be 1000 characters or fewer.' });
    }
    if (!Array.isArray(offerings) || offerings.length < 1 || offerings.length > 20) {
        return res.status(400).json({ error: 'Select between 1 and 20 course offerings.' });
    }

    const cleanedOfferings = [];
    const offeredCourseIds = new Set();
    for (const offering of offerings) {
        if (!offering || typeof offering.courseId !== 'string' || !UUID_PATTERN.test(offering.courseId)) {
            return res.status(400).json({ error: 'Each offering must include a valid course ID.' });
        }
        if (typeof offering.expertiseSummary !== 'string'
            || !offering.expertiseSummary.trim()
            || offering.expertiseSummary.trim().length > 1000) {
            return res.status(400).json({ error: 'Each expertise summary must be 1 to 1000 characters.' });
        }
        if (offeredCourseIds.has(offering.courseId)) {
            return res.status(400).json({ error: 'A course can only be offered once.' });
        }
        offeredCourseIds.add(offering.courseId);
        cleanedOfferings.push({
            courseId: offering.courseId,
            expertiseSummary: offering.expertiseSummary.trim()
        });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const userResult = await client.query(
            `UPDATE users
             SET role = CASE WHEN role = 'student_seeking_help' THEN 'both'::user_role ELSE role END,
                 tutor_bio = $1
             WHERE id = $2
             RETURNING id`,
            [tutorBio.trim(), userId]
        );
        if (userResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Account not found.' });
        }

        const validCourses = await client.query(
            'SELECT id FROM courses WHERE id = ANY($1::uuid[])',
            [[...offeredCourseIds]]
        );
        if (validCourses.rows.length !== offeredCourseIds.size) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'One or more selected courses could not be found.' });
        }

        await client.query('DELETE FROM tutor_offerings WHERE user_id = $1', [userId]);
        for (const offering of cleanedOfferings) {
            await client.query(
                `INSERT INTO tutor_offerings (user_id, course_id, expertise_summary)
                 VALUES ($1, $2, $3)`,
                [userId, offering.courseId, offering.expertiseSummary]
            );
        }
        await client.query('COMMIT');
        return res.json({ success: true, message: 'Tutor profile updated successfully!' });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error updating tutor profile:', error);
        return res.status(500).json({ error: 'Failed to update tutor profile.' });
    } finally {
        client.release();
    }
}

async function getTutorDirectory(req, res) {
    try {
        const result = await pool.query(
            `SELECT
                tutor.id AS tutor_id,
                tutor.full_name,
                tutor.university_id,
                university.short_code AS university_code,
                university.name AS university_name,
                tutor.tutor_bio,
                course.id AS course_id,
                course.course_title,
                course.department,
                offering.expertise_summary,
                COALESCE(availability.time_slots, ARRAY[]::text[]) AS availability
             FROM users tutor
             JOIN tutor_offerings offering ON offering.user_id = tutor.id
             JOIN courses course ON course.id = offering.course_id
             LEFT JOIN universities university ON university.id = tutor.university_id
             LEFT JOIN LATERAL (
                 SELECT ARRAY_AGG(slot.time_slot_code ORDER BY slot.time_slot_code) AS time_slots
                 FROM availabilities slot
                 WHERE slot.user_id = tutor.id
             ) availability ON TRUE
             WHERE tutor.role IN ('peer_tutor', 'both')
             ORDER BY course.course_title, tutor.full_name`
        );
        return res.json({ success: true, tutors: result.rows });
    } catch (error) {
        console.error('Error fetching tutor directory:', error);
        return res.status(500).json({ error: 'Failed to fetch tutor directory.' });
    }
}

async function requestTutorSession(req, res) {
    const learnerId = req.user.id;
    const { tutorId, courseId, timeSlotCode } = req.body;
    if (typeof tutorId !== 'string' || !UUID_PATTERN.test(tutorId)
        || typeof courseId !== 'string' || !UUID_PATTERN.test(courseId)) {
        return res.status(400).json({ error: 'A valid tutor and course are required.' });
    }
    if (typeof timeSlotCode !== 'string' || !SLOT_PATTERN.test(timeSlotCode)) {
        return res.status(400).json({ error: 'Choose an available weekly schedule window.' });
    }
    if (tutorId === learnerId) {
        return res.status(400).json({ error: 'You cannot request a session with yourself.' });
    }

    try {
        const result = await pool.query(
            `INSERT INTO tutor_session_requests (learner_id, tutor_id, course_id, time_slot_code)
             SELECT $1, offering.user_id, offering.course_id, $4
             FROM tutor_offerings offering
             JOIN users tutor ON tutor.id = offering.user_id
             WHERE offering.user_id = $2
               AND offering.course_id = $3
               AND tutor.role IN ('peer_tutor', 'both')
               AND EXISTS (
                   SELECT 1 FROM availabilities availability
                   WHERE availability.user_id = offering.user_id
                     AND availability.time_slot_code = $4
               )
             RETURNING id, status, created_at`,
            [learnerId, tutorId, courseId, timeSlotCode]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'That tutor or availability window is no longer available.' });
        }
        return res.status(201).json({
            success: true,
            message: 'Session request sent to the tutor.',
            request: result.rows[0]
        });
    } catch (error) {
        if (error.code === '23505') {
            return res.status(409).json({ error: 'You already have a pending request for this time window.' });
        }
        console.error('Error creating tutor session request:', error);
        return res.status(500).json({ error: 'Failed to send session request.' });
    }
}

module.exports = { registerAsTutor, getTutorDirectory, requestTutorSession };
