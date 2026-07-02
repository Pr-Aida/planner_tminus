/*
# Fix get_room_member_profiles to filter by room_id

- Ensure the RPC function correctly filters members by room_id
*/

CREATE OR REPLACE FUNCTION get_room_member_profiles(p_room_id uuid)
RETURNS TABLE (
  id uuid,
  username text,
  display_name text,
  avatar_url text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.username, p.display_name, p.avatar_url
  FROM profiles p
  WHERE p.id IN (
    SELECT user_id FROM study_room_members
    WHERE room_id = p_room_id
    AND status IN ('approved', 'pending', 'invited')
  );
$$;

GRANT EXECUTE ON FUNCTION get_room_member_profiles(uuid) TO authenticated;