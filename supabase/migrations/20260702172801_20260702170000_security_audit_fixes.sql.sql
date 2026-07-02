/*
# Security audit fixes: function search_path, RLS, storage, SECURITY DEFINER functions

## Overview
Addresses all Supabase Security Audit warnings without breaking authentication,
planner, Study Rooms, invite code/link, username search, room members, room timer,
or storage uploads.

## Changes

### 1. Function Search Path Mutable (set_updated_at, sync_username_normalized)
- Both trigger functions lacked a SET search_path, making them vulnerable to
  search_path manipulation.
- Fix: ALTER FUNCTION ... SET search_path = public, pg_temp (immutable, safe).
- No function body or trigger changes needed.

### 2. RLS Policy Always True (room_notifications.notif_insert_any)
- The INSERT policy used WITH CHECK (true), allowing any authenticated user
  to create notifications for any other user.
- Fix: Replace with a scoped policy that only allows:
  a) Self-notifications (user_id = auth.uid())
  b) Room owner notifying room members/associates
  c) Room members notifying the room owner
- Verified against all frontend notification insert paths:
  requestToJoin, approveMember, rejectMember, removeMember,
  inviteByUsername, acceptInvite.

### 3. Public Bucket Allows Listing (room-profiles)
- The room_profiles_read_all policy allowed any authenticated user to LIST all
  files in the room-profiles bucket.
- Fix: Replace with room-owner-only SELECT (for file management). Image display
  continues via public URLs (bucket remains public), so approved members and
  invite previews can still view images without listing.
- Also fixes a column-ambiguity bug in the INSERT/UPDATE/DELETE policies where
  study_rooms.name shadowed storage.objects.name inside the EXISTS subquery,
  causing storage.foldername() to be called on the room's display name instead
  of the object path. Rewritten to avoid the ambiguity entirely.

### 4. SECURITY DEFINER functions executable by public/anon
- All 8 SECURITY DEFINER functions had default PUBLIC execute grants, allowing
  unauthenticated (anon) users to call them.
- Fix: REVOKE EXECUTE FROM public, anon on all 8 functions; GRANT EXECUTE only
  to authenticated.
- Additional function-level security:
  - get_room_member_profiles: added authorization check (caller must be approved
    member or owner of the room). Previously returned member profiles for ANY
    room to ANY authenticated user.
  - study_room_activity_for_user: added authorization check (caller must be the
    user themselves, an approved co-member, or the room owner). Previously
    allowed any authenticated user to sum any other user's activity minutes.
  - get_room_by_invite_code: added invite_enabled check (only returns rooms with
    invites enabled, or rooms the caller owns/is a member of).
  - search_profile_by_username: updated search_path to include pg_temp.
  - Helper functions (is_room_owner, is_room_member, is_approved_member_or_owner):
    remain SECURITY DEFINER (needed to break RLS recursion), now authenticated-only.

## What is NOT changed
- No tables, columns, or column types are dropped or altered.
- No RLS is removed; existing policies on other tables remain unchanged.
- No frontend code changes required — all RPC signatures are unchanged.
- Bucket remains public for URL-based image display.
- Authentication, planner, Study Rooms, invites, timer, and storage uploads
  continue to work as before.

## Important Notes
1. study_room_activity_for_user is converted from LANGUAGE sql to LANGUAGE plpgsql
   to add an authorization check. Signature and return type are unchanged.
2. get_room_member_profiles is converted from LANGUAGE sql to LANGUAGE plpgsql
   to add an authorization check. Signature and return type are unchanged.
3. The room-profiles storage write policies are rewritten to fix a column-name
   ambiguity bug (study_rooms.name vs storage.objects.name).
4. The "Leaked Password Protection Disabled" warning is ignored as it requires
   Supabase Pro; standard Auth security and password hashing remain in place.
*/

-- ═══ 1. Fix function search_path ════════════════════════════════════════════
ALTER FUNCTION set_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION sync_username_normalized() SET search_path = public, pg_temp;

-- ═══ 2. Fix room_notifications INSERT policy ═══════════════════════════════
DROP POLICY IF EXISTS "notif_insert_any" ON room_notifications;
DROP POLICY IF EXISTS "notif_insert_scoped" ON room_notifications;

CREATE POLICY "notif_insert_scoped" ON room_notifications FOR INSERT
  TO authenticated WITH CHECK (
    -- Self-notification: user creates a notification for themselves
    user_id = auth.uid()
    -- OR: room owner notifies the room owner or any room associate
    OR (
      is_room_owner(room_id, auth.uid())
      AND (
        is_room_owner(room_id, user_id)
        OR is_room_member(room_id, user_id,
          ARRAY['approved','pending','invited','rejected','declined','left','removed']::text[])
      )
    )
    -- OR: room member notifies the room owner
    OR (
      is_room_member(room_id, auth.uid(), ARRAY['approved','pending','invited']::text[])
      AND is_room_owner(room_id, user_id)
    )
  );

-- ═══ 3. Fix room-profiles storage policies ═════════════════════════════════

-- Drop the broad SELECT policy that allowed listing all files
DROP POLICY IF EXISTS "room_profiles_read_all" ON storage.objects;

-- New restrictive SELECT: only room owners can list files in their room's folder
-- (needed for removeRoomProfileImage). Image display uses public URLs (bucket is public).
DROP POLICY IF EXISTS "room_profiles_select_owner" ON storage.objects;
CREATE POLICY "room_profiles_select_owner" ON storage.objects FOR SELECT
  TO authenticated USING (
    bucket_id = 'room-profiles'
    AND (storage.foldername(name))[1] IN (
      SELECT r.id::text FROM study_rooms r WHERE r.owner_id = auth.uid()
    )
  );

-- Rewrite INSERT to fix study_rooms.name vs storage.objects.name ambiguity
DROP POLICY IF EXISTS "room_profiles_insert_owner" ON storage.objects;
CREATE POLICY "room_profiles_insert_owner" ON storage.objects FOR INSERT
  TO authenticated WITH CHECK (
    bucket_id = 'room-profiles'
    AND (storage.foldername(name))[1] IN (
      SELECT r.id::text FROM study_rooms r WHERE r.owner_id = auth.uid()
    )
  );

-- Rewrite UPDATE to fix name ambiguity
DROP POLICY IF EXISTS "room_profiles_update_owner" ON storage.objects;
CREATE POLICY "room_profiles_update_owner" ON storage.objects FOR UPDATE
  TO authenticated USING (
    bucket_id = 'room-profiles'
    AND (storage.foldername(name))[1] IN (
      SELECT r.id::text FROM study_rooms r WHERE r.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    bucket_id = 'room-profiles'
    AND (storage.foldername(name))[1] IN (
      SELECT r.id::text FROM study_rooms r WHERE r.owner_id = auth.uid()
    )
  );

-- Rewrite DELETE to fix name ambiguity
DROP POLICY IF EXISTS "room_profiles_delete_owner" ON storage.objects;
CREATE POLICY "room_profiles_delete_owner" ON storage.objects FOR DELETE
  TO authenticated USING (
    bucket_id = 'room-profiles'
    AND (storage.foldername(name))[1] IN (
      SELECT r.id::text FROM study_rooms r WHERE r.owner_id = auth.uid()
    )
  );

-- ═══ 4. Fix SECURITY DEFINER functions ═════════════════════════════════════

-- 4a. study_room_activity_for_user: add authorization check
-- Convert from LANGUAGE sql to LANGUAGE plpgsql (requires DROP + CREATE)
DROP FUNCTION IF EXISTS study_room_activity_for_user(uuid, text, text);

CREATE OR REPLACE FUNCTION study_room_activity_for_user(
  p_user_id uuid,
  p_from text,
  p_to text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_authorized boolean;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF p_user_id = v_caller THEN
    v_authorized := true;
  ELSE
    SELECT
      EXISTS(
        SELECT 1 FROM study_room_members m1
        JOIN study_room_members m2 ON m1.room_id = m2.room_id
        WHERE m1.user_id = v_caller AND m1.status = 'approved'
          AND m2.user_id = p_user_id AND m2.status = 'approved'
      )
      OR EXISTS(
        SELECT 1 FROM study_rooms r
        JOIN study_room_members m ON m.room_id = r.id
        WHERE r.owner_id = v_caller AND m.user_id = p_user_id AND m.status = 'approved'
      )
    INTO v_authorized;
  END IF;

  IF NOT v_authorized THEN
    RAISE EXCEPTION 'Not authorized to view this activity' USING ERRCODE = '42501';
  END IF;

  RETURN (
    SELECT COALESCE(SUM(
      CASE
        WHEN (activity->>'from') IS NULL OR (activity->>'to') IS NULL THEN 0
        ELSE GREATEST(
          (
            (split_part(activity->>'to',':',1)::int * 60 + split_part(activity->>'to',':',2)::int)
            - (split_part(activity->>'from',':',1)::int * 60 + split_part(activity->>'from',':',2)::int)
          ), 0
        )
      END
    ), 0)::integer
    FROM planner_daily
    CROSS JOIN LATERAL jsonb_array_elements(activities) AS activity
    WHERE user_id = p_user_id
      AND date_key >= p_from
      AND date_key <= p_to
  );
END;
$$;

-- 4b. get_room_member_profiles: add authorization check
DROP FUNCTION IF EXISTS get_room_member_profiles(uuid);

CREATE OR REPLACE FUNCTION get_room_member_profiles(p_room_id uuid)
RETURNS TABLE (
  id uuid,
  username text,
  display_name text,
  avatar_url text
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF NOT is_approved_member_or_owner(p_room_id, v_caller) THEN
    RAISE EXCEPTION 'Not an approved member of this room' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT p.id, p.username, p.display_name, p.avatar_url
    FROM profiles p
    WHERE p.id IN (
      SELECT user_id FROM study_room_members
      WHERE room_id = p_room_id
      AND status IN ('approved', 'pending', 'invited')
    );
END;
$$;

-- 4c. get_room_by_invite_code: add invite_enabled check + update search_path
CREATE OR REPLACE FUNCTION get_room_by_invite_code(p_code text)
RETURNS TABLE (
  id uuid,
  owner_id uuid,
  name text,
  description text,
  avatar_url text,
  profile_image_url text,
  theme_color text,
  invite_code text,
  room_code text,
  invite_enabled boolean,
  leaderboard_enabled boolean,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT r.id, r.owner_id, r.name, r.description, r.avatar_url, r.profile_image_url,
         r.theme_color, r.invite_code, r.room_code, r.invite_enabled, r.leaderboard_enabled,
         r.created_at, r.updated_at
  FROM study_rooms r
  WHERE UPPER(r.invite_code) = UPPER(trim(p_code))
    AND (
      r.invite_enabled = true
      OR r.owner_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM study_room_members m
        WHERE m.room_id = r.id AND m.user_id = auth.uid()
          AND m.status IN ('pending','invited','approved')
      )
    );
$$;

-- 4d. search_profile_by_username: update search_path to include pg_temp
ALTER FUNCTION search_profile_by_username(text) SET search_path = public, pg_temp;

-- 4e. Revoke EXECUTE from public/anon on all 8 SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION is_room_owner(uuid, uuid) FROM public, anon;
REVOKE EXECUTE ON FUNCTION is_room_member(uuid, uuid, text[]) FROM public, anon;
REVOKE EXECUTE ON FUNCTION is_approved_member_or_owner(uuid, uuid) FROM public, anon;
REVOKE EXECUTE ON FUNCTION get_room_by_invite_code(text) FROM public, anon;
REVOKE EXECUTE ON FUNCTION get_room_member_profiles(uuid) FROM public, anon;
REVOKE EXECUTE ON FUNCTION search_profile_by_username(text) FROM public, anon;
REVOKE EXECUTE ON FUNCTION study_room_activity_for_user(uuid, text, text) FROM public, anon;
REVOKE EXECUTE ON FUNCTION study_room_members_activity(uuid, text) FROM public, anon;

-- 4f. Ensure authenticated still has EXECUTE
GRANT EXECUTE ON FUNCTION is_room_owner(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION is_room_member(uuid, uuid, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION is_approved_member_or_owner(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_room_by_invite_code(text) TO authenticated;
GRANT EXECUTE ON FUNCTION get_room_member_profiles(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION search_profile_by_username(text) TO authenticated;
GRANT EXECUTE ON FUNCTION study_room_activity_for_user(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION study_room_members_activity(uuid, text) TO authenticated;