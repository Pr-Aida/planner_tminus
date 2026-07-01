/*
# Add per-day habit overrides column

## Overview
Adds a `habit_overrides` JSONB column to `planner_daily` so users can
customise which habits show on a specific day without changing their
default daily habit template. This keeps the template (planner_habits)
stable for every day, while allowing per-day edits like hiding a habit
or adding a one-off extra habit just for that day.

## Modified Tables

### planner_daily
- NEW COLUMN `habit_overrides` jsonb NOT NULL DEFAULT '{}'::jsonb
  Shape: { hidden: string[] (template habit ids to hide for this day),
           extras: TempHabit[] (one-off habits added just for this day) }
  TempHabit = { id: string, name: string, habit_type: 'checkbox'|'value', unit: string|null }
  This is purely additive — no existing data is touched. All existing
  rows get the default empty object.

## Security
- No policy changes. planner_daily already has owner-scoped RLS; the new
  column inherits the same policies automatically.

## Important Notes
1. The default daily habit template still lives in planner_habits —
   habit_overrides is only the per-day delta on top of the template.
2. habit_values (checkboxes / time entries) still references habit ids
   in the usual way — both template habit ids and temp extra habit ids.
3. This migration is idempotent (uses IF NOT EXISTS).
*/

ALTER TABLE planner_daily
  ADD COLUMN IF NOT EXISTS habit_overrides jsonb NOT NULL DEFAULT '{}'::jsonb;
