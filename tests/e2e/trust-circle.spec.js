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

    await page.locator('#friend-search-input').fill(FRIEND_FULL_NAME);

    const searchResultRow = page.locator('[data-friend-search-add]', { hasText: FRIEND_FULL_NAME });
    await expect(searchResultRow).toBeVisible({ timeout: 10000 });
    await searchResultRow.click();

    // Clicking the search result moves this person from "search results"
    // into the actual rateable list -- a different element entirely
    // (.friend-row, not .group-pick-suggestion-row), so this locator is
    // deliberately scoped to that new row, not the one just clicked.
    const friendRow = page.locator('.friend-row', { hasText: FRIEND_FULL_NAME });
    await expect(friendRow).toBeVisible({ timeout: 5000 });

    await friendRow.locator(`[data-val="${TRUST_STARS}"]`).click();

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
    // rating back to 0 (see the data-trust-star click handler: "current
    // === val ? 0 : val").
    await friendRowAfterReload.locator(`[data-val="${TRUST_STARS}"]`).click();
  });
});
