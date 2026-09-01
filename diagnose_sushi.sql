-- Diagnostic only -- these SELECT queries don't change anything, just
-- show us what's actually in the live database so we can figure out why
-- the fix script matched zero rows.

-- 1. Are there ANY rows tagged "Japanese" at all?
SELECT COUNT(*) AS japanese_count FROM suggestions WHERE cuisine = 'Japanese';

-- 2. What do a handful of them actually look like? (restaurant name spelling,
--    exact cuisine value, city_id)
SELECT restaurant, cuisine, city_id FROM suggestions WHERE cuisine = 'Japanese' LIMIT 10;

-- 3. How many total entries exist in the table at all? (sanity check that
--    the seed data landed here in the first place)
SELECT COUNT(*) AS total_entries FROM suggestions;

-- 4. What do city names actually look like in the cities table? (checking
--    for formatting differences -- e.g. "St. George" vs "Saint George")
SELECT id, name FROM cities ORDER BY name LIMIT 20;
