const pool = require('../config/db');

// Get deterministic matches for the logged-in student
async function getStudentMatches(req, res) {
    const userId = req.user.id;

    try {
        // 1. Get courses the current user is learning
        const userCoursesQuery = `
            SELECT course_id FROM user_courses 
            WHERE user_id = $1 AND status = 'learning';
        `;
        const userCoursesResult = await pool.query(userCoursesQuery, [userId]);
        
        if (userCoursesResult.rows.length === 0) {
            return res.json({ success: true, matches: [] });
        }

        const courseIds = userCoursesResult.rows.map(row => row.course_id);

        // Shared courses make students discoverable; overlapping availability improves ranking.
        const matchQuery = `
            SELECT 
                u.id AS user_id,
                u.full_name,
                u.role,
                c.id AS course_id,
                c.course_title,
                uc.status AS course_status,
                COALESCE(
                    ARRAY_AGG(DISTINCT a.time_slot_code)
                        FILTER (WHERE a.time_slot_code IS NOT NULL),
                    ARRAY[]::text[]
                ) AS overlapping_slots,
                COUNT(DISTINCT a.time_slot_code)::int AS overlapping_slots_count
            FROM user_courses uc
            JOIN users u ON uc.user_id = u.id
            JOIN courses c ON uc.course_id = c.id
            LEFT JOIN availabilities a
                ON a.user_id = u.id
               AND a.time_slot_code IN (
                   SELECT time_slot_code FROM availabilities WHERE user_id = $2
               )
            WHERE uc.course_id = ANY($1)
              AND u.id != $2
            GROUP BY u.id, u.full_name, u.role, c.id, c.course_title, uc.status
            ORDER BY overlapping_slots_count DESC;
        `;

        const matchResult = await pool.query(matchQuery, [courseIds, userId]);

        // Format matches with a simulated compatibility score percentage
        const matches = matchResult.rows.map(row => {
            const slotCount = parseInt(row.overlapping_slots_count, 10) || 0;
            // Base score calculation based on shared course + overlapping time slots
            const compatibilityScore = Math.min(70 + (slotCount * 10), 98);

            return {
                userId: row.user_id,
                fullName: row.full_name,
                role: row.role,
                courseId: row.course_id,
                courseTitle: row.course_title,
                courseStatus: row.course_status,
                overlappingSlots: row.overlapping_slots,
                overlappingSlotsCount: slotCount,
                compatibilityScore
            };
        });

        return res.json({ success: true, matches });

    } catch (err) {
        console.error("Error fetching matches:", err);
        return res.status(500).json({ error: "Failed to compute study matches." });
    }
}

module.exports = { getStudentMatches };