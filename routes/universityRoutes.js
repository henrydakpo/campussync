const express = require('express');
const { getUniversities } = require('../controllers/universityController');

const router = express.Router();

router.get('/', getUniversities);

module.exports = router;
