const pool = require('../config/db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// 1. User Signup
async function signup(req, res) {
    const { fullName, email, password, role } = req.body;

    if (!fullName || !email || !password) {
        return res.status(400).json({ error: "Full name, email, and password are required." });
    }

    try {
        // Check if user already exists
        const userCheck = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
        if (userCheck.rows.length > 0) {
            return res.status(400).json({ error: "An account with this email already exists." });
        }

        // Hash password securely (10 salt rounds)
        const saltRounds = 10;
        const passwordHash = await bcrypt.hash(password, saltRounds);

        // Insert new user
        const insertQuery = `
            INSERT INTO users (full_name, email, password_hash, role)
            VALUES ($1, $2, $3, $4)
            RETURNING id, full_name, email, role, created_at;
        `;
        const roleValue = role || 'student_seeking_help';
        const newUserResult = await pool.query(insertQuery, [fullName, email, passwordHash, roleValue]);
        const user = newUserResult.rows[0];

        // Generate JWT token
        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        return res.status(201).json({
            success: true,
            message: "Account created successfully!",
            token,
            user: {
                id: user.id,
                fullName: user.full_name,
                email: user.email,
                role: user.role
            }
        });

    } catch (err) {
        console.error("Signup error:", err);
        res.status(500).json({ error: "Internal server error during registration." });
    }
}

// 2. User Login
async function login(req, res) {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required." });
    }

    try {
        // Find user by email
        const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (userResult.rows.length === 0) {
            return res.status(401).json({ error: "Invalid email or password." });
        }

        const user = userResult.rows[0];

        // Verify password against stored hash
        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            return res.status(401).json({ error: "Invalid email or password." });
        }

        // Generate JWT token
        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        return res.json({
            success: true,
            message: "Login successful!",
            token,
            user: {
                id: user.id,
                fullName: user.full_name,
                email: user.email,
                role: user.role
            }
        });

    } catch (err) {
        console.error("Login error:", err);
        res.status(500).json({ error: "Internal server error during login." });
    }
}

module.exports = { signup, login };