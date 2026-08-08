-- Nate-Worthy production schema
-- Translates the existing artifact's JSON-blob data model into real tables,
-- plus a generic key-value table (kv_store) that backs a storage-compatible
-- API layer — this is what lets the existing frontend code keep calling
-- get/set/list/delete with almost no changes.

CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- for gen_random_uuid()

-- Real user accounts (this replaces "already signed into Claude" with
-- actual authentication).
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Magic-link login tokens (simple, no-password auth — a person requests a
-- link, clicks it, gets a session; nothing to remember or leak).
CREATE TABLE login_tokens (
  token UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Sessions (issued after a successful magic-link click).
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Cities
CREATE TABLE cities (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  lat DOUBLE PRECISION,
  lon DOUBLE PRECISION
);

-- Friends (the app's own profile concept — one per user, holds trust
-- ratings, admin permissions, cuisine expertise, etc., same shape as the
-- existing app's friend objects).
CREATE TABLE friends (
  id TEXT PRIMARY KEY,
  user_id UUID UNIQUE REFERENCES users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  first_name TEXT,
  middle_initial TEXT,
  last_name TEXT,
  phone TEXT,
  referred_by TEXT,
  trust_ratings JSONB NOT NULL DEFAULT '{}',
  unknown_marks JSONB NOT NULL DEFAULT '{}',
  cuisine_expertise JSONB NOT NULL DEFAULT '[]',
  admin_permissions JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Restaurant entries ("suggestions" in the existing app's naming).
CREATE TABLE suggestions (
  id TEXT PRIMARY KEY,
  city_id TEXT NOT NULL REFERENCES cities(id) ON DELETE CASCADE,
  friend_id TEXT NOT NULL REFERENCES friends(id) ON DELETE CASCADE,
  friend_name TEXT NOT NULL,
  restaurant TEXT NOT NULL,
  cuisine TEXT,
  note TEXT,
  rating_taste INTEGER NOT NULL DEFAULT 0,
  rating_ambiance INTEGER NOT NULL DEFAULT 0,
  cost INTEGER NOT NULL DEFAULT 0,
  canonical_id TEXT,
  ts BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_suggestions_city ON suggestions(city_id);
CREATE INDEX idx_suggestions_friend ON suggestions(friend_id);
CREATE INDEX idx_suggestions_canonical ON suggestions(canonical_id);

-- Photos — metadata lives here, actual image bytes live in object storage
-- (S3/R2), referenced by storage_key. This replaces the old approach of
-- cramming base64 image data directly into storage.
CREATE TABLE photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  suggestion_id TEXT NOT NULL REFERENCES suggestions(id) ON DELETE CASCADE,
  storage_key TEXT NOT NULL, -- e.g. "photos/<suggestion_id>/<uuid>.jpg"
  idx INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Generic key-value store — this is what backs the storage-compatibility
-- API (see src/routes/storage.js). Anything in the existing frontend that
-- isn't cleanly relational (analytics events, auto-backups, feedback,
-- app-wide settings like the app link) can keep using this exactly the way
-- it used window.storage, without needing its own dedicated table.
CREATE TABLE kv_store (
  key TEXT NOT NULL,
  shared BOOLEAN NOT NULL DEFAULT false,
  owner_user_id UUID REFERENCES users(id) ON DELETE CASCADE, -- null when shared
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (key, shared, owner_user_id)
);
CREATE INDEX idx_kv_shared_key ON kv_store(key) WHERE shared = true;
