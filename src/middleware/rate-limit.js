// Per-IP rate limiting, separate from the existing per-email limiter in
// src/auth/rate-limit.js (that one stops one email address from being
// spammed with login links; this one stops any single IP from hammering
// the app generally). Both can run at once and cover different attack
// shapes -- e.g. a bot rotating through fake emails from one IP would
// sail past the per-email limiter but get caught here.
//
// In-memory, resets on server restart -- fine at this scale. If this ever
// needs to survive restarts or run across multiple server instances, move
// to Postgres or Redis instead (same note as the per-email limiter).
const rateLimit = require('express-rate-limit');

// Signup/login-link requests: generous enough that a real person retrying
// a typo'd email a couple times never notices it, tight enough to block
// scripted account creation from one IP.
const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many sign-in attempts from this network — try again in a bit.' },
});

// AI-backed endpoints (the Anthropic proxy): this is the one that
// protects real money. 20/hour is far more than any real person doing
// normal searches would hit, but stops a script from running up API costs.
const aiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many AI requests from this network — try again in a bit.' },
});

// Invite emails: this endpoint sends email to addresses the caller
// controls, so it's a spam vector if left unlimited -- someone could use
// it to email-bomb a third party's inbox. 20/hour per IP is far more than
// any real person inviting friends would need.
const inviteLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many invites sent — try again in a bit.' },
});

// General API backstop: loose enough to never bother normal browsing/use,
// just there to stop a runaway script or misbehaving client.
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests from this network — slow down a bit and try again.' },
});

module.exports = { signupLimiter, aiLimiter, inviteLimiter, generalLimiter };
