const express = require('express');
const router = express.Router();
const { getPodMessages } = require('../controllers/chatController');
const { generatePodStudyHelp } = require('../controllers/aiController');
const {
    getAvailablePods,
    discoverStudyPods,
    createStudyPod,
    updatePodName,
    deleteStudyPod,
    requestToJoinStudyPod,
    getMembershipRequests,
    respondToMembershipRequest,
    getPodMeetups,
    createPodMeetup,
    attendPodMeetup
} = require('../controllers/podController');
const verifyToken = require('../middleware/authMiddleware');

router.get('/', verifyToken, getAvailablePods);
router.get('/discover', verifyToken, discoverStudyPods);
router.post('/', verifyToken, createStudyPod);
router.patch('/:podId/name', verifyToken, updatePodName);
router.delete('/:podId', verifyToken, deleteStudyPod);
router.get('/:podId/requests', verifyToken, getMembershipRequests);
router.patch('/:podId/requests/:requestId', verifyToken, respondToMembershipRequest);
router.get('/:podId/meetups', verifyToken, getPodMeetups);
router.get('/:podId/messages', verifyToken, getPodMessages);
router.post('/:podId/ai-helper', verifyToken, generatePodStudyHelp);
router.post('/:podId/meetups', verifyToken, createPodMeetup);
router.post('/:podId/meetups/:meetupId/attend', verifyToken, attendPodMeetup);
router.post('/:podId/join', verifyToken, requestToJoinStudyPod);

module.exports = router;