// One-time migration script: imports an export from the old Claude-hosted
// site into the new self-hosted database.
//
// This has to do more than just copy the JSON over, because photos changed
// storage format: the old export has photos as base64 text under keys like
// "photo:entryId:idx:uid" — the new app expects real R2 object keys instead.
// This script decodes each old photo, uploads the actual bytes to R2, and
// rewrites each entry's photoKeys to point at the new R2 keys — so photos
// actually work after migration, not just the text data.
//
// Usage:
//   node migrate-old-export.js path/to/your-old-export.json
//
// Requires the same environment variables as the main server (DATABASE_URL,
// R2 credentials) — run this from the backend project with your .env loaded.

require('dotenv').config();
const fs = require('fs');
const crypto = require('crypto');
const pool = require('./src/db/pool');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});
const BUCKET = process.env.R2_BUCKET_NAME || 'nate-worthy-photos';

async function uploadPhotoToR2(base64DataUrl, userIdPlaceholder) {
  const match = base64DataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
  if (!match) return null;
  const [, ext, base64Data] = match;
  const buffer = Buffer.from(base64Data, 'base64');
  const key = `photos/${userIdPlaceholder}/${crypto.randomUUID()}.${ext}`;
  await r2.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: buffer, ContentType: `image/${ext}` }));
  return key;
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: node migrate-old-export.js path/to/export.json');
    process.exit(1);
  }

  const raw = fs.readFileSync(filePath, 'utf8');
  const data = JSON.parse(raw);
  const { cities = [], friends = [], suggestions = [], photos = {} } = data;

  console.log(`Loaded export: ${friends.length} people, ${suggestions.length} entries, ${Object.keys(photos).length} photos.`);

  // Step 1: migrate photos first, building a map of old key -> new R2 key.
  const keyMap = {};
  const photoKeys = Object.keys(photos);
  for (let i = 0; i < photoKeys.length; i++) {
    const oldKey = photoKeys[i];
    // old keys look like "photo:entryId:idx:uid" -- pull the entry's owning
    // friendId from the suggestion itself, so photos land in a sensible R2 path
    const entryId = oldKey.split(':')[1];
    const owningEntry = suggestions.find(s => s.id === entryId);
    const ownerLabel = owningEntry ? owningEntry.friendId : 'unknown';
    try {
      const newKey = await uploadPhotoToR2(photos[oldKey], ownerLabel);
      if (newKey) {
        keyMap[oldKey] = newKey;
        console.log(`  [${i + 1}/${photoKeys.length}] migrated photo for entry ${entryId}`);
      }
    } catch (e) {
      console.error(`  FAILED to migrate photo ${oldKey}:`, e.message);
    }
  }

  // Step 2: rewrite each suggestion's photoKeys to point at the new R2 keys.
  const migratedSuggestions = suggestions.map(s => ({
    ...s,
    photoKeys: (s.photoKeys || []).map(oldKey => keyMap[oldKey]).filter(Boolean),
  }));

  // Step 3: write the core data into the new database via the same kv_store
  // bridge the live app already uses, under the same 'scout-data' key.
  const newState = { cities, friends, suggestions: migratedSuggestions };
  await pool.query(
    `INSERT INTO kv_store (key, shared, owner_user_id, value, updated_at)
     VALUES ('scout-data', true, NULL, $1, now())
     ON CONFLICT (key) WHERE shared = true
     DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [JSON.stringify(newState)]
  );

  console.log(`\nDone. ${Object.keys(keyMap).length}/${photoKeys.length} photos migrated successfully.`);
  console.log('Core data (cities, friends, entries) written to the new database.');
  if (Object.keys(keyMap).length < photoKeys.length) {
    console.log('\nSome photos failed to migrate -- check the FAILED lines above before considering this fully done.');
  }
  process.exit(0);
}

main().catch(e => { console.error('Migration failed:', e); process.exit(1); });
