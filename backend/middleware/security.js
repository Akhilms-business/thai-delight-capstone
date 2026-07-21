const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// Security headers: X-Frame-Options, X-Content-Type-Options, CSP, HSTS, etc.
const securityHeaders = helmet({
contentSecurityPolicy: {
     directives: {
       defaultSrc: ["'self'"],
       styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
       fontSrc: ["'self'", 'https://fonts.gstatic.com'],
       imgSrc: ["'self'", 'data:', 'https:'],
       scriptSrc: ["'self'", "'unsafe-inline'"],
       scriptSrcAttr: ["'unsafe-inline'"],
     },
   },
  crossOriginEmbedderPolicy: false,
});

// General API rate limiter: 100 requests / 15 min per IP
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

// Strict limiter for login/register to prevent brute-force / credential stuffing
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8, // only 8 attempts per 15 min per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Try again in 15 minutes.' },
});

module.exports = { securityHeaders, generalLimiter, authLimiter };
