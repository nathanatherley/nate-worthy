# Full Step-by-Step: From Railway Signup to Live at nate-worthy.com

## Part 1: Railway

**1.1 — Sign up**
Go to railway.app, sign up (GitHub login is easiest if you have one, since it makes connecting your code simpler later).

**1.2 — Create a new project**
From your Railway dashboard, click "New Project."

**1.3 — Get your code into it**
You have two options:
- **Easiest**: put the backend code (everything I gave you — `server.js`, the `src/` folder, `package.json`, etc.) into a GitHub repository, then in Railway choose "Deploy from GitHub repo" and pick it.
- **Alternative**: Railway also has a CLI you can install (`npm install -g @railway/cli`) and deploy directly from your computer with `railway up` — skip this if GitHub feels simpler.

**1.4 — Add a Postgres database**
Inside your new Railway project, click "New" → "Database" → "Add PostgreSQL." Railway automatically creates it and gives your app a `DATABASE_URL` environment variable — you don't need to configure this by hand.

## Part 2: Run the database schema

**2.1** — In Railway, click into your Postgres database, find the "Connect" tab, and copy the connection string it shows you (this is your `DATABASE_URL`).

**2.2** — On your own computer, with the backend code and this connection string available, run:
```
psql "paste-your-connection-string-here" -f src/db/schema.sql
```
This creates all the tables. You only need to do this once.

## Part 3: Cloudflare R2 (photo storage)

**3.1** — In your Cloudflare dashboard, go to R2 → Create bucket. Name it `nate-worthy-photos`.

**3.2** — Go to R2 → Manage API Tokens → Create API Token. Give it read/write permissions on your bucket. This gives you two values: an Access Key ID and a Secret Access Key — save both.

**3.3** — Your Account ID is shown in the R2 dashboard sidebar — save that too.

## Part 4: Set every environment variable

In your Railway project's settings, add each of these (everything except `DATABASE_URL`, which Railway already set for you):

- `ANTHROPIC_API_KEY` — from your Anthropic console account
- `RESEND_API_KEY` — from your Resend account
- `EMAIL_FROM` — something like `Nate-Worthy <onboarding@resend.dev>`
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` — from Part 3
- `APP_URL` — set this to `https://nate-worthy.com`
- `NODE_ENV` — set to `production`

## Part 5: Deploy

If you connected a GitHub repo in step 1.3, Railway deploys automatically whenever you push code. If you used the CLI, run `railway up`. Either way, Railway will show you build logs — watch for it to say the app started successfully (you should see the "listening on :3000"-style message from `server.js` in the logs).

## Part 6: Point your domain at it

**6.1** — In Railway's project settings, find "Networking" or "Domains" and click "Add Custom Domain." Enter `nate-worthy.com`. Railway will show you a CNAME record to add.

**6.2** — Go to wherever you registered nate-worthy.com, find its DNS settings, and add that exact CNAME record.

**6.3** — Wait. This can take anywhere from a few minutes to a few hours to fully propagate.

## Part 7: Test it for real

Visit `https://nate-worthy.com`. Enter your email, check your inbox for the sign-in link, click it, confirm you land back in the app signed in. Then create your profile, add one entry with a photo, and ask "What sounds good?" once. If all of that works, every major piece — auth, database, photo storage, and the AI — is genuinely working together for the first time.

## Part 8 (later): Bring your real data over

Once the site above is confirmed working with a test entry, export your data from the *old* site, then run the migration script (`node migrate-old-export.js path/to/your-export.json`) to bring everyone's real profiles, ratings, and photos into the new database properly.

## If something breaks along the way

Tell me exactly which step you were on and what you actually saw (an error message, a blank page, whatever) — that's much more useful for me to help with than "it didn't work."
