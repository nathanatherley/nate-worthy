-- Diagnostic only -- read-only, changes nothing.

-- 1. Any other seed-related keys we might be missing?
SELECT key, shared, LENGTH(value) AS value_length
FROM kv_store
WHERE key ILIKE '%seed%'
ORDER BY value_length DESC;

-- 2. A peek at the actual JSON structure (first 1000 characters).
SELECT LEFT(value, 1000) AS sample
FROM kv_store
WHERE key = 'seed-picks-extra' AND shared = true;

-- 3. Sanity check: how many entries inside it are tagged "Japanese"?
--    (Confirms this is really the right blob before we touch anything.)
SELECT COUNT(*) AS japanese_count_in_blob
FROM kv_store, jsonb_array_elements(value::jsonb) AS entry
WHERE key = 'seed-picks-extra' AND shared = true
  AND entry->>'cuisine' = 'Japanese';
