/*
# Fix SECURITY DEFINER warnings for count_room_files and count_user_files

## Problem
Both functions are SECURITY DEFINER and executable by anon + authenticated.
Supabase security advisor flags this as a risk.

## Fix
1. Convert both functions to SECURITY INVOKER so they run as the calling user
   and respect RLS on uploaded_files.
2. Revoke EXECUTE from anon.
3. Grant EXECUTE only to authenticated.
4. count_user_files: uses auth.uid() — only counts the caller's own files.
5. count_room_files: validates that auth.uid() is an approved member/owner
   of the room before returning a count. Returns 0 for non-members.
*/

-- Revoke execute from anon and public
REVOKE EXECUTE ON FUNCTION public.count_user_files() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.count_room_files(uuid) FROM anon, public;

-- Re-grant only to authenticated
GRANT EXECUTE ON FUNCTION public.count_user_files() TO authenticated;
GRANT EXECUTE ON FUNCTION public.count_room_files(uuid) TO authenticated;

-- Convert count_user_files to SECURITY INVOKER (RLS will scope to own files)
CREATE OR REPLACE FUNCTION public.count_user_files()
RETURNS bigint LANGUAGE sql SECURITY INVOKER SET search_path = public, pg_temp
AS $$
  SELECT count(*) FROM uploaded_files
  WHERE owner_user_id = auth.uid()
  AND upload_context = 'personal_document'
  AND deleted_at IS NULL;
$$;

-- Convert count_room_files to SECURITY INVOKER with membership validation
CREATE OR REPLACE FUNCTION public.count_room_files(p_room_id uuid)
RETURNS bigint LANGUAGE sql SECURITY INVOKER SET search_path = public, pg_temp
AS $$
  SELECT count(*) FROM uploaded_files
  WHERE room_id = p_room_id
  AND upload_context = 'room_chat'
  AND deleted_at IS NULL
  -- Only return a count if the caller is an approved member/owner of the room
  AND EXISTS (
    SELECT 1 FROM study_room_members m
    WHERE m.room_id = p_room_id
    AND m.user_id = auth.uid()
    AND m.status = 'approved'
  ) OR EXISTS (
    SELECT 1 FROM study_rooms r
    WHERE r.id = p_room_id
    AND r.owner_id = auth.uid()
  );
$$;
