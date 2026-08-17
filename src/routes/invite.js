// POST /api/invite -- sends an invite email on the signed-in user's behalf,
// using their own personal invite link. Only ever sends a small fixed
// template (toEmail, fromName, shareUrl are the only client-supplied
// values, never free-text body content), so this can't become an open
// email relay for spamming arbitrary content to third parties.
const express = require('express');
const { requireAuth } = require('../auth/middleware');
const { inviteLimiter } = require('../middleware/rate-limit');
const { sendInviteEmail } = require('../auth/email');
const router = express.Router();
router.use(requireAuth);
router.use(inviteLimiter);

router.post('/', async (req, res) => {
  const toEmail = (req.body.toEmail || '').trim().toLowerCase();
  const fromName = (req.body.fromName || '').trim().slice(0, 100);
  const shareUrl = (req.body.shareUrl || '').trim();
  if (!toEmail || !toEmail.includes('@')) return res.status(400).json({ error: 'valid email required' });
  // Basic sanity check that this is actually one of our own invite links,
  // not an arbitrary URL a caller could get relayed through this endpoint.
  const appUrl = process.env.APP_URL || 'http://localhost:3000';
  if (!shareUrl.startsWith(appUrl)) return res.status(400).json({ error: 'invalid invite link' });

  try {
    await sendInviteEmail({ toEmail, fromName, shareUrl });
    res.json({ sent: true });
  } catch (e) {
    console.error('invite send failed', e);
    res.status(500).json({ error: 'could not send invite' });
  }
});

module.exports = router;
