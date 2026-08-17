// Server-side AI proxy. The frontend calls this instead of Anthropic
// directly — your API key lives only here, never in the browser.
const express = require('express');
const { requireAuth } = require('../auth/middleware');
const { aiLimiter } = require('../middleware/rate-limit');
const router = express.Router();
router.use(requireAuth);
router.use(aiLimiter);

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
        // The system prompt never changes between requests, so it's marked
        // as a cache breakpoint -- cached reads cost a small fraction of
        // full input price. Using the 1-hour TTL rather than the 5-minute
        // default, since this app's usage is sporadic (a handful of people
        // searching now and then, not continuous back-to-back requests) --
        // the default 5-minute window would likely expire between most real
        // requests, meaning the discount would rarely actually apply. The
        // 1-hour write costs more upfront (2x base input vs 1.25x for
        // 5-minute) but stays warm long enough to actually get hit given
        // this app's realistic usage pattern. The much bigger saving is the
        // seed-data cache breakpoint the frontend adds inside the first
        // user message itself (the shared candidate list is the same for
        // every user and is the majority of the token cost per request).
        system: [
          {
            type: 'text',
            text: require('./recommend-system-prompt'),
            cache_control: { type: 'ephemeral', ttl: '1h' },
          },
        ],
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
