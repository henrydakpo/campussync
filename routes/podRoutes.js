const express = require('express');
const router = express.Router();
const { getAvailablePods, createStudyPod, joinStudyPod } = require('../controllers/podController');
const verifyToken = require('../middleware/authMiddleware');

router.get('/', verifyToken, getAvailablePods);
router.post('/', verifyToken, createStudyPod);
router.post('/:podId/join', verifyToken, joinStudyPod);

module.exports = router;