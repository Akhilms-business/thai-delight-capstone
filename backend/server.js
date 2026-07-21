require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const { securityHeaders, generalLimiter, authLimiter } = require('./middleware/security');
const authRoutes = require('./routes/auth.routes');
const reservationRoutes = require('./routes/reservation.routes');
const menuRoutes = require('./routes/menu.routes');
const adminRoutes = require('./routes/admin.routes');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust the first proxy hop (Nginx / ALB) so req.ip is the real client IP,
// not the load balancer's - important for rate limiting + auth_events logging.
app.set('trust proxy', 1);

app.use(securityHeaders);
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json({ limit: '1mb' }));
app.use(generalLimiter);

// Health check - used by ALB target group health checks and CloudWatch/uptime monitoring.
// Deliberately does NOT touch the DB so it stays fast and doesn't count as a DB dependency check.
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Deeper health check that verifies DB connectivity - useful for CloudWatch custom alarms.
app.get('/health/deep', async (req, res) => {
  try {
    const { query } = require('./config/db');
    await query('SELECT 1');
    res.status(200).json({ status: 'ok', db: 'connected' });
  } catch (err) {
    res.status(503).json({ status: 'error', db: 'disconnected' });
  }
});

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/reservations', reservationRoutes);
app.use('/api/menu', menuRoutes);
app.use('/api/admin', adminRoutes);

// Serve the static frontend (in production, CloudFront/S3 or Nginx typically does this instead)
app.use(express.static(path.join(__dirname, '../frontend')));

// Centralized error handler - never leak stack traces to the client
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ error: 'Something went wrong. Please try again.' });
});

app.listen(PORT, () => {
  console.log(`Thai Delight backend listening on port ${PORT}`);
});

module.exports = app;
