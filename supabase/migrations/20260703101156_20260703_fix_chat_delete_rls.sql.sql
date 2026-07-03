/*
# Fix Chat Message Delete and Update RLS

## Issues
1. UPDATE policy only allows message sender to update their own message.
   But owner/admin should be able to soft-delete (UPDATE is_deleted) any message.
2. Need to allow message sender to delete their own message too.

## Fix
Add a new UPDATE policy that allows:
- Message sender to update their own message (existing)
- Room owner to soft-delete any message
- Room admin to soft-delete any message
*/

-- Drop existing UPDATE policy
DROP POLICY IF EXISTS "chat_update_own_message" ON room_chat_messages;

-- Create new policy that allows sender OR owner/admin
CREATE POLICY "chat_update_sender_or_owner_admin"
ON room_chat_messages FOR UPDATE
TO authenticated
USING (
  user_id = auth.uid()
  OR _internal.is_room_owner(room_id, auth.uid())
  OR EXISTS (
    SELECT 1 FROM study_room_members m
    WHERE m.room_id = room_chat_messages.room_id
    AND m.user_id = auth.uid()
    AND m.role = 'admin'
    AND m.status = 'approved'
  )
)
WITH CHECK (
  user_id = auth.uid()
  OR _internal.is_room_owner(room_id, auth.uid())
  OR EXISTS (
    SELECT 1 FROM study_room_members m
    WHERE m.room_id = room_chat_messages.room_id
    AND m.user_id = auth.uid()
    AND m.role = 'admin'
    AND m.status = 'approved'
  )
);

-- Also fix uploaded_files UPDATE policy to allow owner/admin of room to soft-delete attachments
DROP POLICY IF EXISTS "files_update_owner" ON uploaded_files;

CREATE POLICY "files_update_owner_or_room_admin"
ON uploaded_files FOR UPDATE
TO authenticated
USING (
  owner_user_id = auth.uid()
  OR (room_id IS NOT NULL AND (
    _internal.is_room_owner(room_id, auth.uid())
    OR EXISTS (
      SELECT 1 FROM study_room_members m
      WHERE m.room_id = uploaded_files.room_id
      AND m.user_id = auth.uid()
      AND m.role = 'admin'
      AND m.status = 'approved'
    )
  ))
)
WITH CHECK (
  owner_user_id = auth.uid()
  OR (room_id IS NOT NULL AND (
    _internal.is_room_owner(room_id, auth.uid())
    OR EXISTS (
      SELECT 1 FROM study_room_members m
      WHERE m.room_id = uploaded_files.room_id
      AND m.user_id = auth.uid()
      AND m.role = 'admin'
      AND m.status = 'approved'
    )
  ))
);