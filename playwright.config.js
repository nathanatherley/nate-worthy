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
  fullyParallel: false, // keeps tests within one file in order
  workers: 1, // the real fix for cross-file parallelism -- fullyParallel:
              // false alone does NOT stop Playwright from running
              // DIFFERENT spec files at the same time on separate workers.
              // All the tests in this project share one permanent test
              // account's login session (see tests/e2e/README.md), so two
              // tests touching that same account simultaneously can race
              // and corrupt each other's in-progress form state -- this is
              // exactly what happened the first time this ran in CI, where
              // GitHub's runner had multiple cores available and Playwright
              // used 2 workers by default. Forcing workers:1 makes every
              // test run strictly one at a time, no exceptions.
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
