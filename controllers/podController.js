const pool = require('../config/db');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function getAvailablePods(req, res) {
    const userId = req.user.id;

    try {
        const result = await pool.query(
            `SELECT
                p.id AS pod_id,
                p.pod_name,
                p.max_members,
                p.created_at,
                c.id AS course_id,
                c.course_code,
                c.course_title,
                u.full_name AS creator_name,
                COUNT(pm.user_id)::int AS current_members_count,
                BOOL_OR(pm.user_id = $1) AS is_member
             FROM study_pods p
             JOIN courses c ON c.id = p.course_id
             JOIN user_courses uc ON uc.course_id = c.id AND uc.user_id = $1
             LEFT JOIN users u ON u.id = p.created_by
             LEFT JOIN pod_members pm ON pm.pod_id = p.id
             GROUP BY p.id, c.id, u.full_name
             ORDER BY p.created_at DESC`,
            [userId]
        );

        const pods = result.rows.map(pod => ({
            ...pod,
            is_member: pod.is_member === true,
            is_full: pod.current_members_count >= pod.max_members
        }));
        return res.json({ success: true, pods });
    } catch (err) {
        console.error("Error fetching study pods:", err);
        return res.status(500).json({ error: "Failed to fetch study pods." });
    }
}

async function createStudyPod(req, res) {
    const userId = req.user.id;
    const { podName, courseId, maxMembers = 5 } = req.body;

    if (typeof podName !== 'string' || !podName.trim()) {
        return res.status(400).json({ error: "Pod name is required." });
    }
    if (podName.trim().length > 100) {
        return res.status(400).json({ error: "Pod name must be 100 characters or fewer." });
    }
    if (typeof courseId !== 'string' || !UUID_PATTERN.test(courseId)) {
        return res.status(400).json({ error: "A valid course ID is required." });
    }
    if (!Number.isInteger(maxMembers) || maxMembers < 2 || maxMembers > 20) {
        return res.status(400).json({ error: "Maximum members must be a whole number between 2 and 20." });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const enrollment = await client.query(
            'SELECT 1 FROM user_courses WHERE user_id = $1 AND course_id = $2',
            [userId, courseId]
        );
        if (enrollment.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(403).json({ error: "You must add this course to your profile before creating a pod for it." });
        }

        const podResult = await client.query(
            `INSERT INTO study_pods (pod_name, course_id, created_by, max_members)
             VALUES ($1, $2, $3, $4)
             RETURNING id, pod_name, course_id, created_by, max_members, created_at`,
            [podName.trim(), courseId, userId, maxMembers]
        );
        const pod = podResult.rows[0];

        await client.query(
            'INSERT INTO pod_members (pod_id, user_id) VALUES ($1, $2)',
            [pod.id, userId]
        );
        await client.query('COMMIT');
        return res.status(201).json({ success: true, pod });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Error creating study pod:", err);
        return res.status(500).json({ error: "Failed to create study pod." });
    } finally {
        client.release();
    }
}

async function joinStudyPod(req, res) {
    const userId = req.user.id;
    const { podId } = req.params;

    if (!UUID_PATTERN.test(podId)) {
        return res.status(400).json({ error: "A valid study pod ID is required." });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const podResult = await client.query(
            'SELECT id, course_id, max_members FROM study_pods WHERE id = $1 FOR UPDATE',
            [podId]
        );
        if (podResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: "Study pod not found." });
        }

        const pod = podResult.rows[0];
        const enrollment = await client.query(
            'SELECT 1 FROM user_courses WHERE user_id = $1 AND course_id = $2',
            [userId, pod.course_id]
        );
        if (enrollment.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(403).json({ error: "You must add this course to your profile before joining its study pod." });
        }

        const existingMembership = await client.query(
            'SELECT 1 FROM pod_members WHERE pod_id = $1 AND user_id = $2',
            [podId, userId]
        );
        if (existingMembership.rows.length > 0) {
            await client.query('COMMIT');
            return res.json({ success: true, message: "You are already a member of this study pod." });
        }

        const countResult = await client.query(
            'SELECT COUNT(*)::int AS member_count FROM pod_members WHERE pod_id = $1',
            [podId]
        );
        if (countResult.rows[0].member_count >= pod.max_members) {
            await client.query('ROLLBACK');
            return res.status(409).json({ error: "This study pod has reached its maximum capacity." });
        }

        await client.query(
            'INSERT INTO pod_members (pod_id, user_id) VALUES ($1, $2)',
            [podId, userId]
        );
        await client.query('COMMIT');
        return res.json({ success: true, message: "Successfully joined the study pod." });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Error joining study pod:", err);
        return res.status(500).json({ error: "Failed to join study pod." });
    } finally {
        client.release();
    }
}

module.exports = { getAvailablePods, createStudyPod, joinStudyPod };
