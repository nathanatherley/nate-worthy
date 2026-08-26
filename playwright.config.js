// Playwright config for Nate-Worthy's critical-path end-to-end test.
// Points at production and reuses one permanent, clearly-named test
// account's login session (see tests/e2e/README.md for the one-time setup
// that creates tests/e2e/auth.json) rather than signing up a fresh account
// on every run, since the app's magic-link auth has no password Playwright
// could type in on its own.
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 60 * 1000, // generous -- this hits the real AI recommendation
                       // endpoint on a real run, which is slower than a
                       // typical page load
  fullyParallel: false, // deliberately sequential -- all tests share the
                         // one permanent test account, so two tests
                         // touching it at the same time could race
  retries: 1, // a single retry absorbs a one-off network hiccup against
              // production without masking a real, repeatable failure
  reporter: 'list',
  use: {
    baseURL: 'https://nate-worthy.com', // update if your real production URL differs
    storageState: 'tests/e2e/auth.json', // the saved test-account login session
    trace: 'retain-on-failure', // keeps a full step-by-step recording,
                                 // but only for runs that actually fail,
                                 // so passing runs don't pile up disk usage
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
