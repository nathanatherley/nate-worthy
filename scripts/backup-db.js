// Daily database backup: dumps the full Postgres database with pg_dump,
// then uploads the dump to the same R2 bucket already used for photos
// (under a separate "backups/" prefix, so nothing overlaps). This is a
// manual/scripted alternative to Railway's paid automatic backups --
// Railway's Pro-plan backups were the other option, this is the free path.
//
// Run on a schedule via Railway's Cron Schedule feature (see project
// Settings), not via this app's main web service.
const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
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

// How many days of backups to keep before old ones are deleted, so R2
// storage doesn't grow unbounded. 30 daily backups is plenty of recovery
// window for a project this size.
const RETENTION_DAYS = 30;

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL not set');

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dumpPath = path.join(os.tmpdir(), `nate-worthy-${timestamp}.sql`);
  const key = `backups/nate-worthy-${timestamp}.sql`;

  console.log(`Dumping database to ${dumpPath}...`);
  // --no-owner/--no-acl: makes the dump portable across different Postgres
  // instances (e.g. restoring into a fresh Railway Postgres later), since
  // role/permission ownership won't match anyway.
  execSync(`pg_dump "${process.env.DATABASE_URL}" --no-owner --no-acl -f "${dumpPath}"`, { stdio: 'inherit' });

  const stats = fs.statSync(dumpPath);
  console.log(`Dump complete: ${(stats.size / 1024 / 1024).toFixed(2)} MB. Uploading to R2 as ${key}...`);

  const body = fs.readFileSync(dumpPath);
  await r2.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: body,
    ContentType: 'application/sql',
  }));

  fs.unlinkSync(dumpPath);
  console.log('Backup uploaded successfully.');

  await pruneOldBackups();
}

async function pruneOldBackups() {
  const { ListObjectsV2Command, DeleteObjectCommand } = require('@aws-sdk/client-s3');
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;

  const list = await r2.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: 'backups/' }));
  const toDelete = (list.Contents || []).filter(obj => obj.LastModified && obj.LastModified.getTime() < cutoff);

  for (const obj of toDelete) {
    console.log(`Pruning old backup: ${obj.Key}`);
    await r2.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: obj.Key }));
  }
  if (toDelete.length) console.log(`Pruned ${toDelete.length} backup(s) older than ${RETENTION_DAYS} days.`);
}

main().catch(e => {
  console.error('Backup failed:', e);
  process.exit(1);
});
