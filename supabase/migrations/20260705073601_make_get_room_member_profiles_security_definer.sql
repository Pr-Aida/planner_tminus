-- Make get_room_member_profiles SECURITY DEFINER so it reliably bypasses
-- profiles RLS (which only allows reading your own profile). The function
-- already validates room access via _internal.is_approved_member_or_owner.
-- Returns only safe public identity fields: id, username, display_name, avatar_url.

CREATE OR REPLACE FUNCTION public.get_room_member_profiles(p_room_id uuid)
RETURNS TABLE(id uuid, username text, display_name text, avatar_url text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF NOT _internal.is_approved_member_or_owner(p_room_id, auth.uid()) THEN
    RAISE EXCEPTION 'Not an approved member of this room' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT p.id, p.username, p.display_name, p.avatar_url
  FROM profiles p
  WHERE p.id IN (
    SELECT user_id FROM study_room_members
    WHERE room_id = p_room_id
    AND status IN ('approved', 'pending', 'invited')
  )
  OR p.id IN (
    SELECT owner_id FROM study_rooms WHERE id = p_room_id
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_room_member_profiles(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_room_member_profiles(uuid) TO authenticated;
