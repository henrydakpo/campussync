const pool = require('../config/db');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_MESSAGE_LENGTH = 3000;

async function submitFeedback(req, res) {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim() : '';

    if (!message || message.length > MAX_MESSAGE_LENGTH) {
        return res.status(400).json({
            error: `Feedback must contain 1 to ${MAX_MESSAGE_LENGTH} characters.`
        });
    }

    if (email && (email.length > 254 || !EMAIL_PATTERN.test(email))) {
        return res.status(400).json({ error: 'Enter a valid contact email address.' });
    }

    try {
        await pool.query(
            'INSERT INTO feedback (user_id, contact_email, message) VALUES ($1, $2, $3)',
            [req.user.id, email || null, message]
        );
        return res.status(201).json({ message: 'Thank you! Your feedback has been sent.' });
    } catch (error) {
        console.error('Error saving user feedback:', error);
        return res.status(500).json({ error: 'Failed to send feedback. Please try again.' });
    }
}

module.exports = { submitFeedback };
