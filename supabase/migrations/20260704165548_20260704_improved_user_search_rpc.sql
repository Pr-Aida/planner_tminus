/*
# Improved user search RPC

## Changes
- Replaces the exact-match-only search with a partial match search
- Searches by both username AND display_name (case-insensitive)
- Minimum 2 characters required, maximum 10 results
- Returns only safe public fields: id, username, display_name, avatar_url
- Handles @ prefix automatically
- Auth required

## Security
- SECURITY DEFINER with auth check
- Only returns safe public profile fields
- No email or private data exposed
*/

-- Drop old function (parameter name changed from p_username to p_query)
DROP FUNCTION IF EXISTS public.search_profile_by_username(text);

CREATE FUNCTION public.search_profile_by_username(p_query text)
RETURNS TABLE(
  id uuid,
  username text,
  display_name text,
  avatar_url text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_query text;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  -- Trim and strip leading @
  v_query := lower(trim(p_query));
  IF v_query LIKE '@%' THEN
    v_query := trim(substring(v_query FROM 2));
  END IF;

  -- Minimum 2 characters
  IF length(v_query) < 2 THEN
    RETURN;
  END IF;

  -- Maximum 24 characters (username max length)
  IF length(v_query) > 24 THEN
    RETURN;
  END IF;

  -- Partial match on username_normalized OR display_name (case-insensitive)
  -- Limit to 10 results to prevent data dumping
  RETURN QUERY
  SELECT p.id, p.username, p.display_name, p.avatar_url
  FROM profiles p
  WHERE p.username_normalized LIKE v_query || '%'
     OR lower(p.display_name) LIKE '%' || v_query || '%'
  ORDER BY
    CASE
      WHEN p.username_normalized = v_query THEN 0
      WHEN p.username_normalized LIKE v_query || '%' THEN 1
      ELSE 2
    END,
    p.username_normalized
  LIMIT 10;
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_profile_by_username(text) TO authenticated;
