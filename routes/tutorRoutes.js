const express = require('express');
const router = express.Router();
const {
    registerAsTutor,
    getTutorDirectory,
    requestTutorSession
} = require('../controllers/tutorController');
const verifyToken = require('../middleware/authMiddleware');

router.get('/', verifyToken, getTutorDirectory);
router.put('/profile', verifyToken, registerAsTutor);
router.post('/requests', verifyToken, requestTutorSession);

module.exports = router;
