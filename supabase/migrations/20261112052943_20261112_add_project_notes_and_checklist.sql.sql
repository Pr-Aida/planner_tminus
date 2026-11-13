/*
# Add Project Notes and Checklist to Progress System

## Purpose
Adds per-project Notes (a text field on the project) and a Checklist system
(binary tasks with optional one-level subtasks) to the Progress module.

## Changes

### 1. planner_progress_projects — new column
- `notes` (text, nullable): free-form multi-line notes for the project.
  Scoped to the project row, so RLS on the projects table already protects it.
  Supports Persian/English mixed text.

### 2. planner_progress_checklist_items — new table
- `id` uuid PK
- `project_id` uuid NOT NULL REFERENCES planner_progress_projects(id) ON DELETE CASCADE
- `user_id` uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE
- `parent_id` uuid nullable REFERENCES planner_progress_checklist_items(id) ON DELETE CASCADE
  (null = top-level task; non-null = subtask of that parent; one level only)
- `title` text NOT NULL
- `completed` boolean NOT NULL DEFAULT false
- `sort_order` integer NOT NULL DEFAULT 0
- `created_at` timestamptz DEFAULT now()
- `updated_at` timestamptz DEFAULT now()

### 3. Security
- RLS enabled on planner_progress_checklist_items.
- GRANT SELECT, INSERT, UPDATE, DELETE TO authenticated.
- 4 owner-scoped policies using auth.uid() = user_id.
- Existing projects table policies already cover the new `notes` column.
- Index on (project_id, sort_order) for efficient per-project queries.
*/

-- ─── Add notes column to projects ────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'planner_progress_projects' AND column_name = 'notes'
  ) THEN
    ALTER TABLE planner_progress_projects ADD COLUMN notes text;
  END IF;
END $$;

-- ─── Create checklist items table ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS planner_progress_checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES planner_progress_projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES planner_progress_checklist_items(id) ON DELETE CASCADE,
  title text NOT NULL,
  completed boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE planner_progress_checklist_items ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_checklist_project_sort
  ON planner_progress_checklist_items (project_id, sort_order);

-- Grant only to authenticated (app has sign-in)
GRANT SELECT, INSERT, UPDATE, DELETE ON planner_progress_checklist_items TO authenticated;

-- ─── RLS Policies ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "select_own_checklist" ON planner_progress_checklist_items;
CREATE POLICY "select_own_checklist" ON planner_progress_checklist_items
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_checklist" ON planner_progress_checklist_items;
CREATE POLICY "insert_own_checklist" ON planner_progress_checklist_items
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_checklist" ON planner_progress_checklist_items;
CREATE POLICY "update_own_checklist" ON planner_progress_checklist_items
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_checklist" ON planner_progress_checklist_items;
CREATE POLICY "delete_own_checklist" ON planner_progress_checklist_items
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
