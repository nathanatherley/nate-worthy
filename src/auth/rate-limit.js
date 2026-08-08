// Simple in-memory rate limiter for the login-link endpoint, so someone
// can't spam an email address (or your Resend quota) with repeated
// requests. Resets on server restart — fine at this scale; if this ever
// needs to survive restarts/multiple server instances, move it to Postgres
// or Redis instead.
const attempts = new Map(); // key: email, value: { count, windowStart }
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

function rateLimitLoginRequests(req, res, next) {
  const email = (req.body.email || '').trim().toLowerCase();
  if (!email) return next(); // let the existing validation handle empty/invalid emails

  const now = Date.now();
  const record = attempts.get(email);

  if (!record || now - record.windowStart > WINDOW_MS) {
    attempts.set(email, { count: 1, windowStart: now });
    return next();
  }

  if (record.count >= MAX_ATTEMPTS) {
    return res.status(429).json({ error: 'Too many sign-in attempts — try again in a few minutes.' });
  }

  record.count++;
  next();
}

module.exports = { rateLimitLoginRequests };
