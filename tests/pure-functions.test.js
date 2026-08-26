// Run with: node --test tests/pure-functions.test.js
// No install needed -- node:test has been built into Node since v18, and
// these functions have zero dependencies of their own, so there's nothing
// else to set up.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  distKm,
  crowFliesMiles,
  formatCrowFliesMiles,
  formatMatchPercent,
  blendedStarRating,
  normalizeCityForMatch,
} = require('../public/js/pure-functions.js');

describe('distKm', () => {
  test('distance from a point to itself is zero', () => {
    assert.equal(distKm(40.7608, -111.8910, 40.7608, -111.8910), 0);
  });

  test('Salt Lake City to New York City is approximately 3,167 km', () => {
    // Known real-world great-circle distance (~1,968 miles), used as a
    // sanity check on the formula itself rather than an arbitrary made-up
    // expectation.
    const km = distKm(40.7608, -111.8910, 40.7128, -74.0060);
    assert.ok(km > 3140 && km < 3190, `expected ~3140-3190km, got ${km}`);
  });

  test('is symmetric -- order of the two points does not matter', () => {
    const a = distKm(40.7608, -111.8910, 34.0522, -118.2437);
    const b = distKm(34.0522, -118.2437, 40.7608, -111.8910);
    assert.equal(a, b);
  });
});

describe('crowFliesMiles', () => {
  test('returns null when any coordinate is missing', () => {
    assert.equal(crowFliesMiles(null, -111.89, 40.76, -111.89), null);
    assert.equal(crowFliesMiles(40.76, undefined, 40.76, -111.89), null);
    assert.equal(crowFliesMiles(40.76, -111.89, 40.76, null), null);
    assert.equal(crowFliesMiles(40.76, -111.89, 40.76, undefined), null);
  });

  test('returns 0, not null, for two identical points', () => {
    assert.equal(crowFliesMiles(40.76, -111.89, 40.76, -111.89), 0);
  });

  test('converts km to miles correctly (miles < km)', () => {
    const km = distKm(40.7608, -111.8910, 40.7300, -111.8500);
    const miles = crowFliesMiles(40.7608, -111.8910, 40.7300, -111.8500);
    assert.ok(miles < km, 'miles should be a smaller number than km for the same real distance');
    assert.ok(Math.abs(miles - km * 0.621371) < 0.0001);
  });
});

describe('formatCrowFliesMiles', () => {
  test('returns null when input is null (no coordinate data)', () => {
    assert.equal(formatCrowFliesMiles(null), null);
  });

  test('very close distances get a dedicated "less than 0.1 mi" message', () => {
    assert.equal(formatCrowFliesMiles(0.05), 'Less than 0.1 mi away (as the crow flies)');
    assert.equal(formatCrowFliesMiles(0), 'Less than 0.1 mi away (as the crow flies)');
  });

  test('under 10 miles shows one decimal place', () => {
    assert.equal(formatCrowFliesMiles(3.456), '3.5 mi away (as the crow flies)');
    assert.equal(formatCrowFliesMiles(9.94), '9.9 mi away (as the crow flies)');
  });

  test('10 miles or more rounds to a whole number', () => {
    assert.equal(formatCrowFliesMiles(10.0), '10 mi away (as the crow flies)');
    assert.equal(formatCrowFliesMiles(142.6), '143 mi away (as the crow flies)');
  });
});

describe('formatMatchPercent', () => {
  test('returns null with zero shared ratings -- never a fabricated percentage', () => {
    assert.equal(formatMatchPercent(0, 0), null);
    assert.equal(formatMatchPercent(5, 0), null);
  });

  test('returns null with a negative shared count (defensive, should never happen upstream)', () => {
    assert.equal(formatMatchPercent(1, -1), null);
  });

  test('perfect agreement on every shared rating gives 100%', () => {
    // tasteSimilarityScore adds up to 1.0 per perfectly-matched rating, so
    // 3 shared ratings all in perfect agreement sums to a score of 3.
    assert.equal(formatMatchPercent(3, 3), 100);
  });

  test('a raw score that is itself a fraction (partial agreement) rounds correctly', () => {
    assert.equal(formatMatchPercent(1.5, 3), 50);
    assert.equal(formatMatchPercent(2.005, 3), 67); // rounds up from 66.8ish
  });
});

describe('blendedStarRating', () => {
  test('returns null when either input is zero or missing', () => {
    assert.equal(blendedStarRating(0, 4), null);
    assert.equal(blendedStarRating(3, 0), null);
    assert.equal(blendedStarRating(null, 4), null);
    assert.equal(blendedStarRating(3, null), null);
  });

  test('never exceeds the rater\'s own taste rating, even with maximum trust', () => {
    // This is the specific bug the cap exists to prevent: trust 5 + rating
    // 4 has a geometric mean of sqrt(20) ≈ 4.47, which must be clamped
    // back down to 4 -- trust cannot invent a better review than the
    // person actually gave.
    const result = blendedStarRating(5, 4);
    assert.ok(result <= 4, `expected result <= 4, got ${result}`);
    assert.equal(result, 4);
  });

  test('equal trust and rating returns that same number', () => {
    assert.equal(blendedStarRating(4, 4), 4);
  });

  test('low trust pulls the blended rating down below the raw rating', () => {
    const result = blendedStarRating(1, 5);
    assert.ok(result < 5, `expected result < 5, got ${result}`);
    assert.equal(result, Math.sqrt(5));
  });
});

describe('normalizeCityForMatch', () => {
  test('"New York City" and "new york" match after normalizing', () => {
    assert.equal(normalizeCityForMatch('New York City'), normalizeCityForMatch('new york'));
  });

  test('trims whitespace', () => {
    assert.equal(normalizeCityForMatch('  Austin  '), 'austin');
  });

  test('only strips a trailing "city", not "city" in the middle of a name', () => {
    assert.equal(normalizeCityForMatch('Salt Lake City'), 'salt lake');
    assert.equal(normalizeCityForMatch('City of Industry'), 'city of industry');
  });

  test('handles null/undefined/empty input without throwing', () => {
    assert.equal(normalizeCityForMatch(null), '');
    assert.equal(normalizeCityForMatch(undefined), '');
    assert.equal(normalizeCityForMatch(''), '');
  });
});
