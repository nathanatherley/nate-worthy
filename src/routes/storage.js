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
      'SELECT value FROM kv_store WHERE key = $1 AND shared = $2 AND owner_user_id IS NOT DISTINCT FROM $3',
      [key, shared, ownerId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'not found' });
    res.json({ key, value: result.rows[0].value, shared });
  } catch (e) {
    console.error('storage get failed', e);
    res.status(500).json({ error: 'storage get failed' });
  }
});

// POST /api/storage/:key   body: { value, shared }
router.post('/:key', async (req, res) => {
  const { key } = req.params;
  const { value, shared } = req.body;
  if (typeof value !== 'string') return res.status(400).json({ error: 'value must be a string' });
  const isShared = !!shared;
  const ownerId = isShared ? null : req.userId;

  try {
    if (isShared) {
      await pool.query(
        `INSERT INTO kv_store (key, shared, owner_user_id, value, updated_at)
         VALUES ($1, true, NULL, $2, now())
         ON CONFLICT (key) WHERE shared = true
         DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
        [key, value]
      );
    } else {
      await pool.query(
        `INSERT INTO kv_store (key, shared, owner_user_id, value, updated_at)
         VALUES ($1, false, $2, $3, now())
         ON CONFLICT (key, owner_user_id) WHERE shared = false
         DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
        [key, ownerId, value]
      );
    }
    res.json({ key, value, shared: isShared });
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
