-- Replace search_profile_by_username with a safer, substring-matching version.
-- Returns only safe public identity fields (id, username, display_name, avatar_url).
-- Never returns email, is_admin, or private fields.
-- Authenticated-only (anon cannot execute). SECURITY DEFINER to bypass profiles RLS
-- so users can find each other by username for room invites.
-- Limits to 10 results to prevent data dumping.

CREATE OR REPLACE FUNCTION public.search_profile_by_username(p_query text)
RETURNS TABLE(id uuid, username text, display_name text, avatar_url text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
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

  -- Substring match on username_lower OR display_name (case-insensitive).
  -- Prefix matches rank higher, exact match ranks highest.
  RETURN QUERY
  SELECT p.id, p.username, p.display_name, p.avatar_url
  FROM profiles p
  WHERE p.username_lower LIKE '%' || v_query || '%'
     OR lower(p.display_name) LIKE '%' || v_query || '%'
  ORDER BY
    CASE
      WHEN p.username_lower = v_query THEN 0
      WHEN p.username_lower LIKE v_query || '%' THEN 1
      WHEN lower(p.display_name) = v_query THEN 2
      WHEN lower(p.display_name) LIKE v_query || '%' THEN 3
      ELSE 4
    END,
    p.username_lower
  LIMIT 10;
END;
$function$;

-- Revoke from anon and public; only authenticated can execute.
REVOKE EXECUTE ON FUNCTION public.search_profile_by_username(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_profile_by_username(text) TO authenticated;
