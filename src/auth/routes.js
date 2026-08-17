// Simple magic-link authentication.
// 1. Person enters their email, we email them a one-time link.
// 2. They click it, we verify the token, create/find their user + friend
//    record, issue a session cookie.
// This replaces "already signed into Claude" with real auth, no passwords
// to manage, hash, or leak.

const express = require('express');
const crypto = require('crypto');
const pool = require('../db/pool');
const { sendMagicLinkEmail } = require('./email');
const { rateLimitLoginRequests } = require('./rate-limit');
const { signupLimiter } = require('../middleware/rate-limit');

const router = express.Router();

const TOKEN_TTL_MINUTES = 15;
const SESSION_TTL_DAYS = 30;

// POST /api/auth/request-link   body: { email }
router.post('/request-link', signupLimiter, rateLimitLoginRequests, async (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const ref = (req.body.ref || '').trim();
  const publicInvite = !!req.body.publicInvite;
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'valid email required' });

  try {
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MINUTES * 60 * 1000);
    const result = await pool.query(
      'INSERT INTO login_tokens (email, expires_at) VALUES ($1, $2) RETURNING token',
      [email, expiresAt]
    );
    const token = result.rows[0].token;
    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    // Same reasoning as ref below: this has to travel IN the link itself,
    // not in a cookie or session storage, since the person might open this
    // email on a completely different device or browser than the one they
    // first clicked the invite link on.
    let link = `${appUrl}/api/auth/verify?token=${token}`;
    if (ref) link += `&ref=${encodeURIComponent(ref)}`;
    if (publicInvite) link += `&invite=public`;

    await sendMagicLinkEmail(email, link);
    res.json({ sent: true });
  } catch (e) {
    console.error('request-link failed', e);
    res.status(500).json({ error: 'could not send login link' });
  }
});

// GET /api/auth/verify?token=...
router.get('/verify', async (req, res) => {
  const { token, ref, invite } = req.query;
  if (!token) return res.status(400).send('Missing token.');

  try {
    const tokenResult = await pool.query(
      'SELECT * FROM login_tokens WHERE token = $1 AND used = false AND expires_at > now()',
      [token]
    );
    if (!tokenResult.rows.length) return res.status(400).send('This login link is invalid or has expired — request a new one.');

    const { email } = tokenResult.rows[0];
    await pool.query('UPDATE login_tokens SET used = true WHERE token = $1', [token]);

    let userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    let user = userResult.rows[0];
    if (!user) {
      const inserted = await pool.query('INSERT INTO users (email) VALUES ($1) RETURNING *', [email]);
      user = inserted.rows[0];
    }

    const sessionExpiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
    const sessionResult = await pool.query(
      'INSERT INTO sessions (user_id, expires_at) VALUES ($1, $2) RETURNING id',
      [user.id, sessionExpiresAt]
    );

    res.cookie('session_id', sessionResult.rows[0].id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
    });

    const baseUrl = process.env.APP_URL || '/';
    const redirectParams = [];
    if (ref) redirectParams.push(`ref=${encodeURIComponent(ref)}`);
    if (invite === 'public') redirectParams.push('invite=public');
    res.redirect(baseUrl + (redirectParams.length ? '?' + redirectParams.join('&') : ''));
  } catch (e) {
    console.error('verify failed', e);
    res.status(500).send('Something went wrong signing you in — try requesting a new link.');
  }
});

// POST /api/auth/logout
router.post('/logout', async (req, res) => {
  const sessionId = req.cookies.session_id;
  if (sessionId) {
    try { await pool.query('DELETE FROM sessions WHERE id = $1', [sessionId]); } catch (e) { /* ignore */ }
  }
  res.clearCookie('session_id');
  res.json({ loggedOut: true });
});

// POST /api/auth/delete-account-by-email   body: { email }
// Admin-only in intent, gated client-side -- same limitation as other
// admin-facing endpoints in this app: there's no reliable server-side way
// to verify "is this user an app-admin" given admin status lives in
// client-managed state, not tied to the users table. Requires at least a
// valid session so this can't be called by someone with no account.
//
// Deleting the users row cascades automatically (via the foreign keys in
// schema.sql) to their sessions AND their personal kv_store data --
// including their saved 'my-identity' key. That matters here specifically:
// if a friend record they pointed to was ever lost from the shared app
// data (e.g. from a save race before the merge-forward fix), their old
// identity key surviving on its own would leave them stuck re-logging
// into a broken, dangling reference. Deleting the account here clears
// that out, so their next signup starts genuinely fresh.
//
// This does NOT touch the shared app data (friends/suggestions) -- any
// leftover record there needs separate cleanup via the existing "Clean up
// accounts" admin tool, since there's no stored link from a users row
// back to which specific friend record (if any) belongs to them.
router.post('/delete-account-by-email', async (req, res) => {
  const sessionId = req.cookies.session_id;
  if (!sessionId) return res.status(401).json({ error: 'not signed in' });
  try {
    const sessionCheck = await pool.query('SELECT user_id FROM sessions WHERE id = $1 AND expires_at > now()', [sessionId]);
    if (!sessionCheck.rows.length) return res.status(401).json({ error: 'session expired' });

    const email = (req.body.email || '').trim().toLowerCase();
    if (!email || !email.includes('@')) return res.status(400).json({ error: 'valid email required' });

    const result = await pool.query('DELETE FROM users WHERE email = $1 RETURNING id', [email]);
    if (!result.rows.length) return res.status(404).json({ error: 'no account found with that email' });
    res.json({ deleted: true, email });
  } catch (e) {
    console.error('delete-account-by-email failed', e);
    res.status(500).json({ error: 'delete failed' });
  }
});

// GET /api/me — used by the frontend on load to check session state
router.get('/me', async (req, res) => {
  const sessionId = req.cookies.session_id;
  if (!sessionId) return res.status(401).json({ error: 'not signed in' });

  try {
    const sessionResult = await pool.query(
      'SELECT u.id as user_id, u.email FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = $1 AND s.expires_at > now()',
      [sessionId]
    );
    if (!sessionResult.rows.length) return res.status(401).json({ error: 'session expired' });
    const { user_id, email } = sessionResult.rows[0];

    const friendResult = await pool.query('SELECT * FROM friends WHERE user_id = $1', [user_id]);
    res.json({ userId: user_id, email, friend: friendResult.rows[0] || null });
  } catch (e) {
    console.error('me check failed', e);
    res.status(500).json({ error: 'me check failed' });
  }
});

module.exports = router;
