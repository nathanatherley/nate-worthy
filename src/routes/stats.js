// Item 8: shrinkage-to-population statistics.
//
// IMPORTANT ARCHITECTURE NOTE, confirmed by auditing the rest of this
// codebase before writing this file: the real, live app data (every
// friend, every rating) does NOT live in the normalized `friends` /
// `suggestions` tables schema.sql defines -- those are never written to
// anywhere in this backend. The actual source of truth is the single JSON
// blob stored in kv_store under the shared key 'scout-data', read and
// written by the frontend via the storage-compatibility API. So this
// route reads that blob directly and computes in plain JavaScript, rather
// than running SQL aggregate queries against tables that would silently
// return nothing.
//
// Two endpoints:
//   POST /api/stats/recompute        -- reads the blob, recomputes both
//                                        tables from scratch. Triggered
//                                        manually from the admin tab
//                                        rather than a real cron schedule
//                                        (see rationale in the admin UI
//                                        code) -- fine at this app's
//                                        current scale, where data changes
//                                        slowly enough that a scheduled
//                                        job would mostly just be running
//                                        against unchanged data anyway.
//   GET  /api/stats/cuisine-shrinkage -- returns the full computed tables.
//                                        Deliberately NOT scoped to "just
//                                        the calling user's own row" --
//                                        there's no reliable server-side
//                                        mapping from a logged-in session
//                                        to a specific friendId in this
//                                        app's identity model (friendId
//                                        lives entirely in client-managed
//                                        state, matched by phone/name, not
//                                        tied to the Postgres users table).
//                                        So the client fetches the whole
//                                        table and looks up its own
//                                        friendId locally, same pattern
//                                        already used everywhere else in
//                                        this app.
const express = require('express');
const pool = require('../db/pool');
const { requireAuth } = require('../auth/middleware');
const router = express.Router();
router.use(requireAuth);

// How many of a person's own ratings in a cuisine it takes before their
// own average starts to dominate over the population average. Lower =
// trusts personal data sooner (less shrinkage); higher = leans on the
// population average longer (more shrinkage). 4 means: with 4 of your own
// ratings in a cuisine, your own average and the population average count
// equally; well past that, it's mostly your own signal.
const SHRINKAGE_K = 4;

router.post('/recompute', async (req, res) => {
  try {
    const blobResult = await pool.query(
      "SELECT value FROM kv_store WHERE key = 'scout-data' AND shared = true"
    );
    if (!blobResult.rows.length) return res.status(404).json({ error: 'no app data found yet' });

    const state = JSON.parse(blobResult.rows[0].value);
    const suggestions = Array.isArray(state.suggestions) ? state.suggestions : [];

    // Population baseline per cuisine.
    const byCuisine = {};
    suggestions.forEach(s => {
      if (!s.cuisine || !(s.ratingTaste > 0)) return;
      const key = s.cuisine.trim().toLowerCase();
      if (!key) return;
      if (!byCuisine[key]) byCuisine[key] = { sum: 0, count: 0 };
      byCuisine[key].sum += s.ratingTaste;
      byCuisine[key].count += 1;
    });
    const baselineRows = Object.entries(byCuisine).map(([cuisine, { sum, count }]) => ({
      cuisine, avg: sum / count, count,
    }));

    // Per-person, per-cuisine: their own average, shrunk toward the
    // population baseline for that cuisine, weighted by their own sample
    // size (SHRINKAGE_K).
    const byPersonCuisine = {};
    suggestions.forEach(s => {
      if (!s.cuisine || !(s.ratingTaste > 0) || !s.friendId) return;
      const cuisine = s.cuisine.trim().toLowerCase();
      if (!cuisine) return;
      const key = s.friendId + '|' + cuisine;
      if (!byPersonCuisine[key]) byPersonCuisine[key] = { friendId: s.friendId, cuisine, sum: 0, count: 0 };
      byPersonCuisine[key].sum += s.ratingTaste;
      byPersonCuisine[key].count += 1;
    });
    const shrinkageRows = Object.values(byPersonCuisine).map(({ friendId, cuisine, sum, count }) => {
      const personAvg = sum / count;
      const populationAvg = byCuisine[cuisine] ? byCuisine[cuisine].sum / byCuisine[cuisine].count : personAvg;
      const shrunkScore = (count * personAvg + SHRINKAGE_K * populationAvg) / (count + SHRINKAGE_K);
      return { friendId, cuisine, ownAvg: personAvg, ownCount: count, shrunkScore };
    });

    // Small dataset at this app's current scale -- clear and reinsert
    // rather than diffing row by row, simplest way to stay correct.
    await pool.query('BEGIN');
    try {
      await pool.query('DELETE FROM population_cuisine_baselines');
      for (const row of baselineRows) {
        await pool.query(
          'INSERT INTO population_cuisine_baselines (cuisine, avg_rating, sample_count, updated_at) VALUES ($1, $2, $3, now())',
          [row.cuisine, row.avg, row.count]
        );
      }
      await pool.query('DELETE FROM person_cuisine_shrinkage');
      for (const row of shrinkageRows) {
        await pool.query(
          'INSERT INTO person_cuisine_shrinkage (friend_id, cuisine, own_avg, own_count, shrunk_score, updated_at) VALUES ($1, $2, $3, $4, $5, now())',
          [row.friendId, row.cuisine, row.ownAvg, row.ownCount, row.shrunkScore]
        );
      }
      await pool.query('COMMIT');
    } catch (e) {
      await pool.query('ROLLBACK');
      throw e;
    }

    res.json({ cuisines: baselineRows.length, personCuisinePairs: shrinkageRows.length });
  } catch (e) {
    console.error('stats recompute failed', e);
    res.status(500).json({ error: 'recompute failed' });
  }
});

router.get('/cuisine-shrinkage', async (req, res) => {
  try {
    const baselines = await pool.query(
      'SELECT cuisine, avg_rating, sample_count, updated_at FROM population_cuisine_baselines'
    );
    const shrinkage = await pool.query(
      'SELECT friend_id, cuisine, shrunk_score, own_count FROM person_cuisine_shrinkage'
    );
    res.json({
      populationBaselines: baselines.rows,
      personShrinkage: shrinkage.rows,
      updatedAt: baselines.rows.length ? baselines.rows[0].updated_at : null,
    });
  } catch (e) {
    console.error('stats fetch failed', e);
    res.status(500).json({ error: 'stats fetch failed' });
  }
});

module.exports = router;
