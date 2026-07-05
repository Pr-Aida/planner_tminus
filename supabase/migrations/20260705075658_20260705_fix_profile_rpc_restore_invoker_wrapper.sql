-- Fix member identity regression: restore SECURITY INVOKER wrapper pattern
-- for get_room_member_profiles and resolve_room_profiles.
--
-- Root cause: migration 20260705073601 changed these functions to SECURITY DEFINER
-- and called auth.uid() internally. When SECURITY DEFINER runs as postgres,
-- auth.uid() returns NULL (JWT claims are set for the 'authenticated' role context,
-- not the 'postgres' superuser context). This caused is_approved_member_or_owner
-- to always fail → functions threw '42501' → all profiles empty → "Unknown user".
--
-- Fix: restore the SECURITY INVOKER wrapper pattern from migration 20260702191348.
-- The INVOKER wrapper evaluates auth.uid() while running as 'authenticated' (where
-- JWT claims are accessible), then passes the UUID to the SECURITY DEFINER internal
-- functions as an explicit parameter. The DEFINER functions read profiles as postgres
-- (bypassing RLS) using the explicitly-passed caller UUID for auth checks.

-- ─── 1. Grant EXECUTE on _internal.get_member_profiles to authenticated ────────
-- The INVOKER wrapper (running as authenticated) needs EXECUTE to call this.
-- The _internal schema is not exposed via PostgREST, so this cannot be abused.
GRANT EXECUTE ON FUNCTION _internal.get_member_profiles(uuid, uuid) TO authenticated;

-- ─── 2. Restore INVOKER wrapper for get_room_member_profiles ─────────────────
CREATE OR REPLACE FUNCTION public.get_room_member_profiles(p_room_id uuid)
RETURNS TABLE(id uuid, username text, display_name text, avatar_url text)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- auth.uid() is evaluated here in the INVOKER (authenticated) context where
  -- JWT claims are accessible. The UUID is passed explicitly to the DEFINER
  -- internal function, which uses it for auth checks and reads profiles as postgres.
  RETURN QUERY SELECT * FROM _internal.get_member_profiles(p_room_id, auth.uid());
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_room_member_profiles(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_room_member_profiles(uuid) TO authenticated;

-- ─── 3. Create _internal.resolve_profiles_for_room (DEFINER, explicit caller) ──
CREATE OR REPLACE FUNCTION _internal.resolve_profiles_for_room(
  p_room_id uuid,
  p_user_ids uuid[],
  p_caller uuid
)
RETURNS TABLE(id uuid, username text, display_name text, avatar_url text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF p_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF p_room_id IS NULL OR p_user_ids IS NULL OR array_length(p_user_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  IF array_length(p_user_ids, 1) > 200 THEN
    RETURN;
  END IF;

  IF NOT _internal.is_approved_member_or_owner(p_room_id, p_caller) THEN
    RAISE EXCEPTION 'Not an approved member of this room' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT p.id, p.username, p.display_name, p.avatar_url
  FROM profiles p
  WHERE p.id = ANY(p_user_ids)
    AND (
      p.id IN (
        SELECT user_id FROM study_room_members
        WHERE room_id = p_room_id
        AND status IN ('approved', 'pending', 'invited')
      )
      OR p.id IN (
        SELECT owner_id FROM study_rooms WHERE id = p_room_id
      )
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION _internal.resolve_profiles_for_room(uuid, uuid[], uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION _internal.resolve_profiles_for_room(uuid, uuid[], uuid) TO authenticated;

-- ─── 4. Restore INVOKER wrapper for resolve_room_profiles ─────────────────────
CREATE OR REPLACE FUNCTION public.resolve_room_profiles(p_room_id uuid, p_user_ids uuid[])
RETURNS TABLE(id uuid, username text, display_name text, avatar_url text)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  RETURN QUERY SELECT * FROM _internal.resolve_profiles_for_room(p_room_id, p_user_ids, auth.uid());
END;
$$;

REVOKE EXECUTE ON FUNCTION public.resolve_room_profiles(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_room_profiles(uuid, uuid[]) TO authenticated;
