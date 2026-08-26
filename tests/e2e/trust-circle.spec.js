// Nate-Worthy trust/circle end-to-end test.
//
// Covers: finding a specific person via the Circle tab's search, rating
// their taste on the 1-5 star trust scale, and confirming that rating
// actually persisted server-side (not just updated in the page's own
// in-memory state) by reloading and checking it's still there.
//
// Deliberately rates a SECOND permanent test account, never a real
// person. Trust ratings are private (only the rater ever sees them) and
// only affect the rater's own recommendation weighting, so rating a real
// stranger wouldn't actually be visible to them -- but using a second
// dedicated test account removes any doubt about that entirely, and
// avoids a real person's account ever showing up in automated test
// output or screenshots. See tests/e2e/README.md for how to create it.
//
// Runs against production, already logged in as the PRIMARY test account
// (same saved session as critical-path.spec.js).
const { test, expect } = require('@playwright/test');

// Must match the second test account's full name EXACTLY, case
// differences aside -- Nate-Worthy's friend search only does partial
// matching for people already "reachable" through some existing
// connection, and these two test accounts have no connection to each
// other at all, so this falls into the exact-match-only path.
const FRIEND_FULL_NAME = 'ZZ PLAYWRIGHT FRIEND - DO NOT DELETE';
const TRUST_STARS = 4;

test.describe('Trust circle', () => {
  test('finding and rating a specific person actually persists the trust rating', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-switch-tab="circle"]').click();

    // Self-healing: if a PREVIOUS run's cleanup step didn't actually take
    // (e.g. a race condition against another test sharing this same
    // account -- this happened once for real, before workers:1 was added
    // to the config, and left this exact friend stuck at a non-zero
    // rating), the friend may already be sitting in the main "Your trust
    // circle" list rather than needing to be searched for. Handle both
    // starting states rather than assuming a perfectly clean slate.
    let friendRow = page.locator('.friend-row', { hasText: FRIEND_FULL_NAME });
    const alreadyVisible = await friendRow.isVisible({ timeout: 3000 }).catch(() => false);

    if (!alreadyVisible) {
      await page.locator('#friend-search-input').fill(FRIEND_FULL_NAME);
      const searchResultRow = page.locator('[data-friend-search-add]', { hasText: FRIEND_FULL_NAME });
      await expect(searchResultRow).toBeVisible({ timeout: 10000 });
      await searchResultRow.click();
      friendRow = page.locator('.friend-row', { hasText: FRIEND_FULL_NAME });
      await expect(friendRow).toBeVisible({ timeout: 5000 });
    }

    // Clear any pre-existing rating first -- clicking a star that's
    // already set to that exact value is this app's own documented way
    // to reset it to 0 (see the data-trust-star click handler).
    //
    // Important: that click handler calls saveData() WITHOUT awaiting it
    // (fire-and-forget -- the on-screen star updates immediately via an
    // optimistic render(), but the actual network save can still be in
    // flight). Two rating changes fired back-to-back can genuinely race
    // each other at the database level if the test only waits for the
    // on-screen class to update rather than the real save completing --
    // this is exactly what caused a flaky, sometimes-wrong-end-state
    // failure the first time this ran in CI. Explicitly waiting for the
    // actual /api/storage network response after each click closes that
    // gap.
    const existingFilledCount = await friendRow.locator('.rate-star-trust.filled').count();
    if (existingFilledCount > 0) {
      await Promise.all([
        page.waitForResponse(r => r.url().includes('/api/storage') && r.request().method() === 'POST'),
        friendRow.locator(`[data-val="${existingFilledCount}"]`).click(),
      ]);
      await expect(friendRow.locator('.rate-star-trust.filled')).toHaveCount(0, { timeout: 5000 });
    }

    await Promise.all([
      page.waitForResponse(r => r.url().includes('/api/storage') && r.request().method() === 'POST'),
      friendRow.locator(`[data-val="${TRUST_STARS}"]`).click(),
    ]);

    // Confirms the click didn't just update what's on screen right now --
    // reloading and finding the same filled star proves it actually
    // round-tripped through saveData() to the server and back.
    await page.reload();
    await page.locator('[data-switch-tab="circle"]').click();

    const friendRowAfterReload = page.locator('.friend-row', { hasText: FRIEND_FULL_NAME });
    await expect(friendRowAfterReload).toBeVisible({ timeout: 10000 });
    await expect(friendRowAfterReload.locator(`[data-val="${TRUST_STARS}"]`)).toHaveClass(/filled/);

    // Clean up after the test rather than leaving an ever-growing pile of
    // stale trust ratings between the two test accounts -- clicking the
    // same star value again is this app's own documented way to clear a
    // rating back to 0. Same explicit network-wait as above, for the same
    // reason.
    await Promise.all([
      page.waitForResponse(r => r.url().includes('/api/storage') && r.request().method() === 'POST'),
      friendRowAfterReload.locator(`[data-val="${TRUST_STARS}"]`).click(),
    ]);
    await expect(friendRowAfterReload.locator('.rate-star-trust.filled')).toHaveCount(0, { timeout: 5000 });
  });
});
