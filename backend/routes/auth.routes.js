const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { query } = require('../config/db');

const router = express.Router();
const SALT_ROUNDS = 12;

async function logAuthEvent(email, eventType, ip) {
  try {
    await query(
      'INSERT INTO auth_events (email, event_type, ip_address) VALUES ($1, $2, $3)',
      [email, eventType, ip]
    );
  } catch (e) {
    console.error('Failed to log auth event', e.message);
  }
}

// POST /api/auth/register
router.post(
  '/register',
  [
    body('firstName').trim().notEmpty().isLength({ max: 100 }).escape(),
    body('lastName').trim().notEmpty().isLength({ max: 100 }).escape(),
    body('email').isEmail().normalizeEmail(),
    // Enforce a reasonably strong password
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { firstName, lastName, email, password } = req.body;

    try {
      const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
      if (existing.rows.length > 0) {
        return res.status(409).json({ error: 'An account with this email already exists.' });
      }

      const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

      // Role is always forced to 'user' here - admins are created manually/via seed script,
      // never through public registration. This prevents privilege escalation.
      const result = await query(
        `INSERT INTO users (first_name, last_name, email, password_hash, role)
         VALUES ($1, $2, $3, $4, 'user') RETURNING id, first_name, last_name, email, role`,
        [firstName, lastName, email, passwordHash]
      );

      await logAuthEvent(email, 'register', req.ip);

      const user = result.rows[0];
      const token = jwt.sign(
        { id: user.id, email: user.email, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: '2h' }
      );

      res.status(201).json({ token, user });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Registration failed.' });
    }
  }
);

// POST /api/auth/login
router.post(
  '/login',
  [body('email').isEmail().normalizeEmail(), body('password').notEmpty()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { email, password } = req.body;

    try {
      const result = await query('SELECT * FROM users WHERE email = $1', [email]);
      const user = result.rows[0];

      // Same generic error whether email doesn't exist or password is wrong -
      // don't leak which one it was (prevents user enumeration).
      if (!user) {
        await logAuthEvent(email, 'login_failed', req.ip);
        return res.status(401).json({ error: 'Invalid email or password.' });
      }

      const match = await bcrypt.compare(password, user.password_hash);
      if (!match) {
        await logAuthEvent(email, 'login_failed', req.ip);
        return res.status(401).json({ error: 'Invalid email or password.' });
      }

      await logAuthEvent(email, 'login_success', req.ip);

      const token = jwt.sign(
        { id: user.id, email: user.email, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: '2h' }
      );

      res.json({
        token,
        user: { id: user.id, firstName: user.first_name, lastName: user.last_name, email: user.email, role: user.role },
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Login failed.' });
    }
  }
);

module.exports = router;
