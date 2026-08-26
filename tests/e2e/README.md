# Playwright end-to-end test — one-time setup

This only needs to be done ONCE. After this, `npx playwright test` just
works on its own every time, using the saved login session below.

## 1. Install Playwright (one time)

From the `nate-worthy-backend` project root in Terminal:

```
npm install -D @playwright/test
npx playwright install chromium
```

The second command downloads a real Chromium browser for Playwright to
drive — this can take a minute or two the first time.

## 2. Create the permanent test account

Sign up on the real production site (nate-worthy.com, or whatever your
live URL is) using an account that's unmistakably a test account, so it's
easy to find and never confused with a real person:

- **Name:** `ZZ PLAYWRIGHT TEST — DO NOT DELETE FROM FRIENDS LIST`
  (the "ZZ" prefix pushes it to the bottom of any alphabetically sorted
  list; the all-caps warning is there so future-you, six months from now,
  doesn't accidentally delete it thinking it's spam)
- **Email:** something you personally control and can click a magic link
  from (e.g. a `+test` alias like `yourname+playwright@gmail.com` works
  great here — Gmail treats that as your real inbox, but it's instantly
  greppable/filterable as the test account's address specifically)

Complete the signup and magic-link click normally, in a real browser, so
the account is fully created and logged in.

## 3. Capture that logged-in session for Playwright to reuse

Run this from the project root (swap in your real production URL):

```
npx playwright codegen --save-storage=tests/e2e/auth.json https://nate-worthy.com
```

This opens a real, separate, Playwright-controlled browser window.

- Log in as the test account you just made (email → click the magic link
  when it arrives — you can click it right from this browser window, or
  from your phone/another tab, either works, since you're just following
  the same link either way).
- Once you're actually logged in and can see the app's tab bar (Discover /
  My Ratings / Circle), just **close that browser window**.
- Playwright automatically writes the logged-in session (cookies) to
  `tests/e2e/auth.json` the moment you close it.

**Do not commit `tests/e2e/auth.json` to git** — it's a real, live login
session for a real account on your real production site. Add it to
`.gitignore`:

```
echo "tests/e2e/auth.json" >> .gitignore
```

If this file ever expires, gets deleted, or the session gets logged out
some other way, just re-run the `codegen` command above to generate a
fresh one — nothing else about the test needs to change.

## 4. Run it

```
npx playwright test
```

## What you'll need to periodically clean up

Every successful test run posts one real, genuinely new restaurant entry
under the test account, so your Postgres data doesn't stay perfectly
clean forever. Every entry created this way is named with an unmistakable
prefix, so a search for **"PLAYWRIGHT TEST ENTRY"** in the admin entries
browser will find all of them at once, regardless of when they were
created. Safe to delete on whatever schedule you like — daily, weekly,
whenever you happen to be in the admin tab.

## Second test account, for the trust/circle test

The trust/circle test (`tests/e2e/trust-circle.spec.js`) rates someone's
taste on the 1-5 star scale. Rather than have the automated test rate a
real person — even though trust ratings are private and only affect the
rater's own view — it rates a second, dedicated test account instead, so
there's no chance of a real person's account showing up in test output.

Create it the same way as the first account:

- **First name:** `ZZ PLAYWRIGHT`
- **Last name:** `FRIEND - DO NOT DELETE`
- **Email:** another alias of an inbox you control, e.g.
  `yourname+playwrightfriend@gmail.com`

This one does NOT need its own saved session — the trust test never logs
in as this account, only searches for it and rates it from the primary
test account. Just sign it up and click its own magic link once, the same
as any real signup, so the account genuinely exists in the system and is
findable by name. Nothing further needed after that.

## Running this from GitHub Actions instead of your own Terminal

A workflow file (`.github/workflows/run-tests.yml`) is included, set to
run both test suites together on a manual button press in GitHub — not
automatically on every push, since the E2E half creates real production
data and depends on a login session that can eventually expire. See the
comments at the top of that file for the full reasoning.

To use it, GitHub needs its own copy of `tests/e2e/auth.json`, since that
file is gitignored and never gets pushed to your repo at all:

1. On GitHub, go to your repo → **Settings** → **Secrets and variables** →
   **Actions** → **New repository secret**
2. Name it exactly: `PLAYWRIGHT_AUTH_JSON`
3. For the value, paste the entire contents of your local
   `tests/e2e/auth.json` file (run `cat tests/e2e/auth.json` locally and
   copy everything it prints, including the outer `{` and `}`)
4. Save it

From then on, go to your repo's **Actions** tab → **Run tests** → **Run
workflow** any time you want to trigger a run from GitHub instead of your
own machine. If the saved session ever expires, redo the `codegen` step
locally (Step 3 above) and update this same GitHub secret with the fresh
`auth.json` contents.

