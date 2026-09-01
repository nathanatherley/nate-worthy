-- Fix: two more tagging problems, same pattern as the Sushi fix --
-- restaurants tagged with an overly broad umbrella cuisine when a more
-- specific sibling tag (already in MAJOR_CUISINES) is clearly more
-- accurate, judging by the restaurant's own name.
--
-- Fix 1: 24 restaurants with "pizza"/"pizzeria" literally in their name
-- (Una Pizza Napoletana, Tony's Pizza Napoletana, California Pizza
-- Kitchen, etc.), currently tagged "Italian" -- moved to "Pizza".
--
-- Fix 2: 10 restaurants with "burger"/"burgers" literally in their name
-- (Trill Burgers, Fancy Burger, Crown Burgers, etc.), currently tagged
-- "American" -- moved to "Burger".
--
-- Same target as the Sushi fix: kv_store.seed-picks-extra, the actual
-- JSON blob holding imported seed data (the suggestions table only holds
-- real user-submitted ratings). Same safety pattern too: each fix only
-- touches entries matching an exact (restaurant, city) pair from its own
-- specific list AND whose cuisine is currently exactly the expected
-- umbrella tag -- every other entry passes through completely unchanged.

BEGIN;

-- Preview: how many entries will each fix touch?
SELECT COUNT(*) AS pizza_entries_to_fix
FROM kv_store, jsonb_array_elements(value::jsonb) AS entry
WHERE key = 'seed-picks-extra' AND shared = true
  AND entry->>'cuisine' = 'Italian'
  AND (entry->>'restaurant', entry->>'city') IN (
    ('Una Pizza Napoletana', 'New York City'),
    ('Nonno''s Family Pizza Tavern', 'Houston'),
    ('Home Slice Pizza', 'Austin'),
    ('Pizza Savoy', 'Tokyo'),
    ('Il Vicino Pizzeria', 'Antalya'),
    ('Pizzeria da Baffetto', 'Rome'),
    ('Apizza Scholls', 'Portland'),
    ('Stretch Pizza', 'New York City'),
    ('Pizza Lila', 'Tel Aviv'),
    ('Pizza 4P''s', 'Ho Chi Minh City'),
    ('Tony''s Pizza Napoletana', 'San Francisco'),
    ('Andy''s Wood Fired Pizza', 'El Paso'),
    ('Deserto Pizzeria', 'El Paso'),
    ('Oakwood Pizza Box', 'Raleigh'),
    ('Zachary''s Chicago Pizza', 'Oakland'),
    ('The Positano Ristorante and Pizzeria', 'Annapolis'),
    ('Rendezvous Pizza', 'Oklahoma City'),
    ('Doppio Zero Pizzeria Napoletana', 'Mountain View'),
    ('Pizza Felix', 'Mexico City'),
    ('Pizzeria Nuovo Mondo', 'Rome'),
    ('Emma Pizzeria', 'Rome'),
    ('Dallas Pizza', 'Seoul'),
    ('California Pizza Kitchen', 'Long Beach'),
    ('Dolomiti Pizzeria & Enoteca', 'Omaha')
  );

SELECT COUNT(*) AS burger_entries_to_fix
FROM kv_store, jsonb_array_elements(value::jsonb) AS entry
WHERE key = 'seed-picks-extra' AND shared = true
  AND entry->>'cuisine' = 'American'
  AND (entry->>'restaurant', entry->>'city') IN (
    ('Fancy Burger', 'Provo'),
    ('Root''s Place Burgers & More', 'American Fork'),
    ('Rich''s Burgers-N-Grub', 'Kearns'),
    ('Crown Burgers Holladay', 'Holladay'),
    ('Stack 571 Burger and Whiskey', 'Herriman'),
    ('Burgertory', 'West Valley City'),
    ('Trill Burgers', 'Houston'),
    ('Mussel & Burger Bar', 'Louisville'),
    ('Goody Goody Burgers', 'Tampa'),
    ('Burger Goode', 'Bangkok')
  );

-- The actual fix -- both corrections applied in a single pass over the
-- array, so the blob only gets read and rewritten once rather than twice.
UPDATE kv_store
SET value = (
  SELECT jsonb_agg(
    CASE
      WHEN entry->>'cuisine' = 'Italian'
        AND (entry->>'restaurant', entry->>'city') IN (
    ('Una Pizza Napoletana', 'New York City'),
    ('Nonno''s Family Pizza Tavern', 'Houston'),
    ('Home Slice Pizza', 'Austin'),
    ('Pizza Savoy', 'Tokyo'),
    ('Il Vicino Pizzeria', 'Antalya'),
    ('Pizzeria da Baffetto', 'Rome'),
    ('Apizza Scholls', 'Portland'),
    ('Stretch Pizza', 'New York City'),
    ('Pizza Lila', 'Tel Aviv'),
    ('Pizza 4P''s', 'Ho Chi Minh City'),
    ('Tony''s Pizza Napoletana', 'San Francisco'),
    ('Andy''s Wood Fired Pizza', 'El Paso'),
    ('Deserto Pizzeria', 'El Paso'),
    ('Oakwood Pizza Box', 'Raleigh'),
    ('Zachary''s Chicago Pizza', 'Oakland'),
    ('The Positano Ristorante and Pizzeria', 'Annapolis'),
    ('Rendezvous Pizza', 'Oklahoma City'),
    ('Doppio Zero Pizzeria Napoletana', 'Mountain View'),
    ('Pizza Felix', 'Mexico City'),
    ('Pizzeria Nuovo Mondo', 'Rome'),
    ('Emma Pizzeria', 'Rome'),
    ('Dallas Pizza', 'Seoul'),
    ('California Pizza Kitchen', 'Long Beach'),
    ('Dolomiti Pizzeria & Enoteca', 'Omaha')
        )
      THEN jsonb_set(entry, '{cuisine}', '"Pizza"')
      WHEN entry->>'cuisine' = 'American'
        AND (entry->>'restaurant', entry->>'city') IN (
    ('Fancy Burger', 'Provo'),
    ('Root''s Place Burgers & More', 'American Fork'),
    ('Rich''s Burgers-N-Grub', 'Kearns'),
    ('Crown Burgers Holladay', 'Holladay'),
    ('Stack 571 Burger and Whiskey', 'Herriman'),
    ('Burgertory', 'West Valley City'),
    ('Trill Burgers', 'Houston'),
    ('Mussel & Burger Bar', 'Louisville'),
    ('Goody Goody Burgers', 'Tampa'),
    ('Burger Goode', 'Bangkok')
        )
      THEN jsonb_set(entry, '{cuisine}', '"Burger"')
      ELSE entry
    END
  )::text
  FROM jsonb_array_elements(value::jsonb) AS entry
),
updated_at = now()
WHERE key = 'seed-picks-extra' AND shared = true;

-- Confirm: totals after the fix (will include any that were already
-- correctly tagged before this ran, same as the Sushi fix's +3 offset).
SELECT COUNT(*) AS pizza_count_after_fix
FROM kv_store, jsonb_array_elements(value::jsonb) AS entry
WHERE key = 'seed-picks-extra' AND shared = true
  AND entry->>'cuisine' = 'Pizza';

SELECT COUNT(*) AS burger_count_after_fix
FROM kv_store, jsonb_array_elements(value::jsonb) AS entry
WHERE key = 'seed-picks-extra' AND shared = true
  AND entry->>'cuisine' = 'Burger';

COMMIT;
