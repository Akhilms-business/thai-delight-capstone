const express = require('express');
const { param, body, validationResult } = require('express-validator');
const { query } = require('../config/db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

// ADMIN: list all users (no password hashes ever returned)
router.get('/users', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const result = await query(
      'SELECT id, first_name, last_name, email, role, created_at FROM users ORDER BY created_at DESC'
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch users.' });
  }
});

// ADMIN: promote/demote a user's role
router.patch(
  '/users/:id/role',
  authenticate,
  requireRole('admin'),
  [param('id').isInt(), body('role').isIn(['user', 'admin'])],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const result = await query(
        'UPDATE users SET role = $1 WHERE id = $2 RETURNING id, first_name, last_name, email, role',
        [req.body.role, req.params.id]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'User not found.' });
      res.json(result.rows[0]);
    } catch (err) {
      res.status(500).json({ error: 'Could not update user role.' });
    }
  }
);

// ADMIN: recent failed login attempts (feeds "security alerts" requirement)
router.get('/auth-events', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const result = await query(
      `SELECT * FROM auth_events ORDER BY created_at DESC LIMIT 200`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch auth events.' });
  }
});

module.exports = router;
