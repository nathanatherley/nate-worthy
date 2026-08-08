// Server-side AI proxy. The frontend calls this instead of Anthropic
// directly — your API key lives only here, never in the browser.
const express = require('express');
const { requireAuth } = require('../auth/middleware');
const router = express.Router();
router.use(requireAuth);

// POST /api/recommend  body: { query, options: [...], isGroup, followUp: bool }
router.post('/', async (req, res) => {
  const { messages } = req.body; // frontend sends the same messages array shape it built before
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'server missing ANTHROPIC_API_KEY' });

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        system: require('./recommend-system-prompt'),
        messages,
      }),
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json(data);
    res.json(data);
  } catch (e) {
    console.error('recommend proxy failed', e);
    res.status(500).json({ error: 'recommend proxy failed' });
  }
});

module.exports = router;
