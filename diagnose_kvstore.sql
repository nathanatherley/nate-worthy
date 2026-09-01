-- Diagnostic only -- read-only, changes nothing. Looking for where
-- imported seed data actually lives, since suggestions is empty but the
-- admin panel import definitely wrote it somewhere.

-- 1. List every key in kv_store, with how big each value is (so we can
--    spot the one holding a big blob of restaurant data at a glance).
SELECT key, shared, LENGTH(value) AS value_length
FROM kv_store
ORDER BY value_length DESC
LIMIT 30;

-- 2. How many keys are there total?
SELECT COUNT(*) AS total_keys FROM kv_store;
