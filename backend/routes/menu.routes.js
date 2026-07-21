const express = require('express');
const multer = require('multer');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { body, param, validationResult } = require('express-validator');
const { query } = require('../config/db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

// Store the upload in memory, then push it to S3 - never save uploads to local disk on the EC2 instance.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error('Only JPEG, PNG, or WEBP images are allowed.'));
    }
    cb(null, true);
  },
});

const s3 = new S3Client({ region: process.env.AWS_REGION });

async function uploadToS3(file) {
  const key = `menu-images/${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '')}`;
  await s3.send(
    new PutObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
    })
  );
  return `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
}

// PUBLIC: list menu items (what visitors see on the site)
router.get('/', async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM menu_items WHERE is_available = TRUE ORDER BY category, name'
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch menu.' });
  }
});

// ADMIN: create menu item (with optional image upload)
router.post(
  '/',
  authenticate,
  requireRole('admin'),
  upload.single('image'),
  [
    body('name').trim().notEmpty().isLength({ max: 150 }).escape(),
    body('description').optional({ checkFalsy: true }).trim().isLength({ max: 1000 }).escape(),
    body('price').isFloat({ min: 0 }),
    body('category').trim().notEmpty().isLength({ max: 50 }).escape(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      let imageUrl = null;
      if (req.file) imageUrl = await uploadToS3(req.file);

      const { name, description, price, category } = req.body;
      const result = await query(
        `INSERT INTO menu_items (name, description, price, category, image_url, created_by)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [name, description || null, price, category, imageUrl, req.user.id]
      );
      res.status(201).json(result.rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Could not create menu item.' });
    }
  }
);

// ADMIN: update menu item
router.put(
  '/:id',
  authenticate,
  requireRole('admin'),
  upload.single('image'),
  [param('id').isInt()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      let imageUrl;
      if (req.file) imageUrl = await uploadToS3(req.file);

      const { name, description, price, category, isAvailable } = req.body;
      const result = await query(
        `UPDATE menu_items SET
           name = COALESCE($1, name),
           description = COALESCE($2, description),
           price = COALESCE($3, price),
           category = COALESCE($4, category),
           is_available = COALESCE($5, is_available),
           image_url = COALESCE($6, image_url),
           updated_at = NOW()
         WHERE id = $7 RETURNING *`,
        [name, description, price, category, isAvailable, imageUrl, req.params.id]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Menu item not found.' });
      res.json(result.rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Could not update menu item.' });
    }
  }
);

// ADMIN: delete menu item
router.delete('/:id', authenticate, requireRole('admin'), [param('id').isInt()], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const result = await query('DELETE FROM menu_items WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Menu item not found.' });
    res.json({ deleted: true, id: result.rows[0].id });
  } catch (err) {
    res.status(500).json({ error: 'Could not delete menu item.' });
  }
});

module.exports = router;
