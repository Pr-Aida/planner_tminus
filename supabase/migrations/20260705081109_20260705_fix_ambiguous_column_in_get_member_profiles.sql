/*
# Fix ambiguous column reference in _internal.get_member_profiles

## Problem
The function RETURNS TABLE(id uuid, ...) creates a PL/pgSQL variable named `id`.
In the WHERE clause `WHERE id = p_room_id`, PostgreSQL cannot determine if `id`
refers to the output variable or `study_rooms.id`, causing:
  ERROR: 42702: column reference "id" is ambiguous

## Fix
Qualify all table references with aliases to remove ambiguity.
*/

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
    SELECT m.user_id FROM study_room_members m
    WHERE m.room_id = p_room_id
    AND m.status IN ('approved', 'pending', 'invited')
  )
  OR p.id IN (
    SELECT r.owner_id FROM study_rooms r WHERE r.id = p_room_id
  );
END;
$$;