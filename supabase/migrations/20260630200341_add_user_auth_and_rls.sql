/*
# Add user authentication and owner-scoped RLS to all planner tables

## Overview
Migrates the planner from a single-tenant (anon) setup to a multi-user
authenticated setup. Each user can only read and write their own data.

## Changes Made

### planner_habits
- Added `user_id uuid NOT NULL DEFAULT auth.uid()` foreign key to auth.users
- Deleted seeded/anonymous rows (no user_id)
- Replaced anon CRUD policies with authenticated owner-scoped policies

### planner_daily
- Added `user_id uuid NOT NULL DEFAULT auth.uid()` foreign key to auth.users
- Deleted anonymous rows
- Changed UNIQUE constraint from `date_key` to `(user_id, date_key)`
- Replaced anon CRUD policies with authenticated owner-scoped policies

### planner_monthly_notes
- Added `user_id uuid NOT NULL DEFAULT auth.uid()` foreign key to auth.users
- Deleted anonymous rows
- Changed UNIQUE constraint from `month_key` to `(user_id, month_key)`
- Replaced anon CRUD policies with authenticated owner-scoped policies

## Security
- All tables now require an authenticated session (JWT with auth.uid())
- Users can only access rows they own (auth.uid() = user_id)
- The DEFAULT auth.uid() ensures inserts without explicit user_id work correctly
- Anon-key unauthenticated access is fully blocked

## Important Notes
1. Existing seeded/anonymous data is deleted in this migration.
2. The onConflict target for upserts must now use the composite keys.
3. Email confirmation should be enabled in the Supabase Auth settings for the
   email verification flow to work end-to-end.
*/

-- ─── planner_habits ──────────────────────────────────────────────────────────

ALTER TABLE planner_habits ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
DELETE FROM planner_habits WHERE user_id IS NULL;
ALTER TABLE planner_habits ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE planner_habits ALTER COLUMN user_id SET DEFAULT auth.uid();

DROP POLICY IF EXISTS "anon_select_habits" ON planner_habits;
DROP POLICY IF EXISTS "anon_insert_habits" ON planner_habits;
DROP POLICY IF EXISTS "anon_update_habits" ON planner_habits;
DROP POLICY IF EXISTS "anon_delete_habits" ON planner_habits;

DROP POLICY IF EXISTS "select_own_habits" ON planner_habits;
CREATE POLICY "select_own_habits" ON planner_habits FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_habits" ON planner_habits;
CREATE POLICY "insert_own_habits" ON planner_habits FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_habits" ON planner_habits;
CREATE POLICY "update_own_habits" ON planner_habits FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_habits" ON planner_habits;
CREATE POLICY "delete_own_habits" ON planner_habits FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ─── planner_daily ───────────────────────────────────────────────────────────

ALTER TABLE planner_daily ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
DELETE FROM planner_daily WHERE user_id IS NULL;
ALTER TABLE planner_daily ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE planner_daily ALTER COLUMN user_id SET DEFAULT auth.uid();

-- Replace single-column unique with composite unique
ALTER TABLE planner_daily DROP CONSTRAINT IF EXISTS planner_daily_date_key_key;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'planner_daily_user_date_key'
  ) THEN
    ALTER TABLE planner_daily ADD CONSTRAINT planner_daily_user_date_key UNIQUE (user_id, date_key);
  END IF;
END $$;

DROP POLICY IF EXISTS "anon_select_daily" ON planner_daily;
DROP POLICY IF EXISTS "anon_insert_daily" ON planner_daily;
DROP POLICY IF EXISTS "anon_update_daily" ON planner_daily;
DROP POLICY IF EXISTS "anon_delete_daily" ON planner_daily;

DROP POLICY IF EXISTS "select_own_daily" ON planner_daily;
CREATE POLICY "select_own_daily" ON planner_daily FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_daily" ON planner_daily;
CREATE POLICY "insert_own_daily" ON planner_daily FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_daily" ON planner_daily;
CREATE POLICY "update_own_daily" ON planner_daily FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_daily" ON planner_daily;
CREATE POLICY "delete_own_daily" ON planner_daily FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ─── planner_monthly_notes ───────────────────────────────────────────────────

ALTER TABLE planner_monthly_notes ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
DELETE FROM planner_monthly_notes WHERE user_id IS NULL;
ALTER TABLE planner_monthly_notes ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE planner_monthly_notes ALTER COLUMN user_id SET DEFAULT auth.uid();

ALTER TABLE planner_monthly_notes DROP CONSTRAINT IF EXISTS planner_monthly_notes_month_key_key;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'planner_monthly_notes_user_month_key'
  ) THEN
    ALTER TABLE planner_monthly_notes ADD CONSTRAINT planner_monthly_notes_user_month_key UNIQUE (user_id, month_key);
  END IF;
END $$;

DROP POLICY IF EXISTS "anon_select_monthly" ON planner_monthly_notes;
DROP POLICY IF EXISTS "anon_insert_monthly" ON planner_monthly_notes;
DROP POLICY IF EXISTS "anon_update_monthly" ON planner_monthly_notes;
DROP POLICY IF EXISTS "anon_delete_monthly" ON planner_monthly_notes;

DROP POLICY IF EXISTS "select_own_monthly" ON planner_monthly_notes;
CREATE POLICY "select_own_monthly" ON planner_monthly_notes FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_monthly" ON planner_monthly_notes;
CREATE POLICY "insert_own_monthly" ON planner_monthly_notes FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_monthly" ON planner_monthly_notes;
CREATE POLICY "update_own_monthly" ON planner_monthly_notes FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_monthly" ON planner_monthly_notes;
CREATE POLICY "delete_own_monthly" ON planner_monthly_notes FOR DELETE
  TO authenticated USING (auth.uid() = user_id);
