/*
# Fix security warning: search_profile_by_username SECURITY DEFINER

## Solution
1. Create public_profiles VIEW exposing only safe public identity fields
   (id, username, display_name, avatar_url). security_invoker = false so it
   runs as owner, bypassing profiles RLS — safe because only public columns.
2. Convert search_profile_by_username to SECURITY INVOKER reading from the view.
3. Grant SELECT on view + EXECUTE on function to authenticated only.

## Safety
- Only id, username, display_name, avatar_url exposed (no email/is_admin/private)
- auth.uid() validation preserved
- min/max query length preserved
- LIMIT 10 preserved
- Study Room Members identity (get_room_member_profiles) unaffected
*/

-- ─── 1. Create public_profiles view ──────────────────────────────────────────
CREATE OR REPLACE VIEW public_profiles AS
SELECT
  id,
  username,
  display_name,
  avatar_url
FROM profiles;

ALTER VIEW public_profiles SET (security_invoker = false);

GRANT SELECT ON public_profiles TO authenticated;
REVOKE SELECT ON public_profiles FROM PUBLIC, anon;

-- ─── 2. Convert search_profile_by_username to SECURITY INVOKER ────────────────
CREATE OR REPLACE FUNCTION public.search_profile_by_username(p_query text)
RETURNS TABLE(id uuid, username text, display_name text, avatar_url text)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_query text;
BEGIN
  IF v_caller IS NULL THEN
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
  FROM public_profiles p
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

-- ─── 3. Set permissions on the function ───────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.search_profile_by_username(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_profile_by_username(text) TO authenticated;