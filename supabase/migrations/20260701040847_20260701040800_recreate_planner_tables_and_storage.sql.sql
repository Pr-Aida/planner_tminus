/*
# Recreate planner tables (multi-user, owner-scoped) + storage bucket for avatars

## Overview
The earlier single-tenant planner tables were dropped when the project
database was reset. This migration recreates them fresh in the multi-user
(owner-scoped) shape required by the username-based auth system. It also
creates a public Storage bucket for user avatars.

## New Tables

### planner_habits
Per-user habit definitions.
- `id` uuid PK
- `user_id` uuid NOT NULL DEFAULT auth.uid() (FK auth.users ON DELETE CASCADE)
- `name` text
- `habit_type` text ('checkbox' | 'value')
- `unit` text (nullable) — unit label for value habits
- `sort_order` int
- `created_at` timestamptz

### planner_daily
Per-user per-day planner data keyed by Gregorian ISO date string.
- `id` uuid PK
- `user_id` uuid NOT NULL DEFAULT auth.uid()
- `date_key` text
- `top_note` text
- `habit_values` jsonb (habit_id -> boolean|number)
- `activities` jsonb (array of {id,name,from,to,note})
- `updated_at` timestamptz
- UNIQUE (user_id, date_key)

### planner_monthly_notes
Per-user notes keyed by string (month notes, weekly notes, day notes,
countdown config — all keyed by month_key convention).
- `id` uuid PK
- `user_id` uuid NOT NULL DEFAULT auth.uid()
- `month_key` text
- `note` text
- `updated_at` timestamptz
- UNIQUE (user_id, month_key)

## Security
- RLS enabled on all three tables; owner-scoped CRUD policies (auth.uid() = user_id).
- DEFAULT auth.uid() on user_id so client inserts without user_id succeed.

## Storage
- Creates public bucket `avatars` for profile avatars.
- Policies: anyone can read (avatars shown in UI); authenticated can upload/update/delete only objects in a folder named with their own user id.
*/
CREATE TABLE IF NOT EXISTS planner_habits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  habit_type text NOT NULL DEFAULT 'checkbox' CHECK (habit_type IN ('checkbox', 'value')),
  unit text,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE planner_habits ENABLE ROW LEVEL SECURITY;
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

CREATE TABLE IF NOT EXISTS planner_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  date_key text NOT NULL,
  top_note text NOT NULL DEFAULT '',
  habit_values jsonb NOT NULL DEFAULT '{}',
  activities jsonb NOT NULL DEFAULT '[]',
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT planner_daily_user_date_key UNIQUE (user_id, date_key)
);
ALTER TABLE planner_daily ENABLE ROW LEVEL SECURITY;
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

CREATE TABLE IF NOT EXISTS planner_monthly_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  month_key text NOT NULL,
  note text NOT NULL DEFAULT '',
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT planner_monthly_notes_user_month_key UNIQUE (user_id, month_key)
);
ALTER TABLE planner_monthly_notes ENABLE ROW LEVEL SECURITY;
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

-- ─── Storage bucket: avatars ──────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "avatars_public_read" ON storage.objects;
CREATE POLICY "avatars_public_read" ON storage.objects FOR SELECT
  TO public USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "avatars_owner_insert" ON storage.objects;
CREATE POLICY "avatars_owner_insert" ON storage.objects FOR INSERT
  TO authenticated WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "avatars_owner_update" ON storage.objects;
CREATE POLICY "avatars_owner_update" ON storage.objects FOR UPDATE
  TO authenticated USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  ) WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "avatars_owner_delete" ON storage.objects;
CREATE POLICY "avatars_owner_delete" ON storage.objects FOR DELETE
  TO authenticated USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
