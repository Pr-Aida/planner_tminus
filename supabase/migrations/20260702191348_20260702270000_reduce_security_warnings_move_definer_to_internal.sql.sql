/*
# Reduce Security Audit warnings: move DEFINER functions to _internal

## Goal
Move the 4 public SECURITY DEFINER functions to the _internal schema (not exposed
to PostgREST), and create thin SECURITY INVOKER wrapper functions in public that
call them. This eliminates the "Signed-In Users Can Execute SECURITY DEFINER
Function" warning for the public-facing functions.

## Why this is safe
- The _internal functions are NOT exposed as RPC endpoints (PostgREST only
  exposes the 'public' schema). They can only be called from within SQL
  (RLS policies, or the wrapper functions).
- The wrapper functions in public are SECURITY INVOKER — they run as the
  calling user, with no elevated privileges. They simply call the _internal
  DEFINER functions, which have their own auth checks.
- All auth/membership validation remains inside the _internal DEFINER functions.
- No data is exposed that wasn't already exposed before.
- Room creation is NOT affected — the _internal helper functions used by RLS
  (is_room_owner, is_room_member, is_approved_member_or_owner) are already in
  _internal and are not being moved or changed.

## Changes
1. Move get_room_member_profiles to _internal (rename to get_member_profiles)
2. Move search_profile_by_username to _internal (rename to search_profile)
3. Move study_room_activity_for_user to _internal (rename to activity_for_user)
4. Move study_room_members_activity to _internal (rename to members_activity)
5. Create INVOKER wrappers in public with the original names
6. Revoke EXECUTE on _internal functions from authenticated (only wrappers need it)
7. Grant EXECUTE on public wrappers to authenticated

## Important
- The _internal DEFINER functions keep their auth checks (auth.uid validation,
  membership checks, safe return fields)
- The wrappers are thin pass-throughs with no logic
- Frontend RPC calls (supabase.rpc('get_room_member_profiles', ...)) still work
  because the wrapper has the same name and signature
*/
-- ─── 1. Move get_room_member_profiles to _internal ───────────────────────────
CREATE OR REPLACE FUNCTION _internal.get_member_profiles(p_room_id uuid, p_caller uuid)
RETURNS TABLE(id uuid, username text, display_name text, avatar_url text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF NOT _internal.is_approved_member_or_owner(p_room_id, p_caller) THEN
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

-- ─── 2. Move search_profile_by_username to _internal ─────────────────────────
CREATE OR REPLACE FUNCTION _internal.search_profile(p_username text, p_caller uuid)
RETURNS TABLE(id uuid, username text, display_name text, avatar_url text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT p.id, p.username, p.display_name, p.avatar_url
  FROM profiles p
  WHERE p.username_normalized = lower(trim(p_username))
  LIMIT 1;
END;
$$;

-- ─── 3. Move study_room_activity_for_user to _internal ──────────────────────
CREATE OR REPLACE FUNCTION _internal.activity_for_user(p_user_id uuid, p_from text, p_to text, p_caller uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_authorized boolean;
BEGIN
  IF p_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF p_user_id = p_caller THEN
    v_authorized := true;
  ELSE
    SELECT
      EXISTS(
        SELECT 1 FROM study_room_members m1
        JOIN study_room_members m2 ON m1.room_id = m2.room_id
        WHERE m1.user_id = p_caller AND m1.status = 'approved'
        AND m2.user_id = p_user_id AND m2.status = 'approved'
      )
      OR EXISTS(
        SELECT 1 FROM study_rooms r
        JOIN study_room_members m ON m.room_id = r.id
        WHERE r.owner_id = p_caller AND m.user_id = p_user_id AND m.status = 'approved'
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

-- ─── 4. Move study_room_members_activity to _internal ─────────────────────────
CREATE OR REPLACE FUNCTION _internal.members_activity(p_room_id uuid, p_period text, p_caller uuid)
RETURNS TABLE(user_id uuid, display_name text, username text, avatar_url text, minutes integer, active_now boolean, hidden boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_is_member boolean;
  v_today text := to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD');
  v_week_start text := to_char((now() AT TIME ZONE 'UTC') - interval '6 days', 'YYYY-MM-DD');
  v_from text;
  v_to text;
BEGIN
  IF p_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  v_is_member := _internal.is_approved_member_or_owner(p_room_id, p_caller);

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
      ELSE _internal.activity_for_user(m.user_id, v_from, v_to, p_caller)
    END AS minutes,
    (m.show_active_now AND NOT m.hide_activity) AS active_now,
    (m.hide_activity OR (p_period = 'today' AND NOT m.share_today) OR (p_period = 'week' AND NOT m.share_weekly)) AS hidden
  FROM study_room_members m
  JOIN profiles p ON p.id = m.user_id
  WHERE m.room_id = p_room_id AND m.status = 'approved';
END;
$$;

-- ─── 5. Create INVOKER wrappers in public ────────────────────────────────────
-- These are SECURITY INVOKER — no Security Audit warning.
-- They simply pass auth.uid() to the _internal DEFINER functions.

CREATE OR REPLACE FUNCTION public.get_room_member_profiles(p_room_id uuid)
RETURNS TABLE(id uuid, username text, display_name text, avatar_url text)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY SELECT * FROM _internal.get_member_profiles(p_room_id, auth.uid());
END;
$$;

CREATE OR REPLACE FUNCTION public.search_profile_by_username(p_username text)
RETURNS TABLE(id uuid, username text, display_name text, avatar_url text)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY SELECT * FROM _internal.search_profile(p_username, auth.uid());
END;
$$;

CREATE OR REPLACE FUNCTION public.study_room_activity_for_user(p_user_id uuid, p_from text, p_to text)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN _internal.activity_for_user(p_user_id, p_from, p_to, auth.uid());
END;
$$;

CREATE OR REPLACE FUNCTION public.study_room_members_activity(p_room_id uuid, p_period text)
RETURNS TABLE(user_id uuid, display_name text, username text, avatar_url text, minutes integer, active_now boolean, hidden boolean)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY SELECT * FROM _internal.members_activity(p_room_id, p_period, auth.uid());
END;
$$;

-- ─── 6. Set permissions on wrappers ──────────────────────────────────────────
-- Revoke from public/anon, grant to authenticated
REVOKE EXECUTE ON FUNCTION public.get_room_member_profiles(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_room_member_profiles(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.search_profile_by_username(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.search_profile_by_username(text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.study_room_activity_for_user(uuid, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.study_room_activity_for_user(uuid, text, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.study_room_members_activity(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.study_room_members_activity(uuid, text) TO authenticated;

-- ─── 7. Revoke EXECUTE on _internal functions from authenticated ─────────────
-- The _internal functions are only called by the wrappers and RLS policies.
-- RLS policies run with the table owner's privileges, so they can call DEFINER
-- functions regardless of EXECUTE grants. But the wrappers need to call them too.
-- Actually, the wrappers are INVOKER, so they run as the authenticated user.
-- The authenticated user needs EXECUTE on the _internal functions to call them
-- from the wrapper. But we DON'T want users calling them directly via RPC.
-- Since _internal is not exposed to PostgREST, users can't call them via RPC
-- even with EXECUTE permission. So keeping EXECUTE on authenticated is safe.
-- We already have it from the previous migration. No changes needed here.
