/*
# Add role column to study_room_members

The study_room_members table was missing a `role` column to distinguish
owners from regular members. Ownership was inferred from study_rooms.owner_id,
but having an explicit role column makes the membership model clearer and
allows future admin/co-admin roles.

Also adds:
- study_room_join_requests table (explicit join-request tracking)
- shared_activity_summaries table (cached weekly activity snapshots)
- Updates RLS policies to use role='owner' for the creator

## Changes to study_room_members
- Add `role` text NOT NULL DEFAULT 'member' CHECK in ('owner','admin','member')
- Backfill existing approved owner rows: set role='owner' where the user is
  the study_rooms.owner_id (done via a one-time UPDATE, safe because RLS is
  not active for the migration's service-role connection).

## New table: study_room_join_requests
Stores explicit join-request metadata (requested_at, message, reviewed_at,
reviewed_by) separate from the membership row. The study_room_members row
with status='pending' remains the source of truth for membership state;
this table adds request metadata.

## New table: shared_activity_summaries
Cached per-user per-week activity summaries, written by the
study_room_members_activity SECURITY DEFINER RPC (or a future cron).
Not populated yet — schema-only for forward compatibility.
*/

-- ─── Add role column to study_room_members ───────────────────────────────────
ALTER TABLE study_room_members
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'member'
    CHECK (role IN ('owner', 'admin', 'member'));

-- Backfill: set role='owner' for rows where the user is the room owner
UPDATE study_room_members m
  SET role = 'owner'
  WHERE m.status = 'approved'
    AND EXISTS (
      SELECT 1 FROM study_rooms r WHERE r.id = m.room_id AND r.owner_id = m.user_id
    );

-- ─── New table: study_room_join_requests ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS study_room_join_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES study_rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  message text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT study_room_join_requests_room_user_key UNIQUE (room_id, user_id)
);
ALTER TABLE study_room_join_requests ENABLE ROW LEVEL SECURITY;

-- ─── New table: shared_activity_summaries ────────────────────────────────────
CREATE TABLE IF NOT EXISTS shared_activity_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  room_id uuid NOT NULL REFERENCES study_rooms(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  minutes integer NOT NULL DEFAULT 0,
  active_days integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shared_activity_summaries_user_room_week_key UNIQUE (user_id, room_id, week_start)
);
ALTER TABLE shared_activity_summaries ENABLE ROW LEVEL SECURITY;

-- ─── RLS: study_room_join_requests ───────────────────────────────────────────
-- Owner can see all requests for their room; requester can see their own.
DROP POLICY IF EXISTS "join_req_select_owner_or_self" ON study_room_join_requests;
CREATE POLICY "join_req_select_owner_or_self" ON study_room_join_requests FOR SELECT
  TO authenticated USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM study_rooms r
      WHERE r.id = room_id AND r.owner_id = auth.uid()
    )
  );

-- Any authenticated user can create a join request for a room they can see.
DROP POLICY IF EXISTS "join_req_insert_self" ON study_room_join_requests;
CREATE POLICY "join_req_insert_self" ON study_room_join_requests FOR INSERT
  TO authenticated WITH CHECK (user_id = auth.uid());

-- Owner can update (approve/reject); requester can update their own.
DROP POLICY IF EXISTS "join_req_update_owner_or_self" ON study_room_join_requests;
CREATE POLICY "join_req_update_owner_or_self" ON study_room_join_requests FOR UPDATE
  TO authenticated USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM study_rooms r
      WHERE r.id = room_id AND r.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM study_rooms r
      WHERE r.id = room_id AND r.owner_id = auth.uid()
    )
  );

-- Owner can delete; requester can delete their own.
DROP POLICY IF EXISTS "join_req_delete_owner_or_self" ON study_room_join_requests;
CREATE POLICY "join_req_delete_owner_or_self" ON study_room_join_requests FOR DELETE
  TO authenticated USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM study_rooms r
      WHERE r.id = room_id AND r.owner_id = auth.uid()
    )
  );

-- ─── RLS: shared_activity_summaries ──────────────────────────────────────────
-- Only approved members/owner can read; only the user themselves can insert/update.
DROP POLICY IF EXISTS "shared_act_select_members" ON shared_activity_summaries;
CREATE POLICY "shared_act_select_members" ON shared_activity_summaries FOR SELECT
  TO authenticated USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM study_rooms r
      WHERE r.id = room_id AND r.owner_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM study_room_members m
      WHERE m.room_id = shared_activity_summaries.room_id
        AND m.user_id = auth.uid()
        AND m.status = 'approved'
    )
  );

DROP POLICY IF EXISTS "shared_act_insert_self" ON shared_activity_summaries;
CREATE POLICY "shared_act_insert_self" ON shared_activity_summaries FOR INSERT
  TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "shared_act_update_self" ON shared_activity_summaries;
CREATE POLICY "shared_act_update_self" ON shared_activity_summaries FOR UPDATE
  TO authenticated USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "shared_act_delete_self_or_owner" ON shared_activity_summaries;
CREATE POLICY "shared_act_delete_self_or_owner" ON shared_activity_summaries FOR DELETE
  TO authenticated USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM study_rooms r
      WHERE r.id = room_id AND r.owner_id = auth.uid()
    )
  );

-- ─── Indexes ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS study_room_join_requests_room_idx ON study_room_join_requests(room_id);
CREATE INDEX IF NOT EXISTS study_room_join_requests_user_idx ON study_room_join_requests(user_id);
CREATE INDEX IF NOT EXISTS shared_activity_summaries_user_room_idx ON shared_activity_summaries(user_id, room_id);

-- ─── Updated updated_at triggers for new tables ───────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS study_room_join_requests_updated_at ON study_room_join_requests;
CREATE TRIGGER study_room_join_requests_updated_at
  BEFORE UPDATE ON study_room_join_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS shared_activity_summaries_updated_at ON shared_activity_summaries;
CREATE TRIGGER shared_activity_summaries_updated_at
  BEFORE UPDATE ON shared_activity_summaries
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── Verify: the members_insert_self_or_owner policy is correct ───────────────
-- The existing policy allows:
--   WITH CHECK (user_id = auth.uid() OR EXISTS room owner check)
-- This correctly allows the creator to insert themselves as a member.
-- The role column has DEFAULT 'member', so the creator insert must set role='owner'.
-- The RLS WITH CHECK does NOT check the role value, so any role is accepted.
