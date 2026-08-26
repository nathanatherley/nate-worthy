// Pure functions only -- no DOM, no globals, no fetch, no dependency on
// `state`/`me`/anything else defined elsewhere in index.html. Every
// function here takes plain arguments and returns a plain value, which is
// what makes them worth pulling out on their own: they're the parts of the
// app's math that a unit test can actually pin down, versus something like
// myTrustWeight() which reads live app state and needs the whole app
// running to mean anything.
//
// Loaded two ways from the exact same file, so there's one source of truth
// instead of two copies that could quietly drift apart:
//   - the browser loads this as a plain <script src="/js/pure-functions.js">
//     tag, same pattern already used for /db-client.js, which defines these
//     as ordinary globals for the rest of index.html's inline script to call
//   - Node's test runner does `require('../public/js/pure-functions.js')`
//     and gets them back as an exports object instead

// Straight-line ("great-circle") distance in kilometers between two
// lat/lon points, via the haversine formula.
function distKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// Straight-line ("as the crow flies") distance in miles between the
// person's last-known location and a restaurant's coordinates. Reuses
// distKm rather than re-deriving haversine a second time, then converts.
// Returns null (not 0) when either coordinate is missing, so callers can
// tell "no data" apart from "you're standing on top of it."
function crowFliesMiles(lat1, lon1, lat2, lon2) {
  if (typeof lat1 !== 'number' || typeof lon1 !== 'number' || typeof lat2 !== 'number' || typeof lon2 !== 'number') return null;
  return distKm(lat1, lon1, lat2, lon2) * 0.621371;
}

// Formats a miles figure the way the rest of the app already writes
// distance: one decimal under 10 miles, whole number above it, since a
// whole mile is precise enough once you're that far out.
function formatCrowFliesMiles(miles) {
  if (miles === null) return null;
  if (miles < 0.1) return 'Less than 0.1 mi away (as the crow flies)';
  const rounded = miles < 10 ? miles.toFixed(1) : Math.round(miles).toString();
  return rounded + ' mi away (as the crow flies)';
}

// Converts a raw similarity SUM (from tasteSimilarityScore, which can
// exceed 1 since it sums across every shared rating) into an actual
// displayable percentage -- the average closeness per shared rating.
// Returns null (never a fabricated number) when there's no shared data.
function formatMatchPercent(score, sharedCount) {
  if (!sharedCount || sharedCount <= 0) return null;
  return Math.round((score / sharedCount) * 100);
}

// Blends someone's trust weight with their taste rating for a restaurant
// via geometric mean, capped so trust can only ever discount a rating
// downward, never inflate it above what the rater actually said --
// trusting someone doesn't create new information about the restaurant
// beyond their own stated rating.
function blendedStarRating(trustWeight, tasteRating) {
  if (!(trustWeight > 0) || !(tasteRating > 0)) return null;
  return Math.min(Math.sqrt(trustWeight * tasteRating), tasteRating);
}

// Normalizes a typed city name for matching against known cities --
// trims, lowercases, and drops a trailing "city" so "New York City" and
// "new york" compare equal.
function normalizeCityForMatch(name) {
  return (name || '').trim().toLowerCase().replace(/\s+city$/, '');
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { distKm, crowFliesMiles, formatCrowFliesMiles, formatMatchPercent, blendedStarRating, normalizeCityForMatch };
}
