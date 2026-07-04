/*
# Allow chat message sender to delete their own messages

## Problem
The DELETE policy on room_chat_messages only allows room owner/admin to delete.
The frontend shows a delete button for the message sender too, but the RLS
blocks the actual delete. This causes "Failed to delete message" errors when
a regular member tries to delete their own message.

## Fix
Update the DELETE policy to allow:
- The message sender (user_id = auth.uid()) to delete their own messages
- Room owner to delete any message
- Room admin to delete any message

This matches the frontend behavior where the delete button is shown to the
sender OR owner/admin.
*/

DROP POLICY IF EXISTS "chat_delete_owner_or_admin" ON room_chat_messages;

CREATE POLICY "chat_delete_sender_or_owner_admin"
ON room_chat_messages FOR DELETE
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
);
