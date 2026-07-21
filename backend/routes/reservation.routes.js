const express = require('express');
const { body, param, validationResult } = require('express-validator');
const { query } = require('../config/db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

// CREATE - anyone can submit a reservation (guests don't have to register).
// If logged in, we tag the reservation with their user_id.
router.post(
  '/',
  [
    body('firstName').trim().notEmpty().isLength({ max: 100 }).escape(),
    body('lastName').trim().notEmpty().isLength({ max: 100 }).escape(),
    body('phone').trim().notEmpty().isLength({ max: 30 }).escape(),
    body('email').isEmail().normalizeEmail(),
    body('date').isISO8601(),
    body('time').matches(/^([01]\d|2[0-3]):([0-5]\d)$/),
    body('guests').isInt({ min: 1, max: 20 }),
    body('notes').optional({ checkFalsy: true }).trim().isLength({ max: 500 }).escape(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { firstName, lastName, phone, email, date, time, guests, notes } = req.body;
    let userId = null;

    // Optional auth - if a token is present, associate reservation with the account
    const header = req.headers.authorization;
    if (header && header.startsWith('Bearer ')) {
      try {
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(header.split(' ')[1], process.env.JWT_SECRET);
        userId = decoded.id;
      } catch (_) { /* ignore invalid token, treat as guest */ }
    }

    try {
      const result = await query(
        `INSERT INTO reservations
          (user_id, first_name, last_name, phone, email, reservation_date, reservation_time, guests, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [userId, firstName, lastName, phone, email, date, time, guests, notes || null]
      );
      res.status(201).json(result.rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Could not create reservation.' });
    }
  }
);

// READ (own reservations) - requires login
router.get('/mine', authenticate, async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM reservations WHERE user_id = $1 ORDER BY reservation_date DESC',
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch reservations.' });
  }
});

// READ (all) - admin only
router.get('/', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const result = await query('SELECT * FROM reservations ORDER BY reservation_date DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch reservations.' });
  }
});

// UPDATE status - admin only (confirm/cancel/complete a reservation)
router.patch(
  '/:id/status',
  authenticate,
  requireRole('admin'),
  [
    param('id').isInt(),
    body('status').isIn(['pending', 'confirmed', 'cancelled', 'completed']),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const result = await query(
        'UPDATE reservations SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
        [req.body.status, req.params.id]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Reservation not found.' });
      res.json(result.rows[0]);
    } catch (err) {
      res.status(500).json({ error: 'Could not update reservation.' });
    }
  }
);

// DELETE - admin only
router.delete('/:id', authenticate, requireRole('admin'), [param('id').isInt()], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const result = await query('DELETE FROM reservations WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Reservation not found.' });
    res.json({ deleted: true, id: result.rows[0].id });
  } catch (err) {
    res.status(500).json({ error: 'Could not delete reservation.' });
  }
});

module.exports = router;
