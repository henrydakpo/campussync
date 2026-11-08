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
                p.created_by = $1 AS is_creator,
                c.id AS course_id,
                c.course_code,
                c.course_title,
                u.full_name AS creator_name,
                COUNT(pm.user_id)::int AS current_members_count,
                BOOL_OR(pm.user_id = $1) AS is_member,
                MAX(pr.status) AS request_status,
                (SELECT COUNT(*)::int
                 FROM pod_membership_requests pending
                 WHERE pending.pod_id = p.id AND pending.status = 'pending') AS pending_requests_count
             FROM study_pods p
             JOIN courses c ON c.id = p.course_id
             LEFT JOIN user_courses uc ON uc.course_id = c.id AND uc.user_id = $1
             LEFT JOIN users u ON u.id = p.created_by
             LEFT JOIN pod_members pm ON pm.pod_id = p.id
             LEFT JOIN pod_membership_requests pr ON pr.pod_id = p.id AND pr.user_id = $1
             WHERE uc.user_id = $1 OR p.created_by = $1
             GROUP BY p.id, c.id, u.full_name
             ORDER BY p.created_at DESC`,
            [userId]
        );

        const pods = result.rows.map(pod => ({
            ...pod,
            is_member: pod.is_member === true,
            is_creator: pod.is_creator === true,
            is_full: pod.current_members_count >= pod.max_members
        }));
        return res.json({ success: true, pods });
    } catch (err) {
        console.error("Error fetching study pods:", err);
        return res.status(500).json({ error: "Failed to fetch study pods." });
    }
}

async function discoverStudyPods(req, res) {
    const userId = req.user.id;

    try {
        const result = await pool.query(
            `SELECT
                p.id AS pod_id,
                p.pod_name,
                p.max_members,
                p.created_at,
                p.created_by = $1 AS is_creator,
                c.id AS course_id,
                c.course_code,
                c.course_title,
                u.full_name AS creator_name,
                COUNT(pm.user_id)::int AS current_members_count,
                COALESCE(BOOL_OR(pm.user_id = $1), FALSE) AS is_member,
                MAX(pr.status) AS request_status,
                CASE WHEN p.created_by = $1 THEN
                    (SELECT COUNT(*)::int
                     FROM pod_membership_requests pending
                     WHERE pending.pod_id = p.id AND pending.status = 'pending')
                ELSE 0 END AS pending_requests_count
             FROM study_pods p
             JOIN courses c ON c.id = p.course_id
             LEFT JOIN users u ON u.id = p.created_by
             LEFT JOIN pod_members pm ON pm.pod_id = p.id
             LEFT JOIN pod_membership_requests pr ON pr.pod_id = p.id AND pr.user_id = $1
             GROUP BY p.id, c.id, u.full_name
             ORDER BY p.created_at DESC`,
            [userId]
        );

        const pods = result.rows.map(pod => ({
            ...pod,
            is_member: pod.is_member === true,
            is_creator: pod.is_creator === true,
            is_full: pod.current_members_count >= pod.max_members
        }));
        return res.json({ success: true, pods });
    } catch (err) {
        console.error("Error discovering study pods:", err);
        return res.status(500).json({ error: "Failed to discover study pods." });
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

async function deleteStudyPod(req, res) {
    const userId = req.user.id;
    const { podId } = req.params;

    if (!UUID_PATTERN.test(podId)) {
        return res.status(400).json({ error: "A valid study pod ID is required." });
    }

    try {
        const result = await pool.query(
            'DELETE FROM study_pods WHERE id = $1 AND created_by = $2 RETURNING id',
            [podId, userId]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Study pod not found or you are not its organizer." });
        }

        return res.json({ success: true, message: "Study pod deleted." });
    } catch (err) {
        console.error("Error deleting study pod:", err);
        return res.status(500).json({ error: "Failed to delete study pod." });
    }
}

async function requestToJoinStudyPod(req, res) {
    const userId = req.user.id;
    const { podId } = req.params;

    if (!UUID_PATTERN.test(podId)) {
        return res.status(400).json({ error: "A valid study pod ID is required." });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const podResult = await client.query(
            'SELECT id, max_members FROM study_pods WHERE id = $1 FOR UPDATE',
            [podId]
        );
        if (podResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: "Study pod not found." });
        }

        const pod = podResult.rows[0];

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

        const requestResult = await client.query(
            `INSERT INTO pod_membership_requests (pod_id, user_id, status)
             VALUES ($1, $2, 'pending')
             ON CONFLICT (pod_id, user_id)
             DO UPDATE SET status = 'pending', updated_at = CURRENT_TIMESTAMP
             WHERE pod_membership_requests.status = 'rejected'
             RETURNING id, status`,
            [podId, userId]
        );

        if (requestResult.rows.length === 0) {
            const existingRequest = await client.query(
                'SELECT status FROM pod_membership_requests WHERE pod_id = $1 AND user_id = $2',
                [podId, userId]
            );
            await client.query('COMMIT');
            return res.status(202).json({
                success: true,
                requestStatus: existingRequest.rows[0].status,
                message: "Your membership request is already being reviewed."
            });
        }

        await client.query('COMMIT');
        return res.status(202).json({
            success: true,
            requestStatus: requestResult.rows[0].status,
            message: "Membership request sent to the pod organizer."
        });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Error joining study pod:", err);
        return res.status(500).json({ error: "Failed to join study pod." });
    } finally {
        client.release();
    }
}

async function getMembershipRequests(req, res) {
    const userId = req.user.id;
    const { podId } = req.params;

    if (!UUID_PATTERN.test(podId)) {
        return res.status(400).json({ error: "A valid study pod ID is required." });
    }

    try {
        const result = await pool.query(
            `SELECT
                r.id AS request_id,
                r.status,
                r.created_at,
                u.id AS user_id,
                u.full_name,
                u.email
             FROM pod_membership_requests r
             JOIN study_pods p ON p.id = r.pod_id
             JOIN users u ON u.id = r.user_id
             WHERE r.pod_id = $1 AND p.created_by = $2
             ORDER BY CASE WHEN r.status = 'pending' THEN 0 ELSE 1 END, r.created_at ASC`,
            [podId, userId]
        );
        const ownsPod = await pool.query(
            'SELECT 1 FROM study_pods WHERE id = $1 AND created_by = $2',
            [podId, userId]
        );
        if (ownsPod.rows.length === 0) {
            return res.status(403).json({ error: "Only the pod organizer can view membership requests." });
        }
        return res.json({ success: true, requests: result.rows });
    } catch (err) {
        console.error("Error fetching pod membership requests:", err);
        return res.status(500).json({ error: "Failed to fetch membership requests." });
    }
}

async function respondToMembershipRequest(req, res) {
    const userId = req.user.id;
    const { podId, requestId } = req.params;
    const { status } = req.body;

    if (!UUID_PATTERN.test(podId) || !UUID_PATTERN.test(requestId)) {
        return res.status(400).json({ error: "Valid study pod and request IDs are required." });
    }
    if (!['approved', 'rejected'].includes(status)) {
        return res.status(400).json({ error: "Request status must be approved or rejected." });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const podResult = await client.query(
            'SELECT id, max_members FROM study_pods WHERE id = $1 AND created_by = $2 FOR UPDATE',
            [podId, userId]
        );
        if (podResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(403).json({ error: "Only the pod organizer can respond to membership requests." });
        }

        const requestResult = await client.query(
            `SELECT id, user_id, status
             FROM pod_membership_requests
             WHERE id = $1 AND pod_id = $2
             FOR UPDATE`,
            [requestId, podId]
        );
        if (requestResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: "Membership request not found." });
        }
        const request = requestResult.rows[0];
        if (request.status !== 'pending') {
            await client.query('ROLLBACK');
            return res.status(409).json({ error: "This membership request has already been reviewed." });
        }

        if (status === 'approved') {
            const members = await client.query(
                'SELECT COUNT(*)::int AS member_count FROM pod_members WHERE pod_id = $1',
                [podId]
            );
            if (members.rows[0].member_count >= podResult.rows[0].max_members) {
                await client.query('ROLLBACK');
                return res.status(409).json({ error: "This study pod has reached its maximum capacity." });
            }
            await client.query(
                'INSERT INTO pod_members (pod_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
                [podId, request.user_id]
            );
        }

        await client.query(
            'UPDATE pod_membership_requests SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
            [status, requestId]
        );
        await client.query('COMMIT');
        return res.json({
            success: true,
            status,
            message: status === 'approved' ? "Membership request approved." : "Membership request declined."
        });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Error responding to membership request:", err);
        return res.status(500).json({ error: "Failed to update membership request." });
    } finally {
        client.release();
    }
}

async function getPodMeetups(req, res) {
    const userId = req.user.id;
    const { podId } = req.params;
    if (!UUID_PATTERN.test(podId)) {
        return res.status(400).json({ error: "A valid study pod ID is required." });
    }

    try {
        const membership = await pool.query(
            'SELECT 1 FROM pod_members WHERE pod_id = $1 AND user_id = $2',
            [podId, userId]
        );
        if (membership.rows.length === 0) {
            return res.status(403).json({ error: "Only pod members can view meetup plans." });
        }

        const result = await pool.query(
            `SELECT
                m.id AS meetup_id,
                m.title,
                m.starts_at,
                m.location,
                m.notes,
                m.created_by,
                u.full_name AS organizer_name,
                COUNT(a.user_id)::int AS attendee_count,
                BOOL_OR(a.user_id = $2) AS is_attending
             FROM pod_meetups m
             JOIN users u ON u.id = m.created_by
             LEFT JOIN pod_meetup_attendees a ON a.meetup_id = m.id
             WHERE m.pod_id = $1 AND m.starts_at >= CURRENT_TIMESTAMP
             GROUP BY m.id, u.full_name
             ORDER BY m.starts_at ASC`,
            [podId, userId]
        );
        return res.json({
            success: true,
            meetups: result.rows.map(meetup => ({
                ...meetup,
                is_attending: meetup.is_attending === true
            }))
        });
    } catch (err) {
        console.error("Error fetching pod meetups:", err);
        return res.status(500).json({ error: "Failed to fetch meetup plans." });
    }
}

async function createPodMeetup(req, res) {
    const userId = req.user.id;
    const { podId } = req.params;
    const { title, startsAt, location, notes } = req.body;
    if (!UUID_PATTERN.test(podId)) {
        return res.status(400).json({ error: "A valid study pod ID is required." });
    }
    if (typeof title !== 'string' || !title.trim() || title.trim().length > 100) {
        return res.status(400).json({ error: "Meetup title is required and must be 100 characters or fewer." });
    }
    if (typeof startsAt !== 'string' || !Number.isFinite(Date.parse(startsAt)) || Date.parse(startsAt) <= Date.now()) {
        return res.status(400).json({ error: "Choose a valid meetup time in the future." });
    }
    if (typeof location !== 'string' || !location.trim() || location.trim().length > 200) {
        return res.status(400).json({ error: "Meetup location is required and must be 200 characters or fewer." });
    }
    if (notes !== undefined && (typeof notes !== 'string' || notes.length > 500)) {
        return res.status(400).json({ error: "Meetup notes must be 500 characters or fewer." });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const membership = await client.query(
            'SELECT 1 FROM pod_members WHERE pod_id = $1 AND user_id = $2',
            [podId, userId]
        );
        if (membership.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(403).json({ error: "Only pod members can schedule meetups." });
        }

        const meetupResult = await client.query(
            `INSERT INTO pod_meetups (pod_id, created_by, title, starts_at, location, notes)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id AS meetup_id, title, starts_at, location, notes, created_by`,
            [podId, userId, title.trim(), startsAt, location.trim(), notes ? notes.trim() : null]
        );
        const meetup = meetupResult.rows[0];
        await client.query(
            'INSERT INTO pod_meetup_attendees (meetup_id, user_id) VALUES ($1, $2)',
            [meetup.meetup_id, userId]
        );
        await client.query('COMMIT');
        return res.status(201).json({ success: true, meetup });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Error scheduling pod meetup:", err);
        return res.status(500).json({ error: "Failed to schedule meetup." });
    } finally {
        client.release();
    }
}

async function attendPodMeetup(req, res) {
    const userId = req.user.id;
    const { podId, meetupId } = req.params;
    if (!UUID_PATTERN.test(podId) || !UUID_PATTERN.test(meetupId)) {
        return res.status(400).json({ error: "Valid study pod and meetup IDs are required." });
    }

    try {
        const membership = await pool.query(
            'SELECT 1 FROM pod_members WHERE pod_id = $1 AND user_id = $2',
            [podId, userId]
        );
        if (membership.rows.length === 0) {
            return res.status(403).json({ error: "Only pod members can RSVP to meetups." });
        }

        const result = await pool.query(
            `INSERT INTO pod_meetup_attendees (meetup_id, user_id)
             SELECT id, $3 FROM pod_meetups
             WHERE id = $1 AND pod_id = $2 AND starts_at >= CURRENT_TIMESTAMP
             ON CONFLICT (meetup_id, user_id) DO NOTHING
             RETURNING meetup_id`,
            [meetupId, podId, userId]
        );
        if (result.rows.length === 0) {
            const meetup = await pool.query(
                'SELECT 1 FROM pod_meetups WHERE id = $1 AND pod_id = $2',
                [meetupId, podId]
            );
            if (meetup.rows.length === 0) {
                return res.status(404).json({ error: "Meetup not found." });
            }
            return res.status(409).json({ error: "You are already attending this meetup or it has already started." });
        }
        return res.json({ success: true, message: "You are on the meetup attendee list." });
    } catch (err) {
        console.error("Error joining pod meetup:", err);
        return res.status(500).json({ error: "Failed to RSVP to meetup." });
    }
}

module.exports = {
    getAvailablePods,
    discoverStudyPods,
    createStudyPod,
    deleteStudyPod,
    requestToJoinStudyPod,
    getMembershipRequests,
    respondToMembershipRequest,
    getPodMeetups,
    createPodMeetup,
    attendPodMeetup
};
