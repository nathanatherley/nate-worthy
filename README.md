# Nate-Worthy

A trust-weighted restaurant recommendation app for a real friend network — recommendations only ever come from people you've personally rated, not the internet at large.

## What's in this repo

- `server.js` — the Express backend entry point
- `src/db/schema.sql` — the Postgres schema
- `src/auth/` — magic-link (passwordless) authentication
- `src/routes/storage.js` — a key-value storage API the frontend talks to
- `src/routes/recommend.js` — the AI recommendation proxy (your own Anthropic key lives server-side only, never in the browser)
- `src/routes/photos.js` — photo upload/storage via Cloudflare R2
- `public/index.html` — the actual frontend app
- `migrate-old-export.js` — one-time script for bringing data over from an older version of the site

## Setup

See `FULL-WALKTHROUGH.md` for the complete, step-by-step deployment guide, or `DEPLOY.md` for the condensed version. `MIGRATION.md` covers moving data from an older site into this one.

Copy `.env.example` to `.env` and fill in your own values before running anything — this app needs a Postgres database, an Anthropic API key, a Resend account (for sign-in emails), and Cloudflare R2 (for photos) to actually function.

## Running locally

```
npm install
cp .env.example .env   # then fill in your real values
npm run migrate         # sets up the database schema once
npm start
```
