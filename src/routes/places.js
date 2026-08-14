// Server-side Google Places proxy. The frontend calls this instead of
// Google directly -- your API key lives only here, never in the browser,
// same pattern as the Anthropic proxy in recommend.js.
//
// Two endpoints:
//   POST /api/places/autocomplete  body: { input, lat?, lng? }
//     -> live suggestions as someone types a restaurant name
//   POST /api/places/details       body: { placeId }
//     -> address, phone, website, coordinates for a specific place,
//        looked up by its place_id
//
// place_id is the only piece of this that's safe to store forever --
// address/phone/website are NOT permitted to be cached long-term under
// Google's current terms, so the frontend should call /details fresh each
// time it needs to display those fields for a restaurant that doesn't
// already have a cached place_id, rather than writing them into the
// database as permanent fields. (See the caching-policy conversation this
// was built from -- only place_id and, for up to 30 days, coordinates are
// exempt from the "don't cache" rule.)
const express = require('express');
const { requireAuth } = require('../auth/middleware');
const router = express.Router();
router.use(requireAuth);

const PLACES_API_BASE = 'https://places.googleapis.com/v1';

// POST /api/places/autocomplete
router.post('/autocomplete', async (req, res) => {
  const { input, lat, lng } = req.body;
  if (!process.env.GOOGLE_PLACES_API_KEY) return res.status(500).json({ error: 'server missing GOOGLE_PLACES_API_KEY' });
  if (!input || !input.trim()) return res.json({ suggestions: [] });

  const body = {
    input: input.trim(),
    includedPrimaryTypes: ['restaurant', 'food', 'cafe', 'bakery', 'bar'],
  };
  // Bias (not restrict) results toward the city the person is already
  // adding an entry for, when we know it -- a bias still allows other
  // matches through, it just ranks nearby ones higher, which is what you
  // want for "start typing a restaurant name" rather than hard-excluding
  // anything outside a radius.
  if (typeof lat === 'number' && typeof lng === 'number') {
    body.locationBias = { circle: { center: { latitude: lat, longitude: lng }, radius: 50000.0 } };
  }

  try {
    const r = await fetch(`${PLACES_API_BASE}/places:autocomplete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': process.env.GOOGLE_PLACES_API_KEY,
        // Only ask for what the autocomplete dropdown actually needs to
        // display and to identify a selection -- field masks aren't just
        // about tidiness, requesting fewer fields is what keeps this call
        // in the cheaper pricing tier.
        'X-Goog-FieldMask': 'suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat',
      },
      body: JSON.stringify(body),
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json(data);
    res.json(data);
  } catch (e) {
    console.error('places autocomplete proxy failed', e);
    res.status(500).json({ error: 'places autocomplete proxy failed' });
  }
});

// POST /api/places/details  body: { placeId }
router.post('/details', async (req, res) => {
  const { placeId } = req.body;
  if (!process.env.GOOGLE_PLACES_API_KEY) return res.status(500).json({ error: 'server missing GOOGLE_PLACES_API_KEY' });
  if (!placeId || typeof placeId !== 'string') return res.status(400).json({ error: 'placeId required' });

  try {
    const r = await fetch(`${PLACES_API_BASE}/places/${encodeURIComponent(placeId)}`, {
      method: 'GET',
      headers: {
        'X-Goog-Api-Key': process.env.GOOGLE_PLACES_API_KEY,
        // id (place_id), name/address/phone/website for display, and
        // location so a claimed restaurant can get real coordinates
        // instead of relying on the city-level lookup table.
        'X-Goog-FieldMask': 'id,displayName,formattedAddress,nationalPhoneNumber,websiteUri,location',
      },
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json(data);
    res.json(data);
  } catch (e) {
    console.error('places details proxy failed', e);
    res.status(500).json({ error: 'places details proxy failed' });
  }
});

module.exports = router;
