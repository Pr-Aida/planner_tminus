-- Harden _internal.get_member_profiles: also include the room owner via owner_id
-- even if their member row is missing. Returns only safe public identity fields.
-- SECURITY DEFINER bypasses profiles RLS so approved room members can see each other.
-- Revoke from anon/public; only the SECURITY DEFINER context uses it internally.

CREATE OR REPLACE FUNCTION _internal.get_member_profiles(p_room_id uuid, p_caller uuid)
RETURNS TABLE(id uuid, username text, display_name text, avatar_url text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
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
    -- All members with an active status
    SELECT user_id FROM study_room_members
    WHERE room_id = p_room_id
    AND status IN ('approved', 'pending', 'invited')
  )
  OR p.id IN (
    -- Room owner (safety net in case owner member row is missing)
    SELECT owner_id FROM study_rooms WHERE id = p_room_id
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION _internal.get_member_profiles(uuid, uuid) FROM PUBLIC, anon;
