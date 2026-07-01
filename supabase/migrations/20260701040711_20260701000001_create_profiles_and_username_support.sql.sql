/*
# Add user profiles, unique usernames, and helper functions for username auth

## Overview
Migrates the planner from email-based auth to username-based auth. Adds a
`profiles` table linked 1:1 to Supabase auth users that stores a unique,
case-insensitive username, profile fields, and planner preferences. Adds
database helper functions so the frontend (anon-key) can check username
availability safely and so an edge function can look up a recovery email
for password reset emails.

## New Tables

### profiles (1:1 with auth.users)
- `id` (uuid, PK, FK to auth.users, ON DELETE CASCADE)
- `username` (text, NOT NULL) — case-sensitive display form
- `username_lower` (text, NOT NULL, UNIQUE) — lowercased for case-insensitive uniqueness
- `display_name` (text) — friendly name shown in UI
- `bio` (text) — short personal note
- `avatar_url` (text) — URL to avatar image (object URL or remote)
- `recovery_email` (text, nullable) — optional email used ONLY for password recovery; not used for login
- `calendar_pref` (text, default 'shamsi') — 'shamsi' | 'gregorian'
- `timezone_pref` (text, default 'UTC')
- `onboarding_completed` (boolean, default false) — whether the guided tour has been seen
- `created_at`, `updated_at` (timestamptz)

## New Functions

### is_username_taken(p_username text) RETURNS boolean
Returns true if a profile with the lowercased username already exists.
Safe to call as anon/anon+authenticated (read-only check used by signup).

## Security
- RLS enabled on profiles.
- SELECT: authenticated users can read their own profile (the signup flow
  does NOT read profiles; it uses the is_username_taken RPC instead).
- INSERT/UPDATE/DELETE: owner only (auth.uid() = id).
- The `username_lower` UNIQUE constraint guarantees no two users share a
  username regardless of case.

## Important Notes
1. Usernames are enforced case-insensitively via the lowercased unique column.
2. The frontend validates allowed characters ([A-Za-z0-9_.], no spaces) before signup.
3. Passwords remain managed by Supabase Auth and are securely hashed there;
   no plain-text or custom password storage is introduced.
4. recovery_email is optional and used only to send password-reset emails via
   the edge function; it is never used as a login identifier.
*/

CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text NOT NULL,
  username_lower text GENERATED ALWAYS AS (lower(username)) STORED,
  display_name text NOT NULL DEFAULT '',
  bio text NOT NULL DEFAULT '',
  avatar_url text,
  recovery_email text,
  calendar_pref text NOT NULL DEFAULT 'shamsi' CHECK (calendar_pref IN ('shamsi','gregorian')),
  timezone_pref text NOT NULL DEFAULT 'UTC',
  onboarding_completed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT profiles_username_lower_key UNIQUE (username_lower)
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_profile" ON profiles;
CREATE POLICY "select_own_profile" ON profiles FOR SELECT
  TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "insert_own_profile" ON profiles;
CREATE POLICY "insert_own_profile" ON profiles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "update_own_profile" ON profiles;
CREATE POLICY "update_own_profile" ON profiles FOR UPDATE
  TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "delete_own_profile" ON profiles;
CREATE POLICY "delete_own_profile" ON profiles FOR DELETE
  TO authenticated USING (auth.uid() = id);

-- Index for lookups by lowercased username (used internally / edge fn)
CREATE INDEX IF NOT EXISTS profiles_username_lower_idx ON profiles (username_lower);

-- ─── Helper: is_username_taken ─────────────────────────────────────────────
-- Read-only availability check callable by anon + authenticated (signup flow).
-- SECURITY DEFINER so anon can read existence without exposing the table.
DROP FUNCTION IF EXISTS is_username_taken(p_username text);
CREATE OR REPLACE FUNCTION is_username_taken(p_username text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE username_lower = lower(p_username)
  );
$$;

GRANT EXECUTE ON FUNCTION is_username_taken(text) TO anon, authenticated;

-- ─── Helper: updated_at trigger ─────────────────────────────────────────────
DROP FUNCTION IF EXISTS set_profiles_updated_at();
CREATE OR REPLACE FUNCTION set_profiles_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_updated_at ON profiles;
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION set_profiles_updated_at();
