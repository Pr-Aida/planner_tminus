/*
# Add file count helper + realtime for uploaded_files

## Summary
1. Adds a SECURITY DEFINER RPC `count_user_files` that returns the number of
   non-deleted personal documents for the calling user. Used to enforce the
   50-file-per-user limit before upload.
2. Adds a SECURITY DEFINER RPC `count_room_files` that returns the number of
   non-deleted room chat files for a given room. Used to enforce the
   100-file-per-room limit.
3. Enables realtime on uploaded_files so the UI updates when files are added/deleted.

## Security
- Both functions run as SECURITY DEFINER with search_path pinned to public, pg_temp.
- count_user_files uses auth.uid() — no parameter tampering possible.
- count_room_files takes a room_id parameter; any authenticated user can call it
  but it only returns a count (integer), not file data. RLS on uploaded_files
  still protects actual file rows.
*/

CREATE OR REPLACE FUNCTION public.count_user_files()
RETURNS bigint LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT count(*) FROM uploaded_files
  WHERE owner_user_id = auth.uid()
  AND upload_context = 'personal_document'
  AND deleted_at IS NULL;
$$;
GRANT EXECUTE ON FUNCTION public.count_user_files() TO authenticated;

CREATE OR REPLACE FUNCTION public.count_room_files(p_room_id uuid)
RETURNS bigint LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT count(*) FROM uploaded_files
  WHERE room_id = p_room_id
  AND upload_context = 'room_chat'
  AND deleted_at IS NULL;
$$;
GRANT EXECUTE ON FUNCTION public.count_room_files(uuid) TO authenticated;

-- Enable realtime for uploaded_files
ALTER PUBLICATION supabase_realtime ADD TABLE uploaded_files;
