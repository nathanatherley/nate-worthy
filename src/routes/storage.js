// Storage-compatibility API.
//
// The existing frontend calls window.storage.get(key, shared),
// window.storage.set(key, value, shared), window.storage.list(prefix, shared),
// window.storage.delete(key, shared). This router implements the same
// four operations as real HTTP endpoints, so the frontend's replacement
// client (see db-client.js on the frontend side) can mimic that exact
// interface while actually talking to Postgres underneath.
//
// "shared" keys are visible to everyone (the whole app's board data lives
// under a shared key). "personal" keys are scoped to the logged-in user only.

const express = require('express');
const pool = require('../db/pool');
const { requireAuth } = require('../auth/middleware');

const router = express.Router();
router.use(requireAuth);
// This data changes frequently and must always be read fresh — a cached,
// stale response here is exactly what caused real confusion tonight (an
// import appeared to do nothing because the browser silently reused an old
// cached copy of a GET request instead of asking the server again).
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  next();
});

// GET /api/storage/:key?shared=true
router.get('/:key', async (req, res) => {
  const { key } = req.params;
  const shared = req.query.shared === 'true';
  const ownerId = shared ? null : req.userId;

  try {
    const result = await pool.query(
      'SELECT value, version FROM kv_store WHERE key = $1 AND shared = $2 AND owner_user_id IS NOT DISTINCT FROM $3',
      [key, shared, ownerId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'not found' });
    res.json({ key, value: result.rows[0].value, version: result.rows[0].version, shared });
  } catch (e) {
    console.error('storage get failed', e);
    res.status(500).json({ error: 'storage get failed' });
  }
});

// POST /api/storage/:key   body: { value, shared, expectedVersion }
//
// expectedVersion is optional. When provided, the write is conditional:
// it only applies if the stored row's current version still matches what
// the client last read. This closes the read-merge-write race that let
// two overlapping saves silently clobber each other with no error on
// either side (confirmed as the likely cause of a lost user review --
// see incident notes). If the version has moved on, nothing is written
// and the client gets a 409 back, so it can re-read, re-merge, and retry
// instead of blindly overwriting someone else's concurrent save.
//
// Callers that don't pass expectedVersion (or pass null) get the old
// unconditional last-write-wins behavior -- deliberately, for cases like
// the backup rotation keys where nothing reads-before-writing and there's
// no meaningful conflict to guard against.
router.post('/:key', async (req, res) => {
  const { key } = req.params;
  const { value, shared, expectedVersion } = req.body;
  if (typeof value !== 'string') return res.status(400).json({ error: 'value must be a string' });
  const isShared = !!shared;
  const ownerId = isShared ? null : req.userId;
  const versionCheck = (expectedVersion === undefined || expectedVersion === null) ? null : expectedVersion;

  try {
    let result;
    if (isShared) {
      result = await pool.query(
        `INSERT INTO kv_store (key, shared, owner_user_id, value, version, updated_at)
         VALUES ($1, true, NULL, $2, 1, now())
         ON CONFLICT (key) WHERE shared = true
         DO UPDATE SET value = EXCLUDED.value, version = kv_store.version + 1, updated_at = now()
         WHERE $3::int IS NULL OR kv_store.version = $3::int
         RETURNING version`,
        [key, value, versionCheck]
      );
    } else {
      result = await pool.query(
        `INSERT INTO kv_store (key, shared, owner_user_id, value, version, updated_at)
         VALUES ($1, false, $2, $3, 1, now())
         ON CONFLICT (key, owner_user_id) WHERE shared = false
         DO UPDATE SET value = EXCLUDED.value, version = kv_store.version + 1, updated_at = now()
         WHERE $4::int IS NULL OR kv_store.version = $4::int
         RETURNING version`,
        [key, ownerId, value, versionCheck]
      );
    }
    // A version check that didn't match means the row existed but its
    // version had already moved on -- the WHERE clause on DO UPDATE
    // blocked the write, and Postgres returns zero rows in that case
    // (distinct from a fresh insert, which always returns exactly one row).
    if (versionCheck !== null && !result.rows.length) {
      return res.status(409).json({ error: 'version conflict', key });
    }
    res.json({ key, value, shared: isShared, version: result.rows[0].version });
  } catch (e) {
    console.error('storage set failed', e);
    res.status(500).json({ error: 'storage set failed' });
  }
});

// DELETE /api/storage/:key?shared=true
router.delete('/:key', async (req, res) => {
  const { key } = req.params;
  const shared = req.query.shared === 'true';
  const ownerId = shared ? null : req.userId;

  try {
    await pool.query(
      'DELETE FROM kv_store WHERE key = $1 AND shared = $2 AND owner_user_id IS NOT DISTINCT FROM $3',
      [key, shared, ownerId]
    );
    res.json({ key, deleted: true, shared });
  } catch (e) {
    console.error('storage delete failed', e);
    res.status(500).json({ error: 'storage delete failed' });
  }
});

// GET /api/storage-list?prefix=photo:&shared=true
router.get('/', async (req, res) => {
  const prefix = req.query.prefix || '';
  const shared = req.query.shared === 'true';
  const ownerId = shared ? null : req.userId;

  try {
    const result = await pool.query(
      'SELECT key FROM kv_store WHERE key LIKE $1 AND shared = $2 AND owner_user_id IS NOT DISTINCT FROM $3',
      [prefix + '%', shared, ownerId]
    );
    res.json({ keys: result.rows.map(r => r.key), prefix, shared });
  } catch (e) {
    console.error('storage list failed', e);
    res.status(500).json({ error: 'storage list failed' });
  }
});

module.exports = router;
