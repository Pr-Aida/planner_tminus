/*
# Fix infinite recursion in study_room RLS policies

## Root cause
The RLS policy `members_select_visible` on `study_room_members` queried
`study_room_members` itself (aliased as m2) — direct self-recursion.
Additionally, `rooms_select_visible` on `study_rooms` queried
`study_room_members`, and `members_select_visible` queried `study_rooms` —
mutual recursion. PostgreSQL detects this as "infinite recursion detected
in policy for relation study_room_members".

## Fix
Create SECURITY DEFINER helper functions that check room ownership and
membership WITHOUT being subject to RLS. These functions run with definer
(owner) privileges, so they bypass RLS on the tables they query. All
policies that previously had inline EXISTS subqueries now call these
functions instead, breaking the recursive cycle.

## Helper functions
- `is_room_owner(p_room_id, p_user_id)` — true if user owns the room
- `is_room_member(p_room_id, p_user_id, p_statuses text[])` — true if user
  has a membership row with one of the given statuses
- `is_approved_member_or_owner(p_room_id, p_user_id)` — convenience: true
  if user is an approved member OR the room owner

All functions are SECURITY DEFINER, run with search_path = public, pg_temp,
and are granted EXECUTE to authenticated.
*/

-- ─── Helper functions (SECURITY DEFINER — bypass RLS) ─────────────────────────

CREATE OR REPLACE FUNCTION is_room_owner(p_room_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM study_rooms r
    WHERE r.id = p_room_id AND r.owner_id = p_user_id
  );
$$;

CREATE OR REPLACE FUNCTION is_room_member(
  p_room_id uuid,
  p_user_id uuid,
  p_statuses text[] DEFAULT ARRAY['approved']::text[]
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM study_room_members m
    WHERE m.room_id = p_room_id
      AND m.user_id = p_user_id
      AND m.status = ANY(p_statuses)
  );
$$;

CREATE OR REPLACE FUNCTION is_approved_member_or_owner(p_room_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT is_room_owner(p_room_id, p_user_id)
      OR is_room_member(p_room_id, p_user_id, ARRAY['approved']::text[]);
$$;

GRANT EXECUTE ON FUNCTION is_room_owner(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION is_room_member(uuid, uuid, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION is_approved_member_or_owner(uuid, uuid) TO authenticated;

-- ─── Rewrite: study_rooms SELECT (was querying study_room_members) ────────────
DROP POLICY IF EXISTS "rooms_select_visible" ON study_rooms;
CREATE POLICY "rooms_select_visible" ON study_rooms FOR SELECT
  TO authenticated USING (
    owner_id = auth.uid()
    OR is_room_member(id, auth.uid(), ARRAY['pending','invited','approved']::text[])
  );

-- rooms_insert_owner, rooms_update_owner, rooms_delete_owner are fine (no recursion)
-- but re-create them cleanly to be safe.
DROP POLICY IF EXISTS "rooms_insert_owner" ON study_rooms;
CREATE POLICY "rooms_insert_owner" ON study_rooms FOR INSERT
  TO authenticated WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "rooms_update_owner" ON study_rooms;
CREATE POLICY "rooms_update_owner" ON study_rooms FOR UPDATE
  TO authenticated USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "rooms_delete_owner" ON study_rooms;
CREATE POLICY "rooms_delete_owner" ON study_rooms FOR DELETE
  TO authenticated USING (owner_id = auth.uid());

-- ─── Rewrite: study_room_members (was self-recursive) ─────────────────────────
-- SELECT: user can see their own rows, OR the room owner can see all members,
-- OR an approved member can see other members. No self-queries on study_room_members.
DROP POLICY IF EXISTS "members_select_visible" ON study_room_members;
CREATE POLICY "members_select_visible" ON study_room_members FOR SELECT
  TO authenticated USING (
    user_id = auth.uid()
    OR is_room_owner(room_id, auth.uid())
    OR is_room_member(room_id, auth.uid(), ARRAY['approved']::text[])
  );

-- INSERT: user can insert their own row (join request), OR the room owner
-- can insert members (inviting someone). No self-queries.
DROP POLICY IF EXISTS "members_insert_self_or_owner" ON study_room_members;
CREATE POLICY "members_insert_self_or_owner" ON study_room_members FOR INSERT
  TO authenticated WITH CHECK (
    user_id = auth.uid()
    OR is_room_owner(room_id, auth.uid())
  );

-- UPDATE: user can update their own row (privacy settings, leave), OR the
-- room owner can update (approve/reject, remove). No self-queries.
DROP POLICY IF EXISTS "members_update_self_or_owner" ON study_room_members;
CREATE POLICY "members_update_self_or_owner" ON study_room_members FOR UPDATE
  TO authenticated USING (
    user_id = auth.uid()
    OR is_room_owner(room_id, auth.uid())
  )
  WITH CHECK (
    user_id = auth.uid()
    OR is_room_owner(room_id, auth.uid())
  );

-- DELETE: user can delete their own row (leave), OR the owner can delete (remove).
DROP POLICY IF EXISTS "members_delete_self_or_owner" ON study_room_members;
CREATE POLICY "members_delete_self_or_owner" ON study_room_members FOR DELETE
  TO authenticated USING (
    user_id = auth.uid()
    OR is_room_owner(room_id, auth.uid())
  );

-- ─── Rewrite: study_room_invites (was querying study_rooms — safe but normalize) ─
DROP POLICY IF EXISTS "invites_select_invitee_or_owner" ON study_room_invites;
CREATE POLICY "invites_select_invitee_or_owner" ON study_room_invites FOR SELECT
  TO authenticated USING (
    invitee_user_id = auth.uid()
    OR is_room_owner(room_id, auth.uid())
  );

DROP POLICY IF EXISTS "invites_insert_owner" ON study_room_invites;
CREATE POLICY "invites_insert_owner" ON study_room_invites FOR INSERT
  TO authenticated WITH CHECK (is_room_owner(room_id, auth.uid()));

DROP POLICY IF EXISTS "invites_update_owner_or_invitee" ON study_room_invites;
CREATE POLICY "invites_update_owner_or_invitee" ON study_room_invites FOR UPDATE
  TO authenticated USING (
    invitee_user_id = auth.uid()
    OR is_room_owner(room_id, auth.uid())
  )
  WITH CHECK (
    invitee_user_id = auth.uid()
    OR is_room_owner(room_id, auth.uid())
  );

DROP POLICY IF EXISTS "invites_delete_owner" ON study_room_invites;
CREATE POLICY "invites_delete_owner" ON study_room_invites FOR DELETE
  TO authenticated USING (is_room_owner(room_id, auth.uid()));

-- ─── Rewrite: study_room_join_requests (normalize to helper) ─────────────────
DROP POLICY IF EXISTS "join_req_select_owner_or_self" ON study_room_join_requests;
CREATE POLICY "join_req_select_owner_or_self" ON study_room_join_requests FOR SELECT
  TO authenticated USING (
    user_id = auth.uid()
    OR is_room_owner(room_id, auth.uid())
  );

DROP POLICY IF EXISTS "join_req_insert_self" ON study_room_join_requests;
CREATE POLICY "join_req_insert_self" ON study_room_join_requests FOR INSERT
  TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "join_req_update_owner_or_self" ON study_room_join_requests;
CREATE POLICY "join_req_update_owner_or_self" ON study_room_join_requests FOR UPDATE
  TO authenticated USING (
    user_id = auth.uid()
    OR is_room_owner(room_id, auth.uid())
  )
  WITH CHECK (
    user_id = auth.uid()
    OR is_room_owner(room_id, auth.uid())
  );

DROP POLICY IF EXISTS "join_req_delete_owner_or_self" ON study_room_join_requests;
CREATE POLICY "join_req_delete_owner_or_self" ON study_room_join_requests FOR DELETE
  TO authenticated USING (
    user_id = auth.uid()
    OR is_room_owner(room_id, auth.uid())
  );

-- ─── Rewrite: shared_activity_summaries (was querying study_room_members) ─────
DROP POLICY IF EXISTS "shared_act_select_members" ON shared_activity_summaries;
CREATE POLICY "shared_act_select_members" ON shared_activity_summaries FOR SELECT
  TO authenticated USING (
    user_id = auth.uid()
    OR is_approved_member_or_owner(room_id, auth.uid())
  );

-- shared_act_insert_self, shared_act_update_self, shared_act_delete_self_or_owner
-- are fine but normalize the delete to use the helper.
DROP POLICY IF EXISTS "shared_act_delete_self_or_owner" ON shared_activity_summaries;
CREATE POLICY "shared_act_delete_self_or_owner" ON shared_activity_summaries FOR DELETE
  TO authenticated USING (
    user_id = auth.uid()
    OR is_room_owner(room_id, auth.uid())
  );

-- ─── room_notifications: already non-recursive, leave as-is ──────────────────
