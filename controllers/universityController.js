const pool = require('../config/db');

async function getUniversities(req, res) {
    try {
        const result = await pool.query(
            'SELECT id, name, short_code FROM universities ORDER BY name ASC'
        );
        return res.json({ success: true, universities: result.rows });
    } catch (error) {
        console.error('Error fetching universities:', error);
        return res.status(500).json({ success: false, error: 'Failed to load universities.' });
    }
}

module.exports = { getUniversities };
