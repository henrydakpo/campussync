const express = require('express');
const router = express.Router();
const { submitFeedback } = require('../controllers/feedbackController');
const verifyToken = require('../middleware/authMiddleware');

router.post('/', verifyToken, submitFeedback);

module.exports = router;
