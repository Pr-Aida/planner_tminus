/*
# Add monthly reminders system

## Overview
Adds an owner-scoped `planner_reminders` table so users can attach
date-based reminders/events to specific days in the monthly calendar.
Each reminder stores a Gregorian ISO date_key (universal across both
calendar modes), a reminder offset, and a check-in status. This makes
reminders automatically appear on the correct equivalent date when the
user switches between Solar Hijri and Gregorian calendars.

## New Tables

### planner_reminders
- `id` uuid PK
- `user_id` uuid NOT NULL DEFAULT auth.uid() (FK auth.users ON DELETE CASCADE)
- `date_key` text NOT NULL — Gregorian ISO date e.g. "2026-07-15" (calendar-mode independent)
- `title` text NOT NULL — short event/reminder title
- `note` text — optional longer description
- `remind_offset` int NOT NULL DEFAULT 0 — days before the event to start reminding (7, 3, 1, or 0 for on-the-day)
- `status` text NOT NULL DEFAULT 'pending' — 'pending' | 'completed' | 'not_completed' | 'postponed' | 'cancelled'
- `created_at` timestamptz
- `updated_at` timestamptz

## Security
- RLS enabled; owner-scoped CRUD (auth.uid() = user_id).
- DEFAULT auth.uid() on user_id so client inserts without user_id succeed.
- UNIQUE (user_id, date_key, title) prevents exact duplicate reminders per day per user.

## Important Notes
1. date_key is always Gregorian ISO, so a reminder created in Shamsi mode
   is converted to its Gregorian equivalent before storage. When the user
   switches to Gregorian (or back to Shamsi), the reminder resolves to the
   same physical day in both views.
2. remind_offset lets the UI show upcoming reminders: 7 = 1 week before,
   3 = 3 days before, 1 = 1 day before, 0 = on the day.
3. status supports the check-in flow: on the event day the user is asked
   "Did you complete it?" and can mark completed / not completed /
   postponed / cancelled.
*/

CREATE TABLE IF NOT EXISTS planner_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  date_key text NOT NULL,
  title text NOT NULL,
  note text NOT NULL DEFAULT '',
  remind_offset int NOT NULL DEFAULT 0 CHECK (remind_offset IN (0, 1, 3, 7)),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','not_completed','postponed','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT planner_reminders_user_date_title UNIQUE (user_id, date_key, title)
);

ALTER TABLE planner_reminders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_reminders" ON planner_reminders;
CREATE POLICY "select_own_reminders" ON planner_reminders FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_reminders" ON planner_reminders;
CREATE POLICY "insert_own_reminders" ON planner_reminders FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_reminders" ON planner_reminders;
CREATE POLICY "update_own_reminders" ON planner_reminders FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_reminders" ON planner_reminders;
CREATE POLICY "delete_own_reminders" ON planner_reminders FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS planner_reminders_user_date_idx
  ON planner_reminders (user_id, date_key);

-- updated_at trigger
DROP FUNCTION IF EXISTS set_planner_reminders_updated_at();
CREATE OR REPLACE FUNCTION set_planner_reminders_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS planner_reminders_updated_at ON planner_reminders;
CREATE TRIGGER planner_reminders_updated_at
  BEFORE UPDATE ON planner_reminders
  FOR EACH ROW EXECUTE FUNCTION set_planner_reminders_updated_at();
