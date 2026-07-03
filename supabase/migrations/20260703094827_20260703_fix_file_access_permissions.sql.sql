/*
# Fix File Access Permissions

## Issues
1. EXECUTE on _internal.is_approved_member_or_owner was revoked from authenticated,
   but this function is called from RLS policies on uploaded_files and storage
   policies for room-chat-files. Without EXECUTE, the policies fail silently,
   blocking access for approved room members.

2. Storage policies for user-documents use (storage.foldername(name))[1] which
   correctly extracts the user_id. But for room-chat-files, (storage.foldername(name))[1]
   extracts the room_id correctly from the path format {room_id}/{message_id}/{file}-name.

## Fix
Grant EXECUTE on _internal membership functions to authenticated so RLS and
storage policies can execute them when evaluating access for authenticated users.
*/

-- Grant EXECUTE on _internal helper functions to authenticated
-- These are needed for RLS policies and storage policies to work
GRANT EXECUTE ON FUNCTION _internal.is_room_owner(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION _internal.is_room_member(uuid, uuid, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION _internal.is_approved_member_or_owner(uuid, uuid) TO authenticated;
