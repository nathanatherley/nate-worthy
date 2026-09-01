-- Fix: 108 restaurants tagged "Japanese" that are actually sushi-focused
-- (Sushi Saito, Endo Sushi, Fuki Sushi, etc.), correctly re-tagged as
-- "Sushi". Targets kv_store.seed-picks-extra specifically -- this is
-- where imported seed data actually lives (a single JSON array stored as
-- text), NOT the suggestions table, which only holds real user-submitted
-- ratings. Excludes hybrid spots (steakhouse/hibachi/shabu-shabu places
-- that also happen to have a sushi bar) -- those stay "Japanese" since
-- that's the more accurate single tag for them.
--
-- Safe by construction: only touches entries matching an exact
-- (restaurant, city) pair from this specific list AND whose cuisine is
-- currently exactly "Japanese" -- every other entry in the blob passes
-- through completely unchanged. Uses jsonb_set to modify only the
-- "cuisine" field on a match, leaving id/note/cost/everything else
-- untouched.

BEGIN;

-- Step 1: preview exactly how many entries will change.
SELECT COUNT(*) AS entries_to_fix
FROM kv_store, jsonb_array_elements(value::jsonb) AS entry
WHERE key = 'seed-picks-extra' AND shared = true
  AND entry->>'cuisine' = 'Japanese'
  AND (entry->>'restaurant', entry->>'city') IN (
  ('Endo Sushi', 'Osaka'),
  ('Sushi Saito', 'Tokyo'),
  ('Jin Sho', 'Palo Alto'),
  ('Fuki Sushi', 'Palo Alto'),
  ('Yuki Yama Sushi', 'Park City'),
  ('Ohana', 'Ogden'),
  ('Sakura', 'St. George'),
  ('Tsunami Restaurant', 'South Jordan'),
  ('Happy Sumo', 'Provo'),
  ('Under Wraps', 'Springville'),
  ('Hama Sushi', 'Saratoga Springs'),
  ('Sakana Sushi Bar', 'West Jordan'),
  ('Chopfuku Sushi Bar and Asian Cuisine', 'West Jordan'),
  ('Toro Ramen and Sushi', 'Bluffdale'),
  ('Nikko Sushi & Ramen', 'Kaysville'),
  ('Ichiban', 'Draper'),
  ('Sushi Groove', 'Millcreek'),
  ('Sakura Sandy', 'Sandy'),
  ('Sukihana', 'South Jordan'),
  ('Uzu Revolving Sushi', 'Rockville'),
  ('Modan', 'Tysons Corner'),
  ('Perry''s', 'Washington'),
  ('Musashi''s', 'Bellevue'),
  ('Towa', 'Redmond'),
  ('Orenji Sushi & Noodles', 'Issaquah'),
  ('Casa Madai', 'Chicago'),
  ('Tuna Bar', 'Philadelphia'),
  ('Sukeban', 'San Antonio'),
  ('Neighborhood Sushi', 'Austin'),
  ('Lucky Robot', 'Austin'),
  ('NIJI Sushi Izakaya', 'Kuala Lumpur'),
  ('Sushi Zanmai', 'Kuala Lumpur'),
  ('Sushi Shin', 'Tokyo'),
  ('Toriton', 'Tokyo'),
  ('Jinsei', 'Osaka'),
  ('Okeya Kyujiro', 'Kyoto'),
  ('Azuma Sushi', 'Kyoto'),
  ('Ganko Sushi', 'Kyoto'),
  ('Ginza Katsukami', 'Tokyo'),
  ('Sushi Yuki', 'Tokyo'),
  ('Sushi Oya', 'Tokyo'),
  ('Sushi Tanaka', 'Tokyo'),
  ('Sushi Murakami Jiro', 'Osaka'),
  ('Sushiroku', 'Osaka'),
  ('Kikunoi Sushi Ao', 'Kyoto'),
  ('Kiyamachi Ran', 'Kyoto'),
  ('Masa', 'New York City'),
  ('Sushi Kaneyoshi', 'Los Angeles'),
  ('Soichi', 'San Diego'),
  ('Tatsu Dallas', 'Dallas'),
  ('Craft Omakase', 'Austin'),
  ('Sushi Shikon', 'Hong Kong'),
  ('Kanpai', 'Rockville'),
  ('Gyuzo Japanese BBQ', 'Rockville'),
  ('Omakase Yume', 'Chicago'),
  ('Sushi Kissho by Miyakawa', 'Macao'),
  ('Iva Gastro Bistro & Sushi', 'Antalya'),
  ('Sushi Masa', 'Kuala Lumpur'),
  ('Umegaoka Sushinomidori Sōhonten Shibuya', 'Tokyo'),
  ('Tsukiji Totodon Shibuya', 'Tokyo'),
  ('Ginza Sushiko', 'Tokyo'),
  ('Sushi Kanesaka', 'Tokyo'),
  ('Harutaka', 'Tokyo'),
  ('Sukiyabashi Jiro', 'Tokyo'),
  ('Jihei', 'Osaka'),
  ('Sushi Akira', 'Taipei'),
  ('Sushi Yoshitake', 'Tokyo'),
  ('Ebisu Gyoten Sushi', 'Tokyo'),
  ('Tanoshi', 'New York City'),
  ('Uchi', 'Denver'),
  ('Midori Sushi', 'Tokyo'),
  ('Manten Sushi', 'Tokyo'),
  ('Yorozu-Enraku', 'Kyoto'),
  ('Nick-San', 'Cabo San Lucas'),
  ('Sushi Luna', 'Cabo San Lucas'),
  ('Torio', 'Puerto Vallarta'),
  ('Sushi Masaki Saito', 'Toronto'),
  ('MSSM', 'Toronto'),
  ('Sushi Yugen', 'Toronto'),
  ('Sushi Nishinokaze', 'Montreal'),
  ('Noah', 'Punta Cana'),
  ('Moon Sushi', 'Tel Aviv'),
  ('Hibana by Koki', 'Hanoi'),
  ('Brothers Sushi', 'Los Angeles'),
  ('Yoichi', 'Fort Worth'),
  ('Hatsuyuki Handroll Bar', 'Fort Worth'),
  ('Haru Omakase', 'Columbus'),
  ('Do-Re-Mi', 'San Francisco'),
  ('Sushiitto', 'El Paso'),
  ('1033 Omakase', 'Milwaukee'),
  ('Kru', 'Sacramento'),
  ('Akoya Omakase', 'Kansas City'),
  ('The Cowfish Sushi Burger Bar', 'Raleigh'),
  ('Koji', 'Omaha'),
  ('Kinjo', 'Tampa'),
  ('Ro Sushi Co', 'Chevy Chase'),
  ('Sushiko', 'Chevy Chase'),
  ('Sharigato', 'Charlotte'),
  ('Hiyakawa', 'Miami'),
  ('Babychan', 'Nashville'),
  ('YUZU', 'Istanbul'),
  ('Taiko Sushi Minami', 'Osaka'),
  ('Sasaya', 'Berlin'),
  ('Shiori', 'Berlin'),
  ('Mirai Japanese Restaurant', 'Sydney'),
  ('Kanae Japanese Restaurant', 'Sydney'),
  ('Genki Izakaya', 'Fairfax'),
  ('Sushi Harutaka', 'Tokyo')
  );

-- Step 2: the actual fix -- rebuild the array, changing cuisine to
-- "Sushi" only for matching entries, leaving every other entry byte-for-
-- byte identical.
UPDATE kv_store
SET value = (
  SELECT jsonb_agg(
    CASE
      WHEN entry->>'cuisine' = 'Japanese'
        AND (entry->>'restaurant', entry->>'city') IN (
  ('Endo Sushi', 'Osaka'),
  ('Sushi Saito', 'Tokyo'),
  ('Jin Sho', 'Palo Alto'),
  ('Fuki Sushi', 'Palo Alto'),
  ('Yuki Yama Sushi', 'Park City'),
  ('Ohana', 'Ogden'),
  ('Sakura', 'St. George'),
  ('Tsunami Restaurant', 'South Jordan'),
  ('Happy Sumo', 'Provo'),
  ('Under Wraps', 'Springville'),
  ('Hama Sushi', 'Saratoga Springs'),
  ('Sakana Sushi Bar', 'West Jordan'),
  ('Chopfuku Sushi Bar and Asian Cuisine', 'West Jordan'),
  ('Toro Ramen and Sushi', 'Bluffdale'),
  ('Nikko Sushi & Ramen', 'Kaysville'),
  ('Ichiban', 'Draper'),
  ('Sushi Groove', 'Millcreek'),
  ('Sakura Sandy', 'Sandy'),
  ('Sukihana', 'South Jordan'),
  ('Uzu Revolving Sushi', 'Rockville'),
  ('Modan', 'Tysons Corner'),
  ('Perry''s', 'Washington'),
  ('Musashi''s', 'Bellevue'),
  ('Towa', 'Redmond'),
  ('Orenji Sushi & Noodles', 'Issaquah'),
  ('Casa Madai', 'Chicago'),
  ('Tuna Bar', 'Philadelphia'),
  ('Sukeban', 'San Antonio'),
  ('Neighborhood Sushi', 'Austin'),
  ('Lucky Robot', 'Austin'),
  ('NIJI Sushi Izakaya', 'Kuala Lumpur'),
  ('Sushi Zanmai', 'Kuala Lumpur'),
  ('Sushi Shin', 'Tokyo'),
  ('Toriton', 'Tokyo'),
  ('Jinsei', 'Osaka'),
  ('Okeya Kyujiro', 'Kyoto'),
  ('Azuma Sushi', 'Kyoto'),
  ('Ganko Sushi', 'Kyoto'),
  ('Ginza Katsukami', 'Tokyo'),
  ('Sushi Yuki', 'Tokyo'),
  ('Sushi Oya', 'Tokyo'),
  ('Sushi Tanaka', 'Tokyo'),
  ('Sushi Murakami Jiro', 'Osaka'),
  ('Sushiroku', 'Osaka'),
  ('Kikunoi Sushi Ao', 'Kyoto'),
  ('Kiyamachi Ran', 'Kyoto'),
  ('Masa', 'New York City'),
  ('Sushi Kaneyoshi', 'Los Angeles'),
  ('Soichi', 'San Diego'),
  ('Tatsu Dallas', 'Dallas'),
  ('Craft Omakase', 'Austin'),
  ('Sushi Shikon', 'Hong Kong'),
  ('Kanpai', 'Rockville'),
  ('Gyuzo Japanese BBQ', 'Rockville'),
  ('Omakase Yume', 'Chicago'),
  ('Sushi Kissho by Miyakawa', 'Macao'),
  ('Iva Gastro Bistro & Sushi', 'Antalya'),
  ('Sushi Masa', 'Kuala Lumpur'),
  ('Umegaoka Sushinomidori Sōhonten Shibuya', 'Tokyo'),
  ('Tsukiji Totodon Shibuya', 'Tokyo'),
  ('Ginza Sushiko', 'Tokyo'),
  ('Sushi Kanesaka', 'Tokyo'),
  ('Harutaka', 'Tokyo'),
  ('Sukiyabashi Jiro', 'Tokyo'),
  ('Jihei', 'Osaka'),
  ('Sushi Akira', 'Taipei'),
  ('Sushi Yoshitake', 'Tokyo'),
  ('Ebisu Gyoten Sushi', 'Tokyo'),
  ('Tanoshi', 'New York City'),
  ('Uchi', 'Denver'),
  ('Midori Sushi', 'Tokyo'),
  ('Manten Sushi', 'Tokyo'),
  ('Yorozu-Enraku', 'Kyoto'),
  ('Nick-San', 'Cabo San Lucas'),
  ('Sushi Luna', 'Cabo San Lucas'),
  ('Torio', 'Puerto Vallarta'),
  ('Sushi Masaki Saito', 'Toronto'),
  ('MSSM', 'Toronto'),
  ('Sushi Yugen', 'Toronto'),
  ('Sushi Nishinokaze', 'Montreal'),
  ('Noah', 'Punta Cana'),
  ('Moon Sushi', 'Tel Aviv'),
  ('Hibana by Koki', 'Hanoi'),
  ('Brothers Sushi', 'Los Angeles'),
  ('Yoichi', 'Fort Worth'),
  ('Hatsuyuki Handroll Bar', 'Fort Worth'),
  ('Haru Omakase', 'Columbus'),
  ('Do-Re-Mi', 'San Francisco'),
  ('Sushiitto', 'El Paso'),
  ('1033 Omakase', 'Milwaukee'),
  ('Kru', 'Sacramento'),
  ('Akoya Omakase', 'Kansas City'),
  ('The Cowfish Sushi Burger Bar', 'Raleigh'),
  ('Koji', 'Omaha'),
  ('Kinjo', 'Tampa'),
  ('Ro Sushi Co', 'Chevy Chase'),
  ('Sushiko', 'Chevy Chase'),
  ('Sharigato', 'Charlotte'),
  ('Hiyakawa', 'Miami'),
  ('Babychan', 'Nashville'),
  ('YUZU', 'Istanbul'),
  ('Taiko Sushi Minami', 'Osaka'),
  ('Sasaya', 'Berlin'),
  ('Shiori', 'Berlin'),
  ('Mirai Japanese Restaurant', 'Sydney'),
  ('Kanae Japanese Restaurant', 'Sydney'),
  ('Genki Izakaya', 'Fairfax'),
  ('Sushi Harutaka', 'Tokyo')
        )
      THEN jsonb_set(entry, '{cuisine}', '"Sushi"')
      ELSE entry
    END
  )::text
  FROM jsonb_array_elements(value::jsonb) AS entry
),
updated_at = now()
WHERE key = 'seed-picks-extra' AND shared = true;

-- Step 3: confirm -- should match (or be close to) the count from Step 1.
SELECT COUNT(*) AS sushi_count_after_fix
FROM kv_store, jsonb_array_elements(value::jsonb) AS entry
WHERE key = 'seed-picks-extra' AND shared = true
  AND entry->>'cuisine' = 'Sushi';

COMMIT;
