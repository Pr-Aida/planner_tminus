/*
# Create Progress System (Study Projects, Resources, Activity Contributions)

1. Purpose
   Adds a new "Progress" feature to T Minus. Users can create study projects/subjects,
   add resources (pages, slides, videos, etc.) with total/completed counts, and link
   activities to projects/resources. Activity-linked progress is tracked via a
   contributions table to avoid double-counting on edits.

2. New Tables

   a) planner_progress_projects
      - id (uuid PK)
      - user_id (uuid, owner, defaults to auth.uid())
      - name (text, not null)
      - description (text, optional)
      - color (text, optional — hex or named color)
      - icon (text, optional — lucide icon name)
      - deadline_date (date, optional — exam/deadline)
      - target_study_minutes (int, optional — total target study time)
      - archived (boolean, default false)
      - sort_order (int, default 0)
      - created_at, updated_at (timestamptz)

   b) planner_progress_resources
      - id (uuid PK)
      - project_id (uuid FK -> planner_progress_projects, ON DELETE CASCADE)
      - user_id (uuid, owner, defaults to auth.uid())
      - name (text, not null)
      - unit (text, not null — e.g. 'slides', 'pages', 'videos', custom)
      - total (int, not null default 0)
      - completed (int, not null default 0)
      - stage (text, optional — 'learn' | 'practice' | 'review')
      - sort_order (int, default 0)
      - created_at, updated_at (timestamptz)

   c) planner_progress_contributions
      - id (uuid PK)
      - activity_id (text, not null — references the Activity.id from planner_daily.activities JSONB)
      - project_id (uuid FK -> planner_progress_projects, ON DELETE CASCADE)
      - resource_id (uuid FK -> planner_progress_resources, ON DELETE SET NULL)
      - user_id (uuid, owner, defaults to auth.uid())
      - units_added (int, not null default 0 — how many units this activity contributed)
      - date_key (text, not null — the date the activity belongs to)
      - duration_minutes (int, not null default 0 — activity duration at time of save)
      - created_at (timestamptz)
      - UNIQUE(activity_id, project_id, resource_id) — prevents duplicate contributions

3. Security
   - RLS enabled on all three tables.
   - Grants: SELECT, INSERT, UPDATE, DELETE to authenticated only (app requires sign-in).
   - 4 owner-scoped policies per table (select/insert/update/delete) using auth.uid() = user_id.
   - planner_progress_resources also checks ownership via user_id (not parent FK) for simplicity.
   - planner_progress_contributions scoped by user_id.

4. Indexes
   - planner_progress_projects(user_id) — list all projects for a user
   - planner_progress_resources(project_id) — list resources for a project
   - planner_progress_resources(user_id) — ownership checks
   - planner_progress_contributions(activity_id) — find contributions for an activity
   - planner_progress_contributions(project_id) — aggregate project study time
*/

-- ─── Projects ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS planner_progress_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  color text,
  icon text,
  deadline_date date,
  target_study_minutes int,
  archived boolean NOT NULL DEFAULT false,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE planner_progress_projects ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON planner_progress_projects TO authenticated;

DROP POLICY IF EXISTS "select_own_progress_projects" ON planner_progress_projects;
CREATE POLICY "select_own_progress_projects" ON planner_progress_projects FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_progress_projects" ON planner_progress_projects;
CREATE POLICY "insert_own_progress_projects" ON planner_progress_projects FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_progress_projects" ON planner_progress_projects;
CREATE POLICY "update_own_progress_projects" ON planner_progress_projects FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_progress_projects" ON planner_progress_projects;
CREATE POLICY "delete_own_progress_projects" ON planner_progress_projects FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_progress_projects_user ON planner_progress_projects(user_id);

-- ─── Resources ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS planner_progress_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES planner_progress_projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  unit text NOT NULL DEFAULT 'pages',
  total int NOT NULL DEFAULT 0 CHECK (total >= 0),
  completed int NOT NULL DEFAULT 0 CHECK (completed >= 0),
  stage text CHECK (stage IS NULL OR stage IN ('learn', 'practice', 'review')),
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE planner_progress_resources ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON planner_progress_resources TO authenticated;

DROP POLICY IF EXISTS "select_own_progress_resources" ON planner_progress_resources;
CREATE POLICY "select_own_progress_resources" ON planner_progress_resources FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_progress_resources" ON planner_progress_resources;
CREATE POLICY "insert_own_progress_resources" ON planner_progress_resources FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_progress_resources" ON planner_progress_resources;
CREATE POLICY "update_own_progress_resources" ON planner_progress_resources FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_progress_resources" ON planner_progress_resources;
CREATE POLICY "delete_own_progress_resources" ON planner_progress_resources FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_progress_resources_project ON planner_progress_resources(project_id);
CREATE INDEX IF NOT EXISTS idx_progress_resources_user ON planner_progress_resources(user_id);

-- ─── Contributions ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS planner_progress_contributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id text NOT NULL,
  project_id uuid NOT NULL REFERENCES planner_progress_projects(id) ON DELETE CASCADE,
  resource_id uuid REFERENCES planner_progress_resources(id) ON DELETE SET NULL,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  units_added int NOT NULL DEFAULT 0,
  date_key text NOT NULL,
  duration_minutes int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT progress_contributions_activity_project_resource_key UNIQUE (activity_id, project_id, resource_id)
);

ALTER TABLE planner_progress_contributions ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON planner_progress_contributions TO authenticated;

DROP POLICY IF EXISTS "select_own_progress_contributions" ON planner_progress_contributions;
CREATE POLICY "select_own_progress_contributions" ON planner_progress_contributions FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_progress_contributions" ON planner_progress_contributions;
CREATE POLICY "insert_own_progress_contributions" ON planner_progress_contributions FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_progress_contributions" ON planner_progress_contributions;
CREATE POLICY "update_own_progress_contributions" ON planner_progress_contributions FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_progress_contributions" ON planner_progress_contributions;
CREATE POLICY "delete_own_progress_contributions" ON planner_progress_contributions FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_progress_contributions_activity ON planner_progress_contributions(activity_id);
CREATE INDEX IF NOT EXISTS idx_progress_contributions_project ON planner_progress_contributions(project_id);
CREATE INDEX IF NOT EXISTS idx_progress_contributions_user ON planner_progress_contributions(user_id);
