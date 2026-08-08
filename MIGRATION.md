# Migrating Your Old Site's Data to the New Self-Hosted One

## The complication worth knowing about first

This isn't a simple copy-paste. Your old (Claude-hosted) site stores photos as base64 text embedded directly in the export file. The new self-hosted site stores photos as real files in Cloudflare R2. If you just imported the old export as-is, your people, ratings, and restaurant entries would come across fine — but every photo would silently be broken, since the new app expects real R2 file references, not base64 text.

## What I built to handle this properly

A real migration script (`migrate-old-export.js`) that does the conversion correctly, in three steps:
1. **Decodes every base64 photo** from your old export and **uploads the actual image bytes to R2**, getting back a real file reference for each one.
2. **Rewrites every entry's photo references** to point at these new R2 files instead of the old text-based keys.
3. **Writes everyone's profiles, ratings, and entries into the new database**, using the same storage mechanism the live app already relies on.

## How to actually use it, when the time comes

1. On your **old** site (the Claude-hosted one you're using right now), go to Admin tools → Export your data — this gives you the JSON file with everyone's data plus embedded photos.
2. Once the new self-hosted site is deployed and its database exists, put that exported file somewhere accessible and run:
   ```
   node migrate-old-export.js path/to/your-export.json
   ```
3. It'll print progress as it migrates each photo, then confirm how many succeeded. If any photos fail (network hiccup, whatever), it tells you clearly rather than silently losing them.

## Why this needs to happen after the new site's database and R2 bucket already exist

This script writes directly into your new Postgres database and uploads directly to your R2 bucket — it needs both to actually exist and be reachable first. This is the natural last step in the deployment sequence: get the new site fully running empty, confirm it works with a test entry, *then* run this to bring your real data over.

## One honest caveat

Like the rest of this backend work, I haven't been able to test this against a real, live database and R2 bucket from here — the logic is sound and follows the same patterns already verified elsewhere in this build, but the first real run of this script is worth doing carefully and checking the results, not assuming it's flawless on the first try.
