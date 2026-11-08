const express = require('express');
const { matchCourse } = require('../controllers/courseMatchController');
const verifyToken = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/match-course', verifyToken, matchCourse);

module.exports = router;
