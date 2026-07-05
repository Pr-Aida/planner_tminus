-- Create a safe resolver that fetches public profile fields by user IDs.
-- Used to resolve chat sender identities, pending requester profiles, etc.
-- Security:
--   - SECURITY DEFINER to bypass profiles RLS (which only allows reading your own profile)
--   - caller must be authenticated
--   - caller must be an approved member or owner of p_room_id
--   - only returns profiles for user_ids that are members (any status) of p_room_id or the room owner
--   - returns only safe public fields: id, username, display_name, avatar_url
--   - never returns email, is_admin, or private fields

CREATE OR REPLACE FUNCTION public.resolve_room_profiles(p_room_id uuid, p_user_ids uuid[])
RETURNS TABLE(id uuid, username text, display_name text, avatar_url text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_room_exists boolean;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF p_room_id IS NULL OR p_user_ids IS NULL OR array_length(p_user_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  -- Limit to 200 IDs to prevent abuse
  IF array_length(p_user_ids, 1) > 200 THEN
    RETURN;
  END IF;

  -- Verify the room exists
  SELECT EXISTS(SELECT 1 FROM study_rooms WHERE id = p_room_id) INTO v_room_exists;
  IF NOT v_room_exists THEN
    RETURN;
  END IF;

  -- Verify the caller is an approved member or owner of the room
  IF NOT _internal.is_approved_member_or_owner(p_room_id, v_caller) THEN
    RAISE EXCEPTION 'Not an approved member of this room' USING ERRCODE = '42501';
  END IF;

  -- Return profiles only for user_ids that are members of this room (any status) or the room owner
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
$function$;

REVOKE EXECUTE ON FUNCTION public.resolve_room_profiles(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_room_profiles(uuid, uuid[]) TO authenticated;
