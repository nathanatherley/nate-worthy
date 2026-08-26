// Nate-Worthy critical-path end-to-end test.
//
// Runs against production, already logged in as one permanent test
// account (see tests/e2e/README.md for the one-time setup) since the
// app's magic-link auth has no password Playwright could type on its own.
//
// Covers: post a new entry -> ask for a recommendation -> verify the
// sign-out button's confirmation flow works, WITHOUT actually completing
// sign-out (which would kill the saved login session this whole file
// depends on -- see the comment on that test below for why).
//
// Every piece of data this test creates is named with an unmistakable
// "PLAYWRIGHT TEST" marker so it's trivial to find and delete later in
// the admin entries browser -- nothing here is meant to look like real
// user activity.
const { test, expect } = require('@playwright/test');

// One shared timestamp per test run, folded into the restaurant name, so
// re-running this test doesn't hit Nate-Worthy's own duplicate-entry
// detection (which would pop up a "merge into existing entry?" dialog
// this test isn't written to handle) and so multiple runs are still
// individually distinguishable from each other in the admin entries list.
const RUN_ID = Date.now();
const TEST_RESTAURANT_NAME = `PLAYWRIGHT TEST ENTRY ${RUN_ID} - delete me`;
const TEST_CITY = 'Salt Lake City';

test.describe('Critical path', () => {
  test('the app loads already signed in as the test account', async ({ page }) => {
    await page.goto('/');
    // The tab bar only renders for a signed-in person -- if the saved
    // session in auth.json has expired or been logged out some other way,
    // this is the test that fails first and tells you clearly why every
    // other test in this file is also about to fail, rather than each one
    // failing separately with a more confusing error further downstream.
    await expect(page.locator('[data-switch-tab="board"]')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('[data-switch-tab="discover"]')).toBeVisible();
    await expect(page.locator('[data-switch-tab="circle"]')).toBeVisible();
  });

  test('posting a new entry actually saves and shows a success message', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-switch-tab="board"]').click();

    await page.locator('#f-city').fill(TEST_CITY);
    // Typing a city can trigger an inline "Yes, use 'Salt Lake City'?"
    // confirmation depending on what's already in the field -- click it
    // if it shows up, but don't fail the test if it doesn't, since
    // whether it appears depends on form state this test doesn't control.
    const cityConfirmYes = page.locator('#city-confirm-yes-btn');
    if (await cityConfirmYes.isVisible({ timeout: 2000 }).catch(() => false)) {
      await cityConfirmYes.click();
    }
    // The form won't save without a state -- found this the hard way on
    // the first real run against production, where the app correctly
    // rejected the submission with "Enter a state..." and this test's
    // first draft had never filled it in.
    await page.locator('#f-state').fill('UT');

    await page.locator('#f-restaurant').fill(TEST_RESTAURANT_NAME);
    await page.locator('#f-cuisine-select').selectOption('American');
    await page.locator('#f-note').fill('Automated end-to-end test entry -- safe to delete, created by Playwright.');
    await page.locator('[data-form-rate-taste="5"]').click();
    await page.locator('[data-form-rate-cost="2"]').click();

    await page.locator('#f-submit').click();

    // The success/duplicate message shares one element (#f-msg) with two
    // different CSS classes depending on which happened -- asserting the
    // success class specifically (not just that #f-msg has *some* text)
    // is what actually distinguishes "it saved" from "it silently failed
    // and showed an error in the same spot."
    const msg = page.locator('#f-msg');
    await expect(msg).toBeVisible({ timeout: 10000 });
    await expect(msg).toHaveClass(/msg-success/);
  });

  test('asking for a recommendation returns a response without erroring', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-switch-tab="discover"]').click();

    await page.locator('#rec-query').fill('something casual and cheap for lunch');
    await page.locator('#rec-submit').click();

    // This hits the real Anthropic API + Google Places on a real run, so
    // it's deliberately given much longer than a normal UI interaction --
    // the assertion is just "the loading state cleared," not "here are
    // exactly N results," since which restaurants come back will vary
    // run to run and isn't the point of this test. The point is: the
    // whole pipeline (query -> AI -> rendered response) didn't silently
    // break.
    await expect(page.locator('#rec-submit')).not.toHaveText(/Thinking/, { timeout: 45000 });
    // A real failure renders into recError, in a <p class="rec-status">
    // element -- checking that this element is either absent or empty is
    // what turns "the request technically completed" into "and the
    // person didn't just see an error message." No .catch() swallowing
    // here on purpose: if a real error IS showing, this test should
    // actually fail, not silently pass.
    const statusEl = page.locator('.rec-status');
    if (await statusEl.count() > 0) {
      await expect(statusEl.first()).toHaveText('', { timeout: 2000 });
    }
  });

  test('sign-out button correctly warns about an unsaved draft, and Keep Editing genuinely cancels it', async ({ page }) => {
    // Deliberately does NOT complete sign-out. Clicking "Sign out" with no
    // draft in progress signs out IMMEDIATELY with no confirmation step to
    // back out of (see index.html's switch-user click handler) -- so the
    // only way to test this button's behavior without ending the exact
    // saved session every other test in this file depends on is to start
    // an unsaved draft first, which is what triggers the confirmation
    // dialog in the first place, then back out of that dialog on purpose.
    await page.goto('/');
    await page.locator('[data-switch-tab="board"]').click();

    // Just enough of a draft to count as "unsaved work" -- deliberately
    // never submitted.
    await page.locator('#f-restaurant').fill('PLAYWRIGHT TEST DRAFT - never submitted, ignore');

    await page.locator('#switch-user').click();

    await expect(page.locator('#switch-user-cancel-btn')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#switch-user-confirm-btn')).toBeVisible();

    // "Keep editing" -- NOT "Sign out anyway". This is the assertion that
    // actually matters: clicking Keep Editing must leave you signed in.
    await page.locator('#switch-user-cancel-btn').click();

    await expect(page.locator('[data-switch-tab="board"]')).toBeVisible({ timeout: 5000 });
  });
});
