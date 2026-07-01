/*
# Create Planner Tables (single-tenant, no auth)

## Overview
Creates tables to support a dual-calendar personal planner (Solar Hijri + Gregorian).
No authentication required — data is shared/public (single-user app with anon key access).

## New Tables

### planner_habits
Global habit definitions created by the user.
- `id` (uuid, primary key)
- `name` (text) — habit display name e.g. "Violin Practice"
- `habit_type` (text) — either 'checkbox' or 'value'
- `unit` (text, nullable) — unit label for 'value' type habits e.g. "min", "pages"
- `sort_order` (int) — display ordering
- `created_at` (timestamp)

### planner_daily
Per-day planner data keyed by Gregorian ISO date string (universal across both calendars).
- `id` (uuid, primary key)
- `date_key` (text, unique) — Gregorian date e.g. "2026-06-28"
- `top_note` (text) — quick notes for the day
- `habit_values` (jsonb) — map of habit_id → boolean|number
- `activities` (jsonb) — array of {name, from, to, note}
- `updated_at` (timestamp)

### planner_monthly_notes
Per-month notes keyed by a string like "sh-1405-6" or "gr-2026-6".
- `id` (uuid, primary key)
- `month_key` (text, unique)
- `note` (text)

## Security
- RLS enabled on all tables
- All policies grant anon + authenticated full CRUD (intentionally public single-tenant app)
*/

-- Habit definitions
CREATE TABLE IF NOT EXISTS planner_habits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  habit_type text NOT NULL DEFAULT 'checkbox' CHECK (habit_type IN ('checkbox', 'value')),
  unit text,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE planner_habits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_habits" ON planner_habits;
CREATE POLICY "anon_select_habits" ON planner_habits FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_habits" ON planner_habits;
CREATE POLICY "anon_insert_habits" ON planner_habits FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_habits" ON planner_habits;
CREATE POLICY "anon_update_habits" ON planner_habits FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_habits" ON planner_habits;
CREATE POLICY "anon_delete_habits" ON planner_habits FOR DELETE TO anon, authenticated USING (true);

-- Daily planner data
CREATE TABLE IF NOT EXISTS planner_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date_key text NOT NULL UNIQUE,
  top_note text NOT NULL DEFAULT '',
  habit_values jsonb NOT NULL DEFAULT '{}',
  activities jsonb NOT NULL DEFAULT '[]',
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE planner_daily ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_daily" ON planner_daily;
CREATE POLICY "anon_select_daily" ON planner_daily FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_daily" ON planner_daily;
CREATE POLICY "anon_insert_daily" ON planner_daily FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_daily" ON planner_daily;
CREATE POLICY "anon_update_daily" ON planner_daily FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_daily" ON planner_daily;
CREATE POLICY "anon_delete_daily" ON planner_daily FOR DELETE TO anon, authenticated USING (true);

-- Monthly notes
CREATE TABLE IF NOT EXISTS planner_monthly_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month_key text NOT NULL UNIQUE,
  note text NOT NULL DEFAULT '',
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE planner_monthly_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_monthly" ON planner_monthly_notes;
CREATE POLICY "anon_select_monthly" ON planner_monthly_notes FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_monthly" ON planner_monthly_notes;
CREATE POLICY "anon_insert_monthly" ON planner_monthly_notes FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_monthly" ON planner_monthly_notes;
CREATE POLICY "anon_update_monthly" ON planner_monthly_notes FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_monthly" ON planner_monthly_notes;
CREATE POLICY "anon_delete_monthly" ON planner_monthly_notes FOR DELETE TO anon, authenticated USING (true);

-- Seed default habits
INSERT INTO planner_habits (name, habit_type, unit, sort_order)
VALUES
  ('Take Medication', 'checkbox', null, 0),
  ('Workout', 'checkbox', null, 1),
  ('Violin Practice', 'value', 'min', 2)
ON CONFLICT DO NOTHING;
