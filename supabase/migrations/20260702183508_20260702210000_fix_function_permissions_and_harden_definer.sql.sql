/*
# Security Audit Fix: Function Permissions + DEFINER Hardening

## Problem
The previous migration (move_rls_helpers_to_private_schema) revoked EXECUTE
on _internal functions from authenticated. But RLS policies run as the
authenticated user, so they couldn't call the functions — breaking room
creation, room listing, and member profile RPCs.

## Fix 1: Grant EXECUTE on _internal functions to authenticated
The _internal functions are SECURITY DEFINER, return only boolean, and take
explicit parameters. They cannot leak data — they only check membership.
Granting EXECUTE to authenticated is safe and required for RLS policies.
The _internal schema itself is not exposed to PostgREST (no RPC endpoint),
so these functions cannot be called directly by frontend code.

## Fix 2: Harden the 4 public DEFINER functions
All 4 functions already have:
- search_path = public, pg_temp
- auth.uid() validation
- room membership checks
- return only safe fields (id, username, display_name, avatar_url)

Additional hardening:
- Revoke EXECUTE from public and anon (only authenticated can call)
- search_profile_by_username: add auth.uid() check (was missing)
- get_room_member_profiles: update to call _internal.is_approved_member_or_owner
- study_room_members_activity: update to call _internal.is_approved_member_or_owner

## No data changes
No tables, columns, or data are modified. Only function permissions and bodies.
*/
-- ─── Fix 1: Grant EXECUTE on _internal functions to authenticated ─────────────
GRANT EXECUTE ON FUNCTION _internal.is_room_owner(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION _internal.is_room_member(uuid, uuid, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION _internal.is_approved_member_or_owner(uuid, uuid) TO authenticated;

-- Also grant USAGE on _internal schema to authenticated (needed to call functions)
GRANT USAGE ON SCHEMA _internal TO authenticated;

-- ─── Fix 2a: Harden get_room_member_profiles ─────────────────────────────────
-- Revoke from public/anon, keep authenticated
REVOKE EXECUTE ON FUNCTION public.get_room_member_profiles(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_room_member_profiles(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_room_member_profiles(p_room_id uuid)
RETURNS TABLE(id uuid, username text, display_name text, avatar_url text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF NOT _internal.is_approved_member_or_owner(p_room_id, v_caller) THEN
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

-- ─── Fix 2b: Harden search_profile_by_username ──────────────────────────────
-- Add auth.uid() check (was missing), convert to plpgsql for the check
REVOKE EXECUTE ON FUNCTION public.search_profile_by_username(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.search_profile_by_username(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.search_profile_by_username(p_username text)
RETURNS TABLE(id uuid, username text, display_name text, avatar_url text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT p.id, p.username, p.display_name, p.avatar_url
  FROM profiles p
  WHERE p.username_normalized = lower(trim(p_username))
  LIMIT 1;
END;
$$;

-- ─── Fix 2c: Harden study_room_activity_for_user ─────────────────────────────
-- Already has auth checks. Just revoke from public/anon.
REVOKE EXECUTE ON FUNCTION public.study_room_activity_for_user(uuid, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.study_room_activity_for_user(uuid, text, text) TO authenticated;

-- ─── Fix 2d: Harden study_room_members_activity ──────────────────────────────
-- Update to use _internal helper, revoke from public/anon
REVOKE EXECUTE ON FUNCTION public.study_room_members_activity(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.study_room_members_activity(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.study_room_members_activity(p_room_id uuid, p_period text)
RETURNS TABLE(user_id uuid, display_name text, username text, avatar_url text, minutes integer, active_now boolean, hidden boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_is_member boolean;
  v_today text := to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD');
  v_week_start text := to_char((now() AT TIME ZONE 'UTC') - interval '6 days', 'YYYY-MM-DD');
  v_from text;
  v_to text;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  -- Use _internal helper to avoid recursion
  v_is_member := _internal.is_approved_member_or_owner(p_room_id, v_caller);

  IF NOT v_is_member THEN
    RAISE EXCEPTION 'Not an approved member of this room' USING ERRCODE = '42501';
  END IF;

  IF p_period = 'today' THEN
    v_from := v_today; v_to := v_today;
  ELSIF p_period = 'week' THEN
    v_from := v_week_start; v_to := v_today;
  ELSE
    RAISE EXCEPTION 'Invalid period; use today or week' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT
    m.user_id,
    p.display_name,
    p.username,
    p.avatar_url,
    CASE
      WHEN m.hide_activity THEN 0
      WHEN p_period = 'today' AND NOT m.share_today THEN 0
      WHEN p_period = 'week' AND NOT m.share_weekly THEN 0
      ELSE study_room_activity_for_user(m.user_id, v_from, v_to)
    END AS minutes,
    (m.show_active_now AND NOT m.hide_activity) AS active_now,
    (m.hide_activity OR (p_period = 'today' AND NOT m.share_today) OR (p_period = 'week' AND NOT m.share_weekly)) AS hidden
  FROM study_room_members m
  JOIN profiles p ON p.id = m.user_id
  WHERE m.room_id = p_room_id AND m.status = 'approved';
END;
$$;
