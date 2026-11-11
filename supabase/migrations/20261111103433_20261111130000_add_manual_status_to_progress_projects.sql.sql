/*
# Add manual status column to planner_progress_projects

1. Changes
- Adds `status` text column to `planner_progress_projects`.
- Default value: `'in_progress'`.
- Allowed values: 'not_started', 'in_progress', 'completed', 'on_hold', 'archived'.
- Adds a CHECK constraint to enforce allowed values.
- Backfills existing rows: rows with `archived = true` get `status = 'archived'`.

2. Security
- No changes to RLS policies or grants. The existing owner-scoped CRUD policies
  on `planner_progress_projects` already cover the new column via the existing
  UPDATE grant.
*/

ALTER TABLE planner_progress_projects
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'in_progress';

-- Backfill: mark already-archived projects as 'archived'
UPDATE planner_progress_projects SET status = 'archived' WHERE archived = true AND status = 'in_progress';

-- Add CHECK constraint (drop first for idempotency)
ALTER TABLE planner_progress_projects DROP CONSTRAINT IF EXISTS valid_progress_status;
ALTER TABLE planner_progress_projects
  ADD CONSTRAINT valid_progress_status
  CHECK (status IN ('not_started', 'in_progress', 'completed', 'on_hold', 'archived'));
