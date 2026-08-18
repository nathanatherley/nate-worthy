// POST /api/friend-lookup-by-email -- resolves an email address to a
// friend id, so the trust-circle search can match people by email in
// addition to name and phone. Requires an exact, full email match (no
// partial search) and requires the caller be signed in.
//
// Deliberately returns the SAME shape whether the email doesn't exist at
// all, exists but has no friend profile yet, or genuinely isn't found --
// never distinguishing "no account" from "account, no profile" in the
// response. Without that, this endpoint would let someone probe arbitrary
// emails to learn whether they have an account here at all, independent
// of whether a match is ever returned.
const express = require('express');
const pool = require('../db/pool');
const { requireAuth } = require('../auth/middleware');
const { lookupLimiter } = require('../middleware/rate-limit');
const router = express.Router();
router.use(requireAuth);
router.use(lookupLimiter);

router.post('/', async (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  if (!email || !email.includes('@')) return res.json({ friendId: null });

  try {
    const userResult = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (!userResult.rows.length) return res.json({ friendId: null });
    const targetUserId = userResult.rows[0].id;

    const identityResult = await pool.query(
      "SELECT value FROM kv_store WHERE key = 'my-identity' AND shared = false AND owner_user_id = $1",
      [targetUserId]
    );
    if (!identityResult.rows.length) return res.json({ friendId: null });

    let friendId = null;
    try {
      const parsed = JSON.parse(identityResult.rows[0].value);
      friendId = (parsed && parsed.friendId) || null;
    } catch (e) {
      friendId = null;
    }
    res.json({ friendId });
  } catch (e) {
    console.error('friend lookup by email failed', e);
    res.json({ friendId: null });
  }
});

module.exports = router;
