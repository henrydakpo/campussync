const express = require('express');
const router = express.Router();
const { getStudentMatches } = require('../controllers/matchController');
const verifyToken = require('../middleware/authMiddleware');

router.get('/', verifyToken, getStudentMatches);

module.exports = router;