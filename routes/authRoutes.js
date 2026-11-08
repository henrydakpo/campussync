const express = require('express');
const router = express.Router();
const { signup, login } = require('../controllers/authController');

// POST /api/auth/signup - Register a new student account
router.post('/signup', signup);

// POST /api/auth/login - Authenticate user and issue JWT token
router.post('/login', login);

module.exports = router;