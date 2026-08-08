# Deploying Nate-Worthy to nate-worthy.com

## What you need before starting

All five accounts: Railway, Cloudflare R2, Resend, an Anthropic API key with credits added, and the nate-worthy.com domain (already done).

## 1. Create the R2 bucket

In the Cloudflare dashboard → R2 → Create bucket → name it `nate-worthy-photos` (or update `R2_BUCKET_NAME` in your `.env` to match whatever you name it). Then, under R2 → Manage API Tokens, create a token with read/write access — this gives you `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY`. Your `R2_ACCOUNT_ID` is shown in the R2 dashboard's sidebar.

## 2. Push this code to Railway

- Create a new Railway project, connect it to a GitHub repo containing this code (or use Railway's CLI to deploy directly from your machine).
- Add a Postgres database from Railway's plugin marketplace — this automatically gives your app a `DATABASE_URL` environment variable, no manual setup needed.

## 3. Run the schema migration

Once your database exists, run the schema once, using the `DATABASE_URL` Railway gave you:

```
psql "$DATABASE_URL" -f src/db/schema.sql
```

(Or use `npm run migrate` if `DATABASE_URL` is already set in your local environment pointing at the same database.)

## 4. Set the remaining environment variables

In Railway's project settings, add everything from `.env.example` except `DATABASE_URL` (Railway already provides that): `ANTHROPIC_API_KEY`, `RESEND_API_KEY`, `EMAIL_FROM`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, and `APP_URL` set to `https://nate-worthy.com`.

## 5. Point your domain at Railway

In Railway's project settings, add a custom domain: `nate-worthy.com`. Railway will give you a CNAME record to add — go to your domain registrar's DNS settings and add it there. This usually takes a few minutes to a few hours to propagate.

## 6. Test it

Visit `https://nate-worthy.com`, enter your email, click the link that arrives, and confirm you land back in the app signed in. Then walk through creating your profile, adding one entry with a photo, and asking "What sounds good?" once — that exercises every major piece (auth, database, photo storage, and the AI proxy) in one pass.

## A note on the very first sign-in

The first time you (or anyone) signs in with a brand-new email, there's no friend profile yet tied to that account — the existing "Who are you" form should catch this and prompt for a name and phone number, same as it always has. This is the one path that hasn't been tested end-to-end against a real, live database, so it's worth paying close attention to on your very first real test.
