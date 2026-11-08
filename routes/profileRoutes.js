const express = require('express');
const router = express.Router();
const { getUserProfile, updateUserSettings, addUserCourse, removeUserCourse, updateAvailability, getAllCourses } = require('../controllers/profileController');
const verifyToken = require('../middleware/authMiddleware');

router.get('/', verifyToken, getUserProfile);
router.patch('/settings', verifyToken, updateUserSettings);
router.get('/courses', verifyToken, getAllCourses);
router.post('/courses', verifyToken, addUserCourse);
router.delete('/courses/:courseId', verifyToken, removeUserCourse);
router.post('/availability', verifyToken, updateAvailability);

module.exports = router;