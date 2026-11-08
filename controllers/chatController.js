const pool = require('../config/db');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function getPodMessages(req, res) {
    const userId = req.user.id;
    const { podId } = req.params;

    if (!UUID_PATTERN.test(podId)) {
        return res.status(400).json({ error: 'A valid study pod ID is required.' });
    }

    try {
        const membership = await pool.query(
            'SELECT 1 FROM pod_members WHERE pod_id = $1 AND user_id = $2',
            [podId, userId]
        );
        if (membership.rows.length === 0) {
            return res.status(403).json({ error: 'Only pod members can view pod chat.' });
        }

        const result = await pool.query(
            `SELECT message.id, message.pod_id, message.user_id,
                    sender.full_name, message.message_text, message.created_at
             FROM (
                 SELECT id, pod_id, user_id, message_text, created_at
                 FROM pod_chat_messages
                 WHERE pod_id = $1
                 ORDER BY created_at DESC, id DESC
                 LIMIT 100
             ) message
             JOIN users sender ON sender.id = message.user_id
             ORDER BY message.created_at ASC, message.id ASC`,
            [podId]
        );

        return res.json({ success: true, messages: result.rows });
    } catch (error) {
        console.error('Error fetching pod chat messages:', error);
        return res.status(500).json({ error: 'Failed to load pod chat.' });
    }
}

module.exports = { getPodMessages };
