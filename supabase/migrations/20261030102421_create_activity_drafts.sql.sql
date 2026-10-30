/*
# Create activity drafts (unfinished Manual Activity autosave)

1. New Tables
- `activity_drafts`
  - `id` (uuid, primary key)
  - `user_id` (uuid, owner, defaults to the signed-in user)
  - `date_key` (text, the planner day the draft belongs to)
  - `mode` (text, currently only 'manual')
  - `payload` (jsonb, the unfinished name, start time, end time and note)
  - `updated_at` (timestamptz)
  - One row per user + day + mode, so drafts never duplicate.

2. Security
- Enable RLS on `activity_drafts`.
- Grant SELECT, INSERT, UPDATE, DELETE to `authenticated` only (the app requires sign-in).
- Four owner-scoped policies: each user can only read and write their own drafts.

3. Notes
- Drafts are NOT completed activities. Completed activities still live in the daily planner.
- Saving or cancelling an activity removes the matching draft row.
*/

CREATE TABLE IF NOT EXISTS activity_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  date_key text NOT NULL,
  mode text NOT NULL DEFAULT 'manual' CHECK (mode IN ('manual')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT activity_drafts_user_date_mode_key UNIQUE (user_id, date_key, mode)
);

ALTER TABLE activity_drafts ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON activity_drafts TO authenticated;

DROP POLICY IF EXISTS "select_own_activity_drafts" ON activity_drafts;
CREATE POLICY "select_own_activity_drafts" ON activity_drafts FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_activity_drafts" ON activity_drafts;
CREATE POLICY "insert_own_activity_drafts" ON activity_drafts FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_activity_drafts" ON activity_drafts;
CREATE POLICY "update_own_activity_drafts" ON activity_drafts FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_activity_drafts" ON activity_drafts;
CREATE POLICY "delete_own_activity_drafts" ON activity_drafts FOR DELETE
  TO authenticated USING (auth.uid() = user_id);
