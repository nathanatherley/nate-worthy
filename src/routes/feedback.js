// POST /api/feedback -- "report a problem" submissions from the frontend.
// Requires a valid session (same requireAuth pattern as other authenticated
// routes) so this can't be spammed by a logged-out visitor, and so the
// email always has a real reporting user attached. requireAuth only sets
// req.userId, not email, so we look the email up here.
const express = require('express');
const pool = require('../db/pool');
const { requireAuth } = require('../auth/middleware');
const { sendFeedbackEmail } = require('../auth/email');
const router = express.Router();
router.use(requireAuth);

router.post('/', async (req, res) => {
  const message = (req.body.message || '').trim();
  const page = (req.body.page || '').trim();
  if (!message) return res.status(400).json({ error: 'message required' });
  if (message.length > 5000) return res.status(400).json({ error: 'message too long' });

  try {
    const userResult = await pool.query('SELECT email FROM users WHERE id = $1', [req.userId]);
    const fromUserEmail = userResult.rows[0]?.email || 'unknown user';

    await sendFeedbackEmail({ fromUserEmail, message, page });
    res.json({ sent: true });
  } catch (e) {
    console.error('feedback send failed', e);
    res.status(500).json({ error: 'could not send feedback' });
  }
});

module.exports = router;
