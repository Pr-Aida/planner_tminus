/*
# Fix Security Definer View: public_profiles

## Problem
public_profiles was created with security_invoker = false, triggering the
"Security Definer View" audit warning.

## Solution
Drop the view entirely. Move the search logic directly into
_internal.search_profiles (SECURITY DEFINER) — the same pattern used for
get_room_member_profiles. The public wrapper search_profile_by_username stays
SECURITY INVOKER and calls _internal.search_profiles(p_query, auth.uid()).

## Why safe
- _internal schema is not exposed to PostgREST (no direct RPC endpoint)
- The DEFINER function returns only: id, username, display_name, avatar_url
- No email, is_admin, bio, recovery_email, or private fields
- auth.uid() validation + min/max length guards preserved
- Only authenticated users can call the public wrapper
- No Security Definer View warning remains
*/

-- ─── 1. Move search logic to _internal ────────────────────────────────────────
CREATE OR REPLACE FUNCTION _internal.search_profiles(p_query text, p_caller uuid)
RETURNS TABLE(id uuid, username text, display_name text, avatar_url text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_query text;
BEGIN
  IF p_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  v_query := lower(trim(p_query));
  IF v_query LIKE '@%' THEN
    v_query := trim(substring(v_query FROM 2));
  END IF;

  IF length(v_query) < 2 THEN
    RETURN;
  END IF;

  IF length(v_query) > 48 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT p.id, p.username, p.display_name, p.avatar_url
  FROM profiles p
  WHERE lower(p.username) LIKE '%' || v_query || '%'
     OR lower(p.display_name) LIKE '%' || v_query || '%'
  ORDER BY
    CASE
      WHEN lower(p.username) = v_query THEN 0
      WHEN lower(p.username) LIKE v_query || '%' THEN 1
      WHEN lower(p.display_name) = v_query THEN 2
      WHEN lower(p.display_name) LIKE v_query || '%' THEN 3
      ELSE 4
    END,
    p.username
  LIMIT 10;
END;
$$;

GRANT EXECUTE ON FUNCTION _internal.search_profiles(text, uuid) TO authenticated;

-- ─── 2. Update public wrapper to call _internal ────────────────────────────────
CREATE OR REPLACE FUNCTION public.search_profile_by_username(p_query text)
RETURNS TABLE(id uuid, username text, display_name text, avatar_url text)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY SELECT * FROM _internal.search_profiles(p_query, auth.uid());
END;
$$;

REVOKE EXECUTE ON FUNCTION public.search_profile_by_username(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_profile_by_username(text) TO authenticated;

-- ─── 3. Drop the Security Definer View ────────────────────────────────────────
DROP VIEW IF EXISTS public_profiles;