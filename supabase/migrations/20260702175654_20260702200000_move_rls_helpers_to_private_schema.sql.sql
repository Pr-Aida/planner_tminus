/*
# Security Audit Fix: Move RLS Helper Functions to Private Schema (retry)

Re-applies the move of is_room_owner, is_room_member, is_approved_member_or_owner
to _internal schema. Also updates shared_activity_summaries policies that reference
the old public functions. Same migration filename — safe to re-run.
*/
-- ─── Create private schema ───────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS _internal;
REVOKE ALL ON SCHEMA _internal FROM public, anon;

-- ─── (Re)create helper functions in _internal ────────────────────────────────
CREATE OR REPLACE FUNCTION _internal.is_room_owner(p_room_id uuid, p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (SELECT 1 FROM study_rooms r WHERE r.id = p_room_id AND r.owner_id = p_user_id);
$$;

CREATE OR REPLACE FUNCTION _internal.is_room_member(
  p_room_id uuid, p_user_id uuid, p_statuses text[] DEFAULT ARRAY['approved'::text]
)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM study_room_members m
    WHERE m.room_id = p_room_id AND m.user_id = p_user_id AND m.status = ANY(p_statuses)
  );
$$;

CREATE OR REPLACE FUNCTION _internal.is_approved_member_or_owner(p_room_id uuid, p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM study_room_members m WHERE m.room_id = p_room_id AND m.user_id = p_user_id AND m.status = 'approved'
  ) OR EXISTS (
    SELECT 1 FROM study_rooms r WHERE r.id = p_room_id AND r.owner_id = p_user_id
  );
$$;

REVOKE EXECUTE ON FUNCTION _internal.is_room_owner(uuid, uuid) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION _internal.is_room_member(uuid, uuid, text[]) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION _internal.is_approved_member_or_owner(uuid, uuid) FROM public, anon, authenticated;

-- ─── Update ALL policies that reference the old public functions ─────────────
-- study_rooms
DROP POLICY IF EXISTS "rooms_select_visible" ON study_rooms;
CREATE POLICY "rooms_select_visible" ON study_rooms FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR _internal.is_room_member(id, auth.uid(), ARRAY['pending','invited','approved']) OR invite_enabled = true);

DROP POLICY IF EXISTS "rooms_update_owner" ON study_rooms;
CREATE POLICY "rooms_update_owner" ON study_rooms FOR UPDATE TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid() OR _internal.is_room_member(id, owner_id, ARRAY['approved']));

-- study_room_members
DROP POLICY IF EXISTS "members_select_visible" ON study_room_members;
CREATE POLICY "members_select_visible" ON study_room_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR _internal.is_room_owner(room_id, auth.uid()) OR _internal.is_room_member(room_id, auth.uid(), ARRAY['approved']));

DROP POLICY IF EXISTS "members_insert_self_or_owner" ON study_room_members;
CREATE POLICY "members_insert_self_or_owner" ON study_room_members FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR _internal.is_room_owner(room_id, auth.uid()));

DROP POLICY IF EXISTS "members_update_self_or_owner" ON study_room_members;
CREATE POLICY "members_update_self_or_owner" ON study_room_members FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR _internal.is_room_owner(room_id, auth.uid()))
  WITH CHECK (user_id = auth.uid() OR _internal.is_room_owner(room_id, auth.uid()));

DROP POLICY IF EXISTS "members_delete_self_or_owner" ON study_room_members;
CREATE POLICY "members_delete_self_or_owner" ON study_room_members FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR _internal.is_room_owner(room_id, auth.uid()));

-- study_room_invites
DROP POLICY IF EXISTS "invites_select_invitee_or_owner" ON study_room_invites;
CREATE POLICY "invites_select_invitee_or_owner" ON study_room_invites FOR SELECT TO authenticated
  USING (invitee_user_id = auth.uid() OR _internal.is_room_owner(room_id, auth.uid()));

DROP POLICY IF EXISTS "invites_insert_owner" ON study_room_invites;
CREATE POLICY "invites_insert_owner" ON study_room_invites FOR INSERT TO authenticated
  WITH CHECK (_internal.is_room_owner(room_id, auth.uid()));

DROP POLICY IF EXISTS "invites_update_owner_or_invitee" ON study_room_invites;
CREATE POLICY "invites_update_owner_or_invitee" ON study_room_invites FOR UPDATE TO authenticated
  USING (invitee_user_id = auth.uid() OR _internal.is_room_owner(room_id, auth.uid()))
  WITH CHECK (invitee_user_id = auth.uid() OR _internal.is_room_owner(room_id, auth.uid()));

DROP POLICY IF EXISTS "invites_delete_owner" ON study_room_invites;
CREATE POLICY "invites_delete_owner" ON study_room_invites FOR DELETE TO authenticated
  USING (_internal.is_room_owner(room_id, auth.uid()));

-- study_room_join_requests
DROP POLICY IF EXISTS "join_req_select_owner_or_self" ON study_room_join_requests;
CREATE POLICY "join_req_select_owner_or_self" ON study_room_join_requests FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR _internal.is_room_owner(room_id, auth.uid()));

DROP POLICY IF EXISTS "join_req_insert_self" ON study_room_join_requests;
CREATE POLICY "join_req_insert_self" ON study_room_join_requests FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "join_req_update_owner_or_self" ON study_room_join_requests;
CREATE POLICY "join_req_update_owner_or_self" ON study_room_join_requests FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR _internal.is_room_owner(room_id, auth.uid()))
  WITH CHECK (user_id = auth.uid() OR _internal.is_room_owner(room_id, auth.uid()));

DROP POLICY IF EXISTS "join_req_delete_owner_or_self" ON study_room_join_requests;
CREATE POLICY "join_req_delete_owner_or_self" ON study_room_join_requests FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR _internal.is_room_owner(room_id, auth.uid()));

-- room_notifications
DROP POLICY IF EXISTS "notif_insert_scoped" ON room_notifications;
CREATE POLICY "notif_insert_scoped" ON room_notifications FOR INSERT TO authenticated
  WITH CHECK (
    (user_id = auth.uid())
    OR (_internal.is_room_owner(room_id, auth.uid()) AND (
      _internal.is_room_owner(room_id, user_id)
      OR _internal.is_room_member(room_id, user_id, ARRAY['approved','pending','invited','rejected','declined','left','removed'])
    ))
    OR (_internal.is_room_member(room_id, auth.uid(), ARRAY['approved','pending','invited']) AND _internal.is_room_owner(room_id, user_id))
  );

-- room_study_sessions
DROP POLICY IF EXISTS "sessions_select_approved_members" ON room_study_sessions;
CREATE POLICY "sessions_select_approved_members" ON room_study_sessions FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR _internal.is_room_member(room_id, auth.uid(), ARRAY['approved']));

DROP POLICY IF EXISTS "sessions_insert_own" ON room_study_sessions;
CREATE POLICY "sessions_insert_own" ON room_study_sessions FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND _internal.is_room_member(room_id, auth.uid(), ARRAY['approved']));

DROP POLICY IF EXISTS "sessions_delete_owner" ON room_study_sessions;
CREATE POLICY "sessions_delete_owner" ON room_study_sessions FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM study_rooms WHERE study_rooms.id = room_study_sessions.room_id AND study_rooms.owner_id = auth.uid()));

-- shared_activity_summaries
DROP POLICY IF EXISTS "shared_act_delete_self_or_owner" ON shared_activity_summaries;
CREATE POLICY "shared_act_delete_self_or_owner" ON shared_activity_summaries FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR _internal.is_room_owner(room_id, auth.uid()));

DROP POLICY IF EXISTS "shared_act_select_members" ON shared_activity_summaries;
CREATE POLICY "shared_act_select_members" ON shared_activity_summaries FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR _internal.is_approved_member_or_owner(room_id, auth.uid()));

-- ─── Drop old public helper functions ────────────────────────────────────────
DROP FUNCTION IF EXISTS public.is_room_owner(uuid, uuid);
DROP FUNCTION IF EXISTS public.is_room_member(uuid, uuid, text[]);
DROP FUNCTION IF EXISTS public.is_approved_member_or_owner(uuid, uuid);
