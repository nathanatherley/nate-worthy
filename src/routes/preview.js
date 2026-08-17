// GET /api/preview/:suggestionId -- public, no login required. Returns
// only the minimal safe fields for ONE specific shared pick (restaurant
// name, rating, note, who rated it, city) so an invite link can show a
// real preview before asking someone to sign up. Deliberately does not
// expose anyone's full network, trust ratings, or other people's picks --
// this mirrors what's already being shared the moment someone sends this
// link out, nothing more. Covered by the general per-IP rate limiter
// applied at the /api prefix in server.js, since this is reachable by
// anyone without an account.
const express = require('express');
const pool = require('../db/pool');
const router = express.Router();

router.get('/:suggestionId', async (req, res) => {
  const { suggestionId } = req.params;
  try {
    const result = await pool.query(
      "SELECT value FROM kv_store WHERE key = 'scout-data' AND shared = true AND owner_user_id IS NULL"
    );
    if (!result.rows.length) return res.status(404).json({ error: 'not found' });
    const data = JSON.parse(result.rows[0].value);
    const suggestion = (data.suggestions || []).find(s => s.id === suggestionId);
    if (!suggestion) return res.status(404).json({ error: 'not found' });
    const city = (data.cities || []).find(c => c.id === suggestion.cityId);
    res.json({
      restaurant: suggestion.restaurant,
      cuisine: suggestion.cuisine || null,
      note: suggestion.note || null,
      ratingTaste: suggestion.ratingTaste || null,
      cost: suggestion.cost || null,
      friendName: suggestion.friendName || null,
      cityName: city ? city.name : null,
    });
  } catch (e) {
    console.error('preview fetch failed', e);
    res.status(500).json({ error: 'preview fetch failed' });
  }
});

module.exports = router;
