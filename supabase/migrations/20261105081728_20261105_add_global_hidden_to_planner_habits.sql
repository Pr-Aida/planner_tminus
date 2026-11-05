/*
# Add global hidden flag to planner_habits

## Purpose
Habits could previously only be hidden per-day (via the
`habit_overrides.hidden` array stored in `planner_daily`), and once hidden
there was no UI to restore them. This migration adds a single, persistent
`hidden` column to `planner_habits` so visibility is a global, per-habit
property that syncs across devices and can be toggled back (unhidden) at any
time without losing history, progress, sort order, or settings.

## Changes
1. `planner_habits`
   - New column: `hidden boolean NOT NULL DEFAULT false`.
   - Existing rows default to `false` (visible), so no currently-visible habit
     disappears and no historical data is touched.

## Security
- RLS is already enabled on `planner_habits` with owner-scoped
  SELECT/INSERT/UPDATE/DELETE policies (`auth.uid() = user_id`). The new
  column is covered by the existing table-level UPDATE policy, so owners can
  toggle their own habits' visibility and no one else's.
- No new grants or policies are required.

## Notes
- This does NOT delete or alter the legacy per-day `habit_overrides.hidden`
  data in `planner_daily`; that column is left untouched. The app will use the
  new global `hidden` flag as the single source of truth for visibility.
- Habit history (`habit_values`), progress, sort order, unit, and name are all
  preserved — only visibility changes.
*/
ALTER TABLE planner_habits
  ADD COLUMN IF NOT EXISTS hidden boolean NOT NULL DEFAULT false;
